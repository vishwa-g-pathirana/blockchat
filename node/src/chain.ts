import {
  sha256,
  canonicalHeader,
  hashTxs,
  meetsDifficulty,
  workOf,
  verifyTx,
  mine,
  makeGenesis,
} from "./pow";
import type { Tx, Block, BlockHeader, AddResult } from "./types";

const MAX_TXS_PER_BLOCK = 50;
const MAX_MSG_LEN = 2000; // reject oversized messages (basic DoS hardening)

/**
 * A node's view of the chain. There is NO central orderer: any node may mine,
 * blocks gossip between nodes, and every node independently converges on the
 * branch with the most cumulative proof-of-work (Nakamoto consensus). When a
 * heavier branch wins, the active chain is reorganized and the transactions
 * from the abandoned blocks flow back into the mempool to be re-mined — so no
 * message is lost.
 */
export class Chain {
  readonly difficulty: number;        // base / minimum difficulty
  readonly retargetInterval: number;  // recompute difficulty every N blocks
  readonly targetBlockMs: number;     // desired time between blocks
  onChange?: () => void;              // fired whenever the active tip moves
  onMempool?: () => void;            // fired whenever the set of pending txs changes
  private blocks = new Map<string, Block>();      // hash -> block
  private cumWork = new Map<string, bigint>();    // hash -> total work from genesis to here
  private orphans = new Map<string, Block[]>();    // missingParentHash -> blocks waiting
  private mempool = new Map<string, Tx>();         // signature -> pending tx
  tipHash: string;

  constructor(difficulty = 16, opts: { retargetInterval?: number; targetBlockMs?: number } = {}) {
    this.difficulty = difficulty;
    this.retargetInterval = opts.retargetInterval ?? 20;
    this.targetBlockMs = opts.targetBlockMs ?? 5000;
    const genesis = makeGenesis();
    this.blocks.set(genesis.hash, genesis);
    this.cumWork.set(genesis.hash, 0n);
    this.tipHash = genesis.hash;
  }

  /* ---------- difficulty retargeting ---------- */

  private ancestorAtHeight(fromHash: string, height: number): Block | undefined {
    let cur = this.blocks.get(fromHash);
    while (cur && cur.header.index > height) cur = this.blocks.get(cur.header.prevHash);
    return cur && cur.header.index === height ? cur : undefined;
  }

  /**
   * The difficulty a block built on `parent` must carry. Constant within each
   * retarget window; at a window boundary it adjusts ±1 bit based on how the
   * last window's real block time compared to the target — so the chain keeps a
   * roughly steady block rate as miners come and go (like Bitcoin's retarget).
   */
  difficultyForChild(parent: Block): number {
    const h = parent.header.index + 1;
    if (h <= this.retargetInterval) return this.difficulty;            // first window: base
    if (h % this.retargetInterval !== 0) return parent.header.difficulty; // mid-window: carry
    const windowStart = this.ancestorAtHeight(parent.hash, h - this.retargetInterval);
    if (!windowStart) return parent.header.difficulty;
    const actual = parent.header.timestamp - windowStart.header.timestamp;
    const expected = this.retargetInterval * this.targetBlockMs;
    let d = parent.header.difficulty;
    if (actual < expected / 2) d += 1;                              // too fast → harder
    else if (actual > expected * 2) d = Math.max(this.difficulty, d - 1); // too slow → easier
    return d;
  }

  /** Difficulty the next mined block must use. */
  nextDifficulty(): number {
    return this.difficultyForChild(this.tip);
  }

  /* ---------- read helpers ---------- */

  get tip(): Block {
    return this.blocks.get(this.tipHash)!;
  }
  get height(): number {
    return this.tip.header.index;
  }
  get totalWork(): bigint {
    return this.cumWork.get(this.tipHash)!;
  }
  get pendingCount(): number {
    return this.mempool.size;
  }

  /** The active chain (genesis → tip), or genesis → `hash` if given. */
  getChain(hash = this.tipHash): Block[] {
    const out: Block[] = [];
    let cur: Block | undefined = this.blocks.get(hash);
    while (cur) {
      out.push(cur);
      if (cur.header.index === 0) break;
      cur = this.blocks.get(cur.header.prevHash);
    }
    return out.reverse();
  }

  /** Every message currently committed on the active chain, oldest → newest. */
  messages(): Tx[] {
    return this.getChain().flatMap((b) => b.txs);
  }

  private txSigsInAncestry(hash: string): Set<string> {
    const set = new Set<string>();
    for (const b of this.getChain(hash)) for (const t of b.txs) set.add(t.signature);
    return set;
  }

