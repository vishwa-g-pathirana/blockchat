import { createHash } from "node:crypto";
import nacl from "tweetnacl";
import { signedPayload, base64ToBytes, utf8 } from "@blockchat/shared";
import type { Tx, BlockHeader, Block } from "./types";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

/** Number of leading zero BITS in a hex hash — finer-grained than counting hex zeros. */
export function leadingZeroBits(hex: string): number {
  let bits = 0;
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (v === 0) {
      bits += 4;
      continue;
    }
    bits += Math.clz32(v) - 28; // clz32 of a 4-bit value (0..15) → 28..31; map to 0..3
    break;
  }
  return bits;
}

/** Does this hash satisfy the difficulty target? */
export const meetsDifficulty = (hash: string, difficulty: number): boolean =>
  leadingZeroBits(hash) >= difficulty;

/** The amount of work a block of a given difficulty represents (≈ expected hashes). */
export const workOf = (difficulty: number): bigint => 1n << BigInt(difficulty);

/** Deterministic string hashed to produce the block hash (identical on every node). */
export function canonicalHeader(h: BlockHeader): string {
  return `${h.index}|${h.prevHash}|${h.timestamp}|${h.difficulty}|${h.txRoot}|${h.miner}|${h.nonce}`;
}

/** Digest that binds a block's transactions to its header (a simple ordered commitment). */
export function hashTxs(txs: Tx[]): string {
  return sha256(txs.map((t) => `${t.author}|${t.clientTs}|${t.data}|${t.signature}`).join("\n"));
}

/** Verify a transaction's ed25519 signature over (author | clientTs | data). */
export function verifyTx(tx: Tx): boolean {
  try {
    return nacl.sign.detached.verify(
      utf8(signedPayload(tx.author, tx.clientTs, tx.data)),
      base64ToBytes(tx.signature),
      base64ToBytes(tx.author)
    );
  } catch {
    return false;
  }
}

/** Run proof-of-work: search for a nonce whose header hash meets `difficulty`. */
export function mine(base: Omit<BlockHeader, "nonce">): Block {
  let nonce = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const header: BlockHeader = { ...base, nonce };
    const hash = sha256(canonicalHeader(header));
    if (meetsDifficulty(hash, base.difficulty)) return { header, txs: [], hash };
    nonce++;
  }
}

/**
 * The genesis block — hardcoded and identical on every node, so all nodes share
 * the same root. It carries no transactions and no real work (difficulty 0).
 */
export const GENESIS_TIMESTAMP = 1_700_000_000_000;

export function makeGenesis(): Block {
  const header: BlockHeader = {
    index: 0,
    prevHash: "0".repeat(64),
    timestamp: GENESIS_TIMESTAMP,
    difficulty: 0,
    txRoot: hashTxs([]),
    miner: "",
    nonce: 0,
  };
  return { header, txs: [], hash: sha256(canonicalHeader(header)) };
}
