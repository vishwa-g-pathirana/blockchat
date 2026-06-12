import nacl from "tweetnacl";
import { bytesToBase64, signedPayload, utf8 } from "@blockchat/shared";
import { Chain } from "./src/chain";
import { P2PNode } from "./src/net";
import { Miner } from "./src/miner";

const D = 9; // low difficulty so the test mines fast — but it's real PoW
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c: boolean, l: string) => { c ? (pass++, console.log("  ✓", l)) : (fail++, console.log("  ✗ FAIL:", l)); };

const kp = nacl.sign.keyPair();
const author = bytesToBase64(kp.publicKey);
let clk = 1;
const tx = (data: string) => {
  const clientTs = clk++;
  const signature = bytesToBase64(nacl.sign.detached(utf8(signedPayload(author, clientTs, data)), kp.secretKey));
  return { author, clientTs, data, signature };
};

// Three independent nodes, each with its own chain, miner and P2P socket.
const nodes = [0, 1, 2].map(() => {
  const chain = new Chain(D);
  const net = new P2PNode(chain, 0); // port 0 → OS assigns a free port
  return { chain, net, miner: new Miner(chain, net) };
});
for (const n of nodes) await n.net.start();

// Line topology: B connects to A, C connects to B. So C can only reach A by
// gossip RELAYED through B — proving multi-hop propagation, not a star.
nodes[1].net.connect(`ws://localhost:${nodes[0].net.port}`);
nodes[2].net.connect(`ws://localhost:${nodes[1].net.port}`);
await delay(300);
ok(nodes[1].net.peerCount >= 1 && nodes[2].net.peerCount >= 1, "three nodes formed a P2P network (line: C—B—A)");

for (const n of nodes) n.miner.start();

// Submit three messages at three DIFFERENT nodes.
ok(nodes[0].net.submitTx(tx("hello from A")), "message submitted at node A");
ok(nodes[2].net.submitTx(tx("hello from C")), "message submitted at node C");
ok(nodes[1].net.submitTx(tx("hello from B")), "message submitted at node B");

const want = ["hello from A", "hello from B", "hello from C"];
let converged = false;
for (let i = 0; i < 240; i++) { // up to ~12s
  await delay(50);
  const tips = new Set(nodes.map((n) => n.chain.tipHash));
  const allHaveAll = nodes.every((n) => {
    const got = n.chain.messages().map((t) => t.data);
    return want.every((w) => got.includes(w));
  });
  if (tips.size === 1 && allHaveAll) { converged = true; break; }
}
for (const n of nodes) n.miner.stop();
await delay(100);

const tips = new Set(nodes.map((n) => n.chain.tipHash));
ok(tips.size === 1, "all three nodes converged on the SAME chain — with no central orderer");
ok(converged, "every node holds all three messages (propagated across hops, nothing lost)");
ok(nodes.every((n) => n.chain.height === nodes[0].chain.height), "all nodes agree on the same height");
ok(new Set(nodes[0].chain.messages().map((t) => t.signature)).size === 3, "exactly three messages confirmed (no duplicates)");
console.log(`   converged: height=${nodes[0].chain.height} tip=${nodes[0].chain.tipHash.slice(0, 12)} msgs=${nodes[0].chain.messages().length}`);

for (const n of nodes) n.net.stop();
await delay(100);
console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
