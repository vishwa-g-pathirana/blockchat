import nacl from "tweetnacl";
import { bytesToBase64, signedPayload, utf8 } from "@blockchat/shared";
import { Chain } from "./src/chain";
import { makeGenesis, leadingZeroBits, sha256, canonicalHeader, hashTxs } from "./src/pow";

const D = 8; // difficulty (leading zero bits) — low so the test mines fast, but real PoW
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

// --- All nodes share one genesis ---
ok(new Chain(D).tip.header.index === 0, "a node starts at the genesis block");
ok(new Chain(D).tipHash === makeGenesis().hash, "every node shares the same deterministic genesis");

// --- Two nodes mine INDEPENDENTLY, then converge on the heaviest chain ---
const A = new Chain(D);
const B = new Chain(D);
const m1 = tx("m1"), mExtra = tx("extra"), m2 = tx("m2");

A.addTx(m1); A.mineBlock();        // A block #1
A.addTx(mExtra); A.mineBlock();    // A block #2   → A is height 2 (heavier)
B.addTx(m2); B.mineBlock();        // B block #1   → B is height 1
ok(A.height === 2, "node A mined two blocks on its own (no central orderer)");
ok(B.height === 1, "node B independently mined one block");
ok(A.getChain().slice(1).every((b) => leadingZeroBits(b.hash) >= D), "every mined block satisfies real proof-of-work");

// B receives A's blocks by gossip and must adopt the heavier branch
for (const blk of A.getChain().slice(1)) B.addBlock(blk);
ok(B.tipHash === A.tipHash, "B converged on A's chain — MOST CUMULATIVE WORK wins");
ok(B.height === 2, "B reorganized to the heavier chain");

// --- The reorg must NOT lose B's orphaned message ---
const active = B.messages().map((t) => t.data);
ok(active.includes("m1") && active.includes("extra"), "A's messages are on the agreed chain");
ok(!active.includes("m2"), "B's block was orphaned, so m2 left the active chain…");
ok(B.pendingTxs().some((t) => t.data === "m2"), "…and m2 returned to B's mempool (nothing lost)");

// B re-mines the orphaned message on top of the winning chain
B.mineBlock();
ok(B.height === 3 && B.messages().some((t) => t.data === "m2"), "orphaned message was re-mined onto the winning chain");

// A now hears B's newer block and converges too — both nodes fully agree
for (const blk of B.getChain().slice(1)) A.addBlock(blk);
ok(A.tipHash === B.tipHash && A.height === 3, "both nodes independently reached the same chain");

// --- Security: confirmed messages can't be replayed ---
ok(A.addTx(m1) === false, "rejects a message that is already confirmed on-chain");

// --- Security: a block whose transactions don't match its txRoot is rejected ---
const src = new Chain(D); src.addTx(tx("hello"));
const realBlock = src.mineBlock()!;
const tamperedTxs = { ...realBlock, txs: [tx("evil")] }; // swapped txs, header/hash unchanged
ok(new Chain(D).addBlock(tamperedTxs) === "invalid", "rejects a block whose txs don't match its committed txRoot");

// --- Security: a block that doesn't satisfy its difficulty is rejected ---
const g = makeGenesis().hash;
let n = 0, hdr, hsh;
do {
  hdr = { index: 1, prevHash: g, timestamp: Date.now(), difficulty: D, txRoot: hashTxs([]), miner: "", nonce: n++ };
  hsh = sha256(canonicalHeader(hdr));
} while (leadingZeroBits(hsh) >= D);
ok(new Chain(D).addBlock({ header: hdr, txs: [], hash: hsh }) === "invalid", "rejects a block that fails its proof-of-work");

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
