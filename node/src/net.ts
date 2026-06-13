import { WebSocketServer, WebSocket } from "ws";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Chain } from "./chain";
import type { Tx, Block } from "./types";

/**
 * Gossip + discovery between full nodes. Every node runs this, relays new
 * transactions and blocks to its peers, and shares the peer addresses it knows
 * (peer exchange) so the network self-assembles into a mesh from just a seed or
 * two. Loops are prevented naturally — a node only forwards something it hadn't
 * already seen (the chain/mempool de-duplicate for us).
 */
type Msg =
  | { t: "getchain" }
  | { t: "chain"; blocks: Block[]; mempool?: Tx[] }
  | { t: "tx"; tx: Tx }
  | { t: "block"; block: Block }
  | { t: "peers"; urls: string[] };

export interface P2POpts {
  selfUrl?: string;   // how other nodes can reach us (for peer exchange) — an .onion when on Tor
  maxPeers?: number;
  torSocks?: string;  // e.g. "socks5h://127.0.0.1:9050" — routes ALL peer dials through Tor
  bindHost?: string;  // interface to listen on — "127.0.0.1" hides the node behind Tor only
  log?: (s: string) => void;
}

export class P2PNode {
  private wss?: WebSocketServer;
  private peers = new Set<WebSocket>();
  private outbound = new Map<string, WebSocket>(); // url -> socket (for dedupe + reconnect)
  private known = new Set<string>();               // every peer url we've heard of
  private selfUrl?: string;
  private maxPeers: number;
  private stopped = false;
  private log: (s: string) => void;
  private torAgent?: SocksProxyAgent; // when set, every outbound dial goes through Tor
  private bindHost: string;
  readonly tor: boolean;

  constructor(public chain: Chain, public port: number, opts: P2POpts = {}) {
    this.selfUrl = opts.selfUrl;
    this.maxPeers = opts.maxPeers ?? 25;
    this.log = opts.log ?? (() => {});
    this.torAgent = opts.torSocks ? new SocksProxyAgent(opts.torSocks) : undefined;
    this.tor = !!this.torAgent;
    this.bindHost = opts.bindHost ?? "0.0.0.0";
  }

  get peerCount(): number {
    return [...this.peers].filter((p) => p.readyState === WebSocket.OPEN).length;
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ host: this.bindHost, port: this.port, maxPayload: 1 << 20 }); // 1 MB frame cap
      this.wss.on("connection", (ws) => this.register(ws));
      this.wss.on("listening", () => {
        this.port = (this.wss!.address() as { port: number }).port;
        if (!this.selfUrl) this.selfUrl = `ws://localhost:${this.port}`;
        resolve();
      });
    });
  }

  /** Dial another node, deduped, with automatic reconnect. */
  connect(url: string) {
    if (this.stopped || url === this.selfUrl) return;
    this.known.add(url);
    if (this.outbound.has(url) || this.peerCount >= this.maxPeers) return;
    this.dial(url);
  }

  private dial(url: string) {
    // Through Tor, the SOCKS proxy (socks5h) resolves .onion addresses for us.
    const ws = this.torAgent ? new WebSocket(url, { agent: this.torAgent }) : new WebSocket(url);
    this.outbound.set(url, ws);
    ws.on("open", () => this.register(ws));
    ws.on("error", () => {});
    ws.on("close", () => {
      this.outbound.delete(url);
      if (!this.stopped) setTimeout(() => this.connect(url), 3000); // best-effort reconnect
    });
  }

  private register(ws: WebSocket) {
    this.peers.add(ws);
    ws.on("message", (d) => this.handle(ws, d.toString()));
    ws.on("close", () => this.peers.delete(ws));
    ws.on("error", () => this.peers.delete(ws));
    this.send(ws, { t: "getchain" });                                // sync chains
    this.send(ws, { t: "peers", urls: this.advertisedPeers() });     // share who we know
  }

  private advertisedPeers(): string[] {
    const urls = [...this.known];
    if (this.selfUrl) urls.push(this.selfUrl);
    return urls;
  }

  private send(ws: WebSocket, m: Msg) {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
  }

  broadcast(m: Msg, except?: WebSocket) {
    const raw = JSON.stringify(m);
    for (const ws of this.peers) if (ws !== except && ws.readyState === WebSocket.OPEN) ws.send(raw);
  }

  /** Submit a locally-created message: add it to the mempool and gossip it. */
  submitTx(tx: Tx): boolean {
    if (!this.chain.addTx(tx)) return false;
    this.broadcast({ t: "tx", tx });
    return true;
  }

  private handle(ws: WebSocket, raw: string) {
    let m: Msg;
    try {
      m = JSON.parse(raw) as Msg;
    } catch {
      return;
    }
    switch (m.t) {
      case "getchain":
        this.send(ws, { t: "chain", blocks: this.chain.getChain(), mempool: this.chain.pendingTxs() });
        break;

      case "chain":
        for (const b of m.blocks) this.chain.addBlock(b); // genesis-first → parents before children
        if (m.mempool) for (const tx of m.mempool) this.chain.addTx(tx);
        break;

      case "tx":
        if (this.chain.addTx(m.tx)) this.broadcast({ t: "tx", tx: m.tx }, ws);
        break;

      case "block": {
        const r = this.chain.addBlock(m.block);
        if (r === "orphan") this.send(ws, { t: "getchain" });
        else if (r !== "known" && r !== "invalid") this.broadcast({ t: "block", block: m.block }, ws);
        break;
      }

      case "peers":
        if (Array.isArray(m.urls)) {
          for (const url of m.urls.slice(0, 50)) {
            if (typeof url === "string" && url !== this.selfUrl && !this.known.has(url)) this.connect(url);
          }
        }
        break;
    }
  }

  stop() {
    this.stopped = true;
    for (const ws of this.peers) ws.terminate();
    this.wss?.close();
  }
}
