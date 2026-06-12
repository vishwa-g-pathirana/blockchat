import "./styles.css";
import { loadOrCreateIdentity, signMessage } from "./identity";

interface Tx {
  author: string;
  clientTs: number;
  data: string;
  signature: string;
}

const id = loadOrCreateIdentity();
const shortId = (a: string) => a.slice(0, 6).toLowerCase();
const NODE_KEY = "blockchat-node-url";
let node = localStorage.getItem(NODE_KEY) || "http://localhost:7001";

let confirmed: Tx[] = [];
const pending = new Map<string, Tx>(); // signature -> my submitted, not-yet-confirmed message

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/* ---------- DOM ---------- */
const app = document.getElementById("app")!;
app.innerHTML = `
  <div class="frame">
    <header class="bar">
      <div class="brand">▓▓ BlockChat <span class="sub">light&nbsp;node</span></div>
      <div class="me">your node id · <b>${shortId(id.author)}</b></div>
    </header>
    <div class="status" id="status">connecting…</div>
    <main class="feed" id="feed"></main>
    <form class="composer" id="composer">
      <input id="input" autocomplete="off" spellcheck="false"
             placeholder="type a message — it becomes a block on the chain…" />
      <button type="submit">send ▸</button>
    </form>
    <footer class="nodebar">
      <span>node</span>
      <input id="nodeurl" value="${esc(node)}" spellcheck="false" />
      <button id="setnode" type="button">connect</button>
    </footer>
  </div>`;

const feedEl = document.getElementById("feed")!;
const statusEl = document.getElementById("status")!;
const inputEl = document.getElementById("input") as HTMLInputElement;
const composerEl = document.getElementById("composer") as HTMLFormElement;
const nodeUrlEl = document.getElementById("nodeurl") as HTMLInputElement;

/* ---------- rendering ---------- */
function row(tx: Tx, state: "mining" | "confirmed"): string {
  const mine = tx.author === id.author ? " mine" : "";
  const tag = state === "mining" ? `<span class="tag mining">⛏ mining…</span>` : `<span class="tag ok">✓ on-chain</span>`;
  return `<div class="msg${mine}">
      <div class="who">${shortId(tx.author)}</div>
      <div class="bubble"><div class="text">${esc(tx.data)}</div>${tag}</div>
    </div>`;
}
function render() {
  const atBottom = feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight < 60;
  const confirmedSigs = new Set(confirmed.map((t) => t.signature));
  const mine = [...pending.values()].filter((t) => !confirmedSigs.has(t.signature));
  feedEl.innerHTML =
    confirmed.map((t) => row(t, "confirmed")).join("") + mine.map((t) => row(t, "mining")).join("");
  if (atBottom) feedEl.scrollTop = feedEl.scrollHeight;
}

/* ---------- talk to the node ---------- */
let es: EventSource | null = null;
function connect() {
  es?.close();
  statusEl.textContent = "connecting…";
  statusEl.className = "status";
  es = new EventSource(node + "/events");
  es.onopen = () => (statusEl.className = "status live");
  es.onmessage = (e) => {
    try {
      const { messages } = JSON.parse(e.data) as { messages: Tx[] };
      confirmed = messages;
      for (const m of messages) pending.delete(m.signature);
      render();
    } catch {
      /* ignore malformed frame */
    }
  };
  es.onerror = () => {
    statusEl.className = "status";
    statusEl.textContent = "reconnecting to node…";
  };
}

async function poll() {
  try {
    const s = await (await fetch(node + "/")).json();
    statusEl.textContent = `node ${s.name} · height ${s.height} · difficulty ${s.difficulty} · peers ${s.peers} · mempool ${s.pending}`;
  } catch {
    statusEl.textContent = "node offline — start a node, then reconnect";
    statusEl.className = "status";
  }
}

async function send(text: string) {
  const data = text.trim();
  if (!data) return;
  const clientTs = Date.now();
  const tx: Tx = { author: id.author, clientTs, data, signature: signMessage(id, clientTs, data) };
  pending.set(tx.signature, tx); // optimistic: show it mining immediately
  render();
  try {
    await fetch(node + "/tx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tx),
    });
  } catch {
    statusEl.textContent = "couldn't reach the node — is it running?";
  }
}

/* ---------- events ---------- */
composerEl.addEventListener("submit", (e) => {
  e.preventDefault();
  send(inputEl.value);
  inputEl.value = "";
});
document.getElementById("setnode")!.addEventListener("click", () => {
  node = nodeUrlEl.value.trim().replace(/\/$/, "");
  localStorage.setItem(NODE_KEY, node);
  confirmed = [];
  render();
  connect();
  poll();
});

connect();
poll();
setInterval(poll, 2500);
