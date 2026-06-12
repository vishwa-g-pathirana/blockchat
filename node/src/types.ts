/**
 * Core data model for the real BlockChat chain.
 *
 * A "transaction" here is just a signed chat message. Blocks batch many
 * transactions (like Bitcoin), carry their own proof-of-work difficulty in the
 * header (so difficulty can change and cumulative work is verifiable), and are
 * identified by the hash of their header.
 */

/** A signed chat message — the unit that flows through the mempool into blocks. */
export interface Tx {
  author: string;    // base64 ed25519 public key (the sender's identity)
  clientTs: number;  // sender's clock when signed — part of the signed payload
  data: string;      // the message text
  signature: string; // base64 ed25519 detached sig over signedPayload(author, clientTs, data)
}

/** Everything that is hashed + mined. `hash` is sha256 of the canonical header. */
export interface BlockHeader {
  index: number;      // height (genesis = 0)
  prevHash: string;   // hash of the parent block's header
  timestamp: number;  // miner's clock when the block was produced
  difficulty: number; // required leading zero BITS of the block hash (the PoW target)
  txRoot: string;     // digest binding the transactions to the header
  miner: string;      // base64 pubkey of the miner ("" for the genesis block)
  nonce: number;      // the proof-of-work answer
}

/** A full block: its mined header plus the transactions it commits. */
export interface Block {
  header: BlockHeader;
  txs: Tx[];
  hash: string; // sha256(canonicalHeader(header)) — must satisfy header.difficulty
}

/** How a node classifies a block it just received. */
export type AddResult =
  | "extended"   // appended to the current best tip
  | "reorg"      // a heavier branch won; the active chain was reorganized
  | "side"       // valid, stored, but not (yet) the heaviest chain
  | "orphan"     // parent unknown — stashed until the parent arrives
  | "known"      // already have it
  | "invalid";   // failed validation — rejected
