import { Server as IOServer, type Socket } from "socket.io";
import { EV, shortId, type Block as WireBlock, type NodeInfo, type MempoolPayload } from "@blockchat/shared";
import type { Chain } from "./chain";
import type { P2PNode } from "./net";

/**
 * A Socket.IO gateway that lets the existing browser app (the polished React
 * client) talk to a real full node WITHOUT changes. It speaks the client's
 * original protocol (EV.* events, one "block" per message) and translates to/
 * from the node's real chain: messages submitted here enter the mempool, get
 * mined with real proof-of-work, gossip to other full nodes, and the resulting
 * blocks are pushed back as the events the UI already understands. Browsers
 * connected here are tracked as "peers" for the Network dashboard, and their
 * WebRTC signaling is relayed for off-chain private chat — exactly like before.
 */
interface Peer {
  id: string;
  author: string;
  createdAt: number;
  lastSeen: number;
  sockets: Set<string>;
}

const GENESIS_TEXT = "BlockChat genesis — the chain starts here";

export class Gateway {
  private peers = new Map<string, Peer>();
  private emitted: WireBlock[];

  constructor(private io: IOServer, private chain: Chain, private net: P2PNode) {
    this.emitted = this.mapChain();
    io.on("connection", (s) => this.onConnection(s));
    setInterval(() => this.broadcastPeers(), 15_000); // keep live/idle/gone fresh
  }

  /** Flatten the node's real chain into the client's "one block per message" view. */
  private mapChain(): WireBlock[] {
    const nodeBlocks = this.chain.getChain();
    const g = nodeBlocks[0];
    const out: WireBlock[] = [
      {
        index: 0,
        timestamp: g.header.timestamp,
        author: "genesis",
        data: GENESIS_TEXT,
        clientTs: g.header.timestamp,
        nonce: g.header.nonce,
        prevHash: g.header.prevHash,
        hash: g.hash,
        signature: "genesis",
      },
    ];
    let index = 1;
    for (let i = 1; i < nodeBlocks.length; i++) {
      const b = nodeBlocks[i];
      for (const tx of b.txs) {
        out.push({
          index: index++,
          timestamp: b.header.timestamp,
          author: tx.author,
          data: tx.data,
          clientTs: tx.clientTs,
          nonce: b.header.nonce,
          prevHash: b.header.prevHash,
          hash: b.hash,
          signature: tx.signature,
        });
      }
    }
    return out;
  }

  private nodeInfos(): NodeInfo[] {
    const now = Date.now();
    const counts = new Map<string, number>();
    for (const b of this.emitted) if (b.author !== "genesis") counts.set(b.author, (counts.get(b.author) ?? 0) + 1);
    return [...this.peers.values()].map((p): NodeInfo => {
      const idle = now - p.lastSeen;
      const status: NodeInfo["status"] =
        p.sockets.size === 0 ? (idle > 120_000 ? "gone" : "idle") : idle > 60_000 ? "idle" : "live";
      return { id: p.id, author: p.author, createdAt: p.createdAt, lastSeen: p.lastSeen, msgCount: counts.get(p.author) ?? 0, status };
    });
  }

  private broadcastPeers() {
    this.io.emit(EV.peersUpdate, this.nodeInfos());
  }

  private mempoolPayload(): MempoolPayload {
    return {
      count: this.chain.pendingCount,
      txs: this.chain.pendingTxs().map((t) => ({ author: t.author, clientTs: t.clientTs, data: t.data })),
    };
  }

  /** Push the current mempool (pending, un-mined messages) to every browser. */
  emitMempool() {
    this.io.emit(EV.mempool, this.mempoolPayload());
  }

  /** Called whenever the node's chain advances — push new blocks (or resync) to browsers. */
  onChainChange() {
    const next = this.mapChain();
    const prev = this.emitted;
    const isExtension = next.length >= prev.length && prev.every((b, i) => next[i]?.signature === b.signature);
    this.emitted = next;
    if (isExtension) {
      for (const b of next.slice(prev.length)) this.io.emit(EV.blockNew, b);
    } else {
      this.io.emit(EV.chainInit, { chain: next }); // a reorg changed history → full resync
    }
    this.broadcastPeers();
  }

  private onConnection(socket: Socket) {
    socket.on(EV.hello, ({ author }: { author: string }) => {
      if (!author) return;
      let peer = this.peers.get(author);
      if (!peer) {
        peer = { id: shortId(author), author, createdAt: Date.now(), lastSeen: Date.now(), sockets: new Set() };
        this.peers.set(author, peer);
      }
      peer.sockets.add(socket.id);
      peer.lastSeen = Date.now();
      socket.data.author = author;
      socket.emit(EV.chainInit, { chain: this.mapChain() });
      socket.emit(EV.mempool, this.mempoolPayload());
      this.broadcastPeers();
    });

    socket.on(EV.newMessage, (p: { author: string; clientTs: number; data: string; signature: string }) => {
      if (!p?.author || !p.data?.trim() || !p.signature) return;
      const peer = this.peers.get(p.author);
      if (peer) peer.lastSeen = Date.now();
      // hands off to the real node: verify → mempool → mine → gossip. The mined
      // block comes back to every browser via onChainChange → EV.blockNew.
      this.net.submitTx({ author: p.author, clientTs: p.clientTs, data: p.data, signature: p.signature });
    });

    // relay WebRTC signaling between two browsers for off-chain private chat
    socket.on(EV.rtcSignal, ({ to, data }: { to: string; data: unknown }) => {
      const from: string | undefined = socket.data.author;
      if (!from || !to) return;
      const target = this.peers.get(to);
      if (!target || target.sockets.size === 0) {
        socket.emit(EV.rtcUnavailable, { to });
        return;
      }
      for (const sid of target.sockets) this.io.to(sid).emit(EV.rtcSignal, { from, data });
    });

    socket.on(EV.ping, () => {
      const author: string | undefined = socket.data.author;
      const peer = author ? this.peers.get(author) : undefined;
      if (peer) peer.lastSeen = Date.now();
    });

    socket.on("disconnect", () => {
      const author: string | undefined = socket.data.author;
      const peer = author ? this.peers.get(author) : undefined;
      if (peer) {
        peer.sockets.delete(socket.id);
        peer.lastSeen = Date.now();
      }
      this.broadcastPeers();
    });
  }
}
