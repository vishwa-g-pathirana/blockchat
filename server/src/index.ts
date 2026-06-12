import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Server } from "socket.io";
import nacl from "tweetnacl";
import {
  EV,
  shortId,
  signedPayload,
  base64ToBytes,
  utf8,
  type NodeInfo,
  type HelloPayload,
  type NewMessagePayload,
  type ChainOfferPayload,
  type RtcSignalOut,
} from "@blockchat/shared";
import { Blockchain } from "./blockchain";

// SERVER_PORT wins locally (the preview harness injects PORT); PORT is what Render provides.
const PORT = Number(process.env.SERVER_PORT || process.env.PORT) || 3001;

// Persist the chain to a durable path. On hosts with an ephemeral disk (Glitch,
// Render free), point DB_PATH at a folder that survives restarts — on Glitch
// that's ".data/blockchat.db". If that disk is ever wiped, connected clients
// re-seed the chain from their IndexedDB replicas (see the chain:offer handler).
const DB_PATH = process.env.DB_PATH || "blockchat.db";
try {
  mkdirSync(dirname(DB_PATH), { recursive: true });
} catch {
  /* dir already exists or path has no dir component */
}
const chain = new Blockchain(DB_PATH);

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end(`BlockChat bootstrap node · height ${chain.head.index}\n`);
});
const io = new Server(httpServer, { cors: { origin: "*" } });

/** In-memory peer registry (resets on restart — fine for the prototype). */
interface Peer { id: string; author: string; createdAt: number; lastSeen: number; sockets: Set<string>; }
const peers = new Map<string, Peer>();

function nodeInfos(): NodeInfo[] {
  const now = Date.now();
  return [...peers.values()].map((p): NodeInfo => {
    const idleFor = now - p.lastSeen;
    let status: NodeInfo["status"];
    if (p.sockets.size === 0) status = idleFor > 120_000 ? "gone" : "idle";
    else status = idleFor > 60_000 ? "idle" : "live";
    return {
      id: p.id,
      author: p.author,
      createdAt: p.createdAt,
      lastSeen: p.lastSeen,
      msgCount: chain.msgCountByAuthor(p.author),
      status,
    };
  });
}
const broadcastPeers = () => io.emit(EV.peersUpdate, nodeInfos());

function verifyMessage(p: NewMessagePayload): boolean {
  try {
    return nacl.sign.detached.verify(
      utf8(signedPayload(p.author, p.clientTs, p.data)),
      base64ToBytes(p.signature),
      base64ToBytes(p.author)
    );
  } catch {
    return false;
  }
}

io.on("connection", (socket) => {
  socket.on(EV.hello, ({ author }: HelloPayload) => {
    if (!author) return;
    let peer = peers.get(author);
    if (!peer) {
      peer = { id: shortId(author), author, createdAt: Date.now(), lastSeen: Date.now(), sockets: new Set() };
      peers.set(author, peer);
    }
    peer.sockets.add(socket.id);
    peer.lastSeen = Date.now();
    socket.data.author = author;
    socket.emit(EV.chainInit, { chain: chain.chain });
    broadcastPeers();
  });

  socket.on(EV.newMessage, (payload: NewMessagePayload) => {
    if (!payload?.author || !payload.data?.trim() || !payload.signature) return;
    if (!verifyMessage(payload)) {
      console.warn("rejected message with bad signature from", shortId(payload.author));
      return;
    }
    const peer = peers.get(payload.author);
    if (peer) peer.lastSeen = Date.now();
    const block = chain.addMessageBlock(payload);
    io.emit(EV.blockNew, block);
    broadcastPeers();
  });

  // Recovery + merge: a client offers its local replica. We reconcile it with
  // ours — the longer valid chain becomes the backbone and any messages the
  // other branch was missing are replayed on top, so nothing is lost (even if
  // the offered chain is shorter but carries messages we never saw). Re-seed
  // everyone when the chain actually changed.
  socket.on(EV.chainOffer, ({ chain: offered }: ChainOfferPayload) => {
    if (!Array.isArray(offered) || offered.length === 0) return;
    if (chain.reconcile(offered)) {
      console.log(`↺ chain reconciled via ${shortId(socket.data.author ?? "?")} — height now ${chain.head.index}`);
      io.emit(EV.chainInit, { chain: chain.chain });
      broadcastPeers();
    }
  });

  // Relay WebRTC signaling between two peers, addressed by node author.
  // The server only forwards opaque SDP/ICE — it never sees decrypted DM content.
  socket.on(EV.rtcSignal, ({ to, data }: RtcSignalOut) => {
    const from: string | undefined = socket.data.author;
    if (!from || !to) return;
    const target = peers.get(to);
    if (!target || target.sockets.size === 0) {
      socket.emit(EV.rtcUnavailable, { to });
      return;
    }
    for (const sid of target.sockets) io.to(sid).emit(EV.rtcSignal, { from, data });
  });

  // heartbeat — keeps a connected node "live" instead of decaying to "idle"
  socket.on(EV.ping, () => {
    const author: string | undefined = socket.data.author;
    const peer = author ? peers.get(author) : undefined;
    if (peer) peer.lastSeen = Date.now();
  });

  socket.on("disconnect", () => {
    const author: string | undefined = socket.data.author;
    const peer = author ? peers.get(author) : undefined;
    if (peer) {
      peer.sockets.delete(socket.id);
      peer.lastSeen = Date.now();
    }
    broadcastPeers();
  });
});

// keep statuses (live/idle/gone) fresh even when nothing else happens
setInterval(broadcastPeers, 15_000);

httpServer.listen(PORT, () => {
  console.log(`⛓  BlockChat bootstrap node listening on :${PORT} — height ${chain.head.index}, difficulty ${chain.difficulty}`);
});
