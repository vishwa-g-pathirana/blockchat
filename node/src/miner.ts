import { sha256, canonicalHeader, hashTxs, meetsDifficulty } from "./pow";
import type { Chain } from "./chain";
import type { Block, BlockHeader } from "./types";
import type { P2PNode } from "./net";

const BATCH = 3000; // nonces to try before yielding to the event loop
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Continuously mines pending messages into blocks. Proof-of-work is CPU-bound,
 * so it runs in small nonce batches and yields between them — that keeps the
 * node responsive to incoming gossip, and lets the miner abandon a candidate
 * the moment a peer extends the chain (so it never mines on a stale tip).
 */
export class Miner {
  private running = false;

  constructor(
    private chain: Chain,
    private net: P2PNode,
    private id = "",
    private onBlock?: (b: Block) => void
  ) {}

  start() {
    if (!this.running) {
      this.running = true;
      void this.loop();
    }
  }
  stop() {
    this.running = false;
  }

  private async loop() {
    while (this.running) {
      if (this.chain.pendingCount === 0) {
        await delay(40); // nothing to mine — idle (no wasteful empty blocks)
        continue;
      }
      const block = await this.tryMine();
      if (block) {
        const r = this.chain.addBlock(block);
        if (r === "extended" || r === "reorg") {
          this.net.broadcast({ t: "block", block });
          this.onBlock?.(block);
        }
      }
    }
  }

  private async tryMine(): Promise<Block | null> {
    const parent = this.chain.tip;
    const txs = this.chain.pendingTxs().slice(0, 50);
    if (txs.length === 0) return null;

    const base: Omit<BlockHeader, "nonce"> = {
      index: parent.header.index + 1,
      prevHash: parent.hash,
      timestamp: Date.now(),
      difficulty: this.chain.difficultyForChild(parent),
      txRoot: hashTxs(txs),
      miner: this.id,
    };

    let nonce = 0;
    while (this.running) {
      for (let i = 0; i < BATCH; i++) {
        const header: BlockHeader = { ...base, nonce };
        const hash = sha256(canonicalHeader(header));
        if (meetsDifficulty(hash, base.difficulty)) return { header, txs, hash };
        nonce++;
      }
      await delay(0); // let the node process incoming blocks/txs
      if (this.chain.tipHash !== parent.hash) return null; // a peer won this height → rebuild
    }
    return null;
  }
}
