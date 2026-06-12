import { useEffect, useState } from "react";
import { shortId } from "@blockchat/shared";
import { useStore } from "../store";
import { storageKB } from "../db";
import { fmtTime, minsAgo } from "../format";

export default function MyNode() {
  const chain = useStore((s) => s.chain);
  const id = useStore((s) => s.identity);
  const connectedSince = useStore((s) => s.connectedSince);
  const mempool = useStore((s) => s.mempool);
  const [kb, setKb] = useState(0);

  useEffect(() => {
    storageKB().then(setKb);
  }, [chain.length]);

  const myMessages = chain.filter((b) => b.author === id?.author).length;
  const active = connectedSince ? minsAgo(connectedSince) : 0;
  const recent = chain.slice(-4);
  const sel = chain[chain.length - 1];
  const mine = (a: string) => a === id?.author;

  return (
    <div className="view active">
      <div className="vhead"><h2 className="glow-saf">MY NODE</h2><div className="sub">{id?.shortId} · local chain replica</div></div>
      <div className="scroll">
        <div className="cards">
          <div className="card"><div className="k">LOCAL BLOCKS</div><div className="v">{chain.length}</div></div>
          <div className="card"><div className="k">MY MESSAGES</div><div className="v">{myMessages}</div></div>
          <div className="card"><div className="k">STORAGE</div><div className="v grn">{kb}KB</div></div>
          <div className="card"><div className="k">ACTIVE</div><div className="v">{active}m</div></div>
        </div>
        <div className="section-label">LOCAL CHAIN REPLICA (IndexedDB)</div>
        <div className="chain">
          {recent.map((b, i) => (
            <span key={b.index} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div className={"blk" + (b.index === sel?.index ? " sel" : "")}>
                <div className="bi">#{b.index}</div>
                <div className="bh">0x{b.hash.slice(0, 4)}</div>
              </div>
              {i < recent.length - 1 && <span className="link">→</span>}
            </span>
          ))}
        </div>
        {sel && (
          <div className="detail">
            <h3>▣ BLOCK #{sel.index} · head</h3>
            <div className="kv">
              <div className="key">index</div><div className="val">{sel.index}</div>
              <div className="key">timestamp</div><div className="val">{fmtTime(sel.timestamp)}</div>
              <div className="key">author</div><div className="val y">{sel.author === "genesis" ? "genesis" : sel.author.slice(0, 16) + "…"}</div>
              <div className="key">data</div><div className="val">{sel.data}</div>
              <div className="key">prevHash</div><div className="val">0x{sel.prevHash.slice(0, 10)}…</div>
              <div className="key">hash</div><div className="val y">0x{sel.hash.slice(0, 10)}…</div>
              <div className="key">nonce</div><div className="val">{sel.nonce}</div>
              <div className="key">signature</div><div className="val g">{sel.signature === "genesis" ? "— genesis —" : "✓ valid · signed by node key"}</div>
            </div>
          </div>
        )}

        <div className="section-label" style={{ marginTop: 16 }}>
          MEMPOOL · {mempool.length} pending {mempool.length > 0 ? "· proof-of-work in progress" : ""}
        </div>
        <div className="detail">
          {mempool.length === 0 ? (
            <div className="muted" style={{ padding: "2px 0" }}>empty — every message has been mined into a block ✓</div>
          ) : (
            mempool
              .slice()
              .sort((a, b) => a.clientTs - b.clientTs)
              .map((tx) => (
                <div
                  key={tx.author + tx.clientTs}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid rgba(0,255,170,.1)" }}
                >
                  <span className="node">node {shortId(tx.author)}{mine(tx.author) && <span className="glow-saf" style={{ fontSize: 10 }}> YOU</span>}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.data}</span>
                  <span className="mining-txt" style={{ fontSize: 11, whiteSpace: "nowrap" }}>⛏ waiting to be mined</span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
