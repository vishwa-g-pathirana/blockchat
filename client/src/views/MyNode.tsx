import { useEffect, useState } from "react";
import { useStore } from "../store";
import { storageKB } from "../db";
import { fmtTime, minsAgo } from "../format";

export default function MyNode() {
  const chain = useStore((s) => s.chain);
  const id = useStore((s) => s.identity);
  const connectedSince = useStore((s) => s.connectedSince);
  const [kb, setKb] = useState(0);

  useEffect(() => {
    storageKB().then(setKb);
  }, [chain.length]);

  const myMessages = chain.filter((b) => b.author === id?.author).length;
  const active = connectedSince ? minsAgo(connectedSince) : 0;
  const recent = chain.slice(-4);
  const sel = chain[chain.length - 1];

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
      </div>
    </div>
  );
}
