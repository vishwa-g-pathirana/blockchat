import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import nacl from "tweetnacl";
import { bytesToBase64, signedPayload, utf8 } from "@blockchat/shared";
import { Chain } from "./src/chain";
import { saveChain, loadChain } from "./src/store";
import { mine as powMine, hashTxs } from "./src/pow";

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

// --- Difficulty adjustment: fast blocks should make the next window harder ---
// base 6 bits, retarget every 4 blocks, target a huge block time so our instant
// mining is "too fast" → difficulty must step up at the boundary (height 8).
const cfg = { retargetInterval: 4, targetBlockMs: 100_000 };
const c = new Chain(6, cfg);
for (let i = 1; i <= 8; i++) {
  c.addTx(tx(`m${i}`));
  ok(c.mineBlock("x") !== null, `mined block #${i}`);
}
const chain = c.getChain();
ok(chain.slice(1, 8).every((b) => b.header.difficulty === 6), "difficulty held at base (6) through the first windows");
ok(chain[8].header.difficulty === 7, "difficulty retargeted UP to 7 after a window of too-fast blocks");

// a block that uses the wrong (too-easy) difficulty must be rejected
const parent7 = chain[7];
const txs = [tx("sneaky")];
const base = { index: 8, prevHash: parent7.hash, timestamp: Date.now(), difficulty: 6, txRoot: hashTxs(txs), miner: "x" };
const m = powMine(base);
ok(c.addBlock({ header: m.header, txs, hash: m.hash }) === "invalid", "rejects a block that uses the wrong difficulty");

// --- Persistence: save to disk, reload into a fresh node, identical chain ---
const dir = mkdtempSync(join(tmpdir(), "blockchat-p4-"));
const path = join(dir, "chain.json");
saveChain(path, c.getChain());
const reloaded = new Chain(6, cfg);
for (const b of loadChain(path)) reloaded.addBlock(b);
ok(reloaded.tipHash === c.tipHash, "chain persisted to disk and reloaded to the exact same tip");
ok(reloaded.height === c.height, "reloaded to the same height");
ok(reloaded.messages().length === c.messages().length, "every message survived a save + reload");

// --- Hardening: oversized messages are rejected ---
ok(c.addTx(tx("x".repeat(2001))) === false, "rejects an oversized (>2000 char) message");
ok(c.addTx(tx("ok")) === true, "still accepts a normal message");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
