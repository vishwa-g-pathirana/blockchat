import { createServer, type ServerResponse } from "node:http";
import { Server as IOServer } from "socket.io";
import { Chain } from "./chain";
import { P2PNode } from "./net";
import { Miner } from "./miner";
import { Gateway } from "./gateway";
import { saveChain, loadChain } from "./store";
import type { Tx } from "./types";

/* ---- config from env ---- */
const NAME = process.env.NAME || `node-${process.pid}`;
const P2P_PORT = Number(process.env.P2P_PORT || 6001);
const HTTP_PORT = Number(process.env.HTTP_PORT || 7001);
const DIFFICULTY = Number(process.env.DIFFICULTY || 18);
const PEERS = (process.env.PEERS || "").split(",").map((s) => s.trim()).filter(Boolean);
const SELF_URL = process.env.P2P_URL || `ws://localhost:${P2P_PORT}`;
const DATA_FILE = process.env.DATA_FILE || `node-data/${NAME}.json`;
// Set TOR_SOCKS (e.g. socks5h://127.0.0.1:9050) to route all peer traffic over Tor.
const TOR_SOCKS = process.env.TOR_SOCKS || "";

const chain = new Chain(DIFFICULTY);
const net = new P2PNode(chain, P2P_PORT, { selfUrl: SELF_URL, torSocks: TOR_SOCKS || undefined });
const miner = new Miner(chain, net, NAME, (b) =>
  console.log(`⛏  ${NAME} mined block #${b.header.index} (${b.txs.length} msg) diff ${b.header.difficulty} ${b.hash.slice(0, 10)}…`)
);

/* ---- reload persisted chain ---- */
const persisted = loadChain(DATA_FILE);
for (const b of persisted) chain.addBlock(b);
if (persisted.length > 1) console.log(`↺ ${NAME} reloaded chain to height ${chain.height} from ${DATA_FILE}`);

/* ---- live updates to light clients (Server-Sent Events) ---- */
const sseClients = new Set<ServerResponse>();
const chainPayload = () => JSON.stringify({ height: chain.height, messages: chain.messages() });
function pushSSE() {
  const data = `data: ${chainPayload()}\n\n`;
  for (const res of sseClients) res.write(data);
}

/* ---- light-client HTTP API ---- */
const http = createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();

  if (req.url === "/events") {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`data: ${chainPayload()}\n\n`);
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && req.url === "/tx") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        res.end(JSON.stringify({ ok: net.submitTx(JSON.parse(body) as Tx) }));
      } catch {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: "bad json" }));
      }
    });
    return;
  }
  if (req.url === "/chain") return void res.end(chainPayload());
  res.end(
    JSON.stringify({
      name: NAME,
      height: chain.height,
      difficulty: chain.nextDifficulty(),
      work: String(chain.totalWork),
      peers: net.peerCount,
      pending: chain.pendingCount,
      tip: chain.tipHash.slice(0, 12),
    })
  );
});

/* ---- Socket.IO gateway: serves the original browser app on the real chain ---- */
const io = new IOServer(http, { cors: { origin: "*" } });
const gateway = new Gateway(io, chain, net);

/* persist + push to SSE clients + push to the browser app whenever the chain advances */
chain.onChange = () => {
  saveChain(DATA_FILE, chain.getChain());
  pushSSE();
  gateway.onChainChange();
};
chain.onMempool = () => gateway.emitMempool();

await net.start();
for (const url of PEERS) net.connect(url);
miner.start();

http.listen(HTTP_PORT, () =>
  console.log(
    `🌐 ${NAME}: p2p:${net.port} http:${HTTP_PORT} (REST + Socket.IO) difficulty:${DIFFICULTY}` +
      `${net.tor ? " 🧅 Tor:ON" : ""} self:${SELF_URL} peers:[${PEERS.join(", ")}]`
  )
);

setInterval(
  () =>
    console.log(
      `📊 ${NAME} h=${chain.height} work=${chain.totalWork} peers=${net.peerCount} mempool=${chain.pendingCount} tip=${chain.tipHash.slice(0, 10)}`
    ),
  3000
);
