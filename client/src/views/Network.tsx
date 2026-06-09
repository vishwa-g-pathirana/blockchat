import { useStore } from "../store";
import { fmtTime, minsAgo } from "../format";

export default function Network() {
  const peers = useStore((s) => s.peers);
  const chain = useStore((s) => s.chain);
  const id = useStore((s) => s.identity);
  const openDM = useStore((s) => s.openDM);

  const now = Date.now();
  const online = peers.filter((p) => p.status !== "gone").length;
  const height = chain.length ? chain[chain.length - 1].index : 0;
  const blocksPerMin = chain.filter((b) => b.timestamp > now - 60_000).length;
  const avgUptime = peers.length
    ? Math.round(peers.reduce((a, p) => a + (now - p.createdAt) / 60000, 0) / peers.length)
    : 0;

  const sorted = [...peers].sort((a, b) => (a.author === id?.author ? -1 : b.author === id?.author ? 1 : 0));

  return (
    <div className="view active">
      <div className="vhead"><h2 className="glow-saf">NETWORK</h2><div className="sub">active nodes on the chain</div></div>
      <div className="scroll">
        <div className="cards">
          <div className="card"><div className="k">NODES ONLINE</div><div className="v grn">{online}</div></div>
          <div className="card"><div className="k">CHAIN HEIGHT</div><div className="v">{height}</div></div>
          <div className="card"><div className="k">BLOCKS / MIN</div><div className="v">{blocksPerMin}</div></div>
          <div className="card"><div className="k">AVG UPTIME</div><div className="v">{avgUptime}m</div></div>
        </div>
        <div className="tbl">
          <div className="trow head"><div>NODE ID</div><div>CREATED</div><div>ACTIVE</div><div>MSGS</div><div>STATUS</div></div>
          {sorted.length === 0 && <div className="trow"><div className="muted">waiting for peers…</div><div /><div /><div /><div /></div>}
          {sorted.map((p) => {
            const you = p.author === id?.author;
            return (
              <div
                className={"trow" + (you ? " you" : "") + (p.status === "gone" ? " gone" : "")}
                key={p.author}
                style={{ cursor: you ? "default" : "pointer" }}
                title={you ? "" : "open private chat"}
                onClick={() => !you && openDM(p.author)}
              >
                <div className="nid">{p.id}{you && <span style={{ color: "var(--saffron)", fontSize: 10 }}> (you)</span>}</div>
                <div className="muted">{fmtTime(p.createdAt)}</div>
                <div className="muted">{minsAgo(p.createdAt)}m</div>
                <div className="muted">{p.msgCount}</div>
                <div>
                  <span className="st">
                    <span className={"d " + p.status} />
                    <span className={p.status + "-txt"}>{p.status}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="section-label" style={{ marginTop: 14 }}>▸ click any node to open an encrypted, off-chain private chat</div>
      </div>
    </div>
  );
}