  /* ---------- mempool ---------- */

  /** Accept a signed message into the mempool (verified + de-duplicated). */
  addTx(tx: Tx): boolean {
    if (!tx?.signature || !tx.data?.trim() || tx.data.length > MAX_MSG_LEN || !verifyTx(tx)) return false;
    if (this.mempool.has(tx.signature)) return false;
    if (this.txSigsInAncestry(this.tipHash).has(tx.signature)) return false; // already confirmed
    this.mempool.set(tx.signature, tx);
    this.onMempool?.();
    return true;
  }

  pendingTxs(): Tx[] {
    return [...this.mempool.values()];
  }

  /* ---------- mining ---------- */

  /** Assemble pending transactions into a block, mine it on top of the tip, and add it. */
  mineBlock(miner = ""): Block | null {
    const txs = this.pendingTxs().slice(0, MAX_TXS_PER_BLOCK);
    const parent = this.tip;
    const base: Omit<BlockHeader, "nonce"> = {
      index: parent.header.index + 1,
      prevHash: parent.hash,
      timestamp: Date.now(),
      difficulty: this.difficultyForChild(parent),
      txRoot: hashTxs(txs),
      miner,
    };
    const mined = mine(base);
    const block: Block = { header: mined.header, txs, hash: mined.hash };
    return this.addBlock(block) === "invalid" ? null : block;
  }

  /* ---------- validation ---------- */

  private validateBlock(block: Block, parent: Block): boolean {
    const h = block.header;
    if (block.hash !== sha256(canonicalHeader(h))) return false;
    if (!meetsDifficulty(block.hash, h.difficulty)) return false;
    if (h.difficulty !== this.difficultyForChild(parent)) return false; // must use the retargeted difficulty
    if (h.index !== parent.header.index + 1) return false;
    if (h.prevHash !== parent.hash) return false;
    if (h.txRoot !== hashTxs(block.txs)) return false;

    const seen = new Set<string>();
    const confirmed = this.txSigsInAncestry(parent.hash);
    for (const t of block.txs) {
      if (!verifyTx(t)) return false;            // every message must be authentically signed
      if (seen.has(t.signature)) return false;   // no duplicate tx within the block
      if (confirmed.has(t.signature)) return false; // no replay of an already-confirmed message
      seen.add(t.signature);
    }
    return true;
  }

  /* ---------- adding blocks (the consensus step) ---------- */

  addBlock(block: Block): AddResult {
    if (this.blocks.has(block.hash)) return "known";

    const parent = this.blocks.get(block.header.prevHash);
    if (!parent) {
      const waiting = this.orphans.get(block.header.prevHash) ?? [];
      waiting.push(block);
      this.orphans.set(block.header.prevHash, waiting);
      return "orphan";
    }

    if (!this.validateBlock(block, parent)) return "invalid";

    const work = this.cumWork.get(parent.hash)! + workOf(block.header.difficulty);
    this.blocks.set(block.hash, block);
    this.cumWork.set(block.hash, work);

    // Adopt the heaviest chain. On an exact tie (same cumulative work), break it
    // deterministically by lowest tip hash so every node picks the SAME branch
    // and the network can't deadlock on equal-work forks.
    let result: AddResult = "side";
    const heavier = work > this.totalWork;
    const tieBreak = work === this.totalWork && block.hash < this.tipHash;
    if (heavier || tieBreak) {
      const oldTip = this.tipHash;
      this.updateMempoolOnTipChange(oldTip, block.hash);
      this.tipHash = block.hash;
      result = block.header.prevHash === oldTip ? "extended" : "reorg";
      this.onChange?.();
    }

    this.connectOrphans(block.hash);
    return result;
  }

  /** When the tip moves, return orphaned messages to the mempool and drop confirmed ones. */
  private updateMempoolOnTipChange(oldTipHash: string, newTipHash: string) {
    const newSigs = this.txSigsInAncestry(newTipHash);
    for (const b of this.getChain(oldTipHash)) {
      for (const t of b.txs) if (!newSigs.has(t.signature)) this.mempool.set(t.signature, t);
    }
    for (const sig of newSigs) this.mempool.delete(sig);
    this.onMempool?.();
  }

  /** A newly-added block may be the missing parent some orphans were waiting on. */
  private connectOrphans(parentHash: string) {
    const waiting = this.orphans.get(parentHash);
    if (!waiting) return;
    this.orphans.delete(parentHash);
    for (const child of waiting) this.addBlock(child);
  }
}
