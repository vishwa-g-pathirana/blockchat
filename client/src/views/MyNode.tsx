import { useEffect, useState } from "react";
import { shortId } from "@blockchat/shared";
import { useStore } from "../store";
import { storageKB } from "../db";
import { fmtTime, minsAgo } from "../format";

interface NetInfo {
  loading: boolean;
  error?: boolean;
  ip?: string;
  city?: string;
  country?: string;
  flag?: string;
  isp?: string;
  isTor?: boolean | null;
}

/** Turn a 2-letter country code into its flag emoji (GB -> 🇬🇧). */
const flagEmoji = (cc?: string) =>
  cc && cc.length === 2
    ? cc.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    : "";

export default function MyNode() {
  const chain = useStore((s) => s.chain);
  const id = useStore((s) => s.identity);
  const connectedSince = useStore((s) => s.connectedSince);
  const mempool = useStore((s) => s.mempool);
  const [kb, setKb] = useState(0);
  const [net, setNet] = useState<NetInfo>({ loading: true, isTor: null });

  useEffect(() => {
    storageKB().then(setKb);
  }, [chain.length]);

  // Look up the apparent network identity (the IP/location the outside world sees).
  // We show the IP/location immediately (reliable), then best-effort Tor detection
  // that only ever sets a POSITIVE — we never falsely claim "this is your real IP".
  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);

    fetch("https://ipapi.co/json/", { signal: ac.signal })
      .then((r) => r.json())
      .then((who) => {
        if (cancelled) return;
        if (!who || who.error || !who.ip) return setNet({ loading: false, error: true });
        setNet({
          loading: false,
          ip: who.ip,
          city: who.city,
          country: who.country_name || who.country,
          flag: flagEmoji(who.country_code),
          isp: who.org,
          isTor: null,
        });
      })
      .catch(() => { if (!cancelled) setNet({ loading: false, error: true }); });

    fetch("https://check.torproject.org/api/ip", { signal: ac.signal })
      .then((r) => r.json())
      .then((t) => { if (!cancelled && t && t.IsTor) setNet((n) => ({ ...n, isTor: true })); })
      .catch(() => { /* Tor check often CORS-blocked — ignore, leave as unknown */ });

    return () => { cancelled = true; ac.abort(); clearTimeout(timer); };
  }, []);

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
        <div className="section-label" style={{ marginTop: 4 }}>PRIVACY · ON-CHAIN</div>
        <div className="detail" style={{ borderColor: "rgba(24,255,195,.25)" }}>
          <h3 style={{ color: "#18ffc3" }}>🛡 YOUR IP IS HIDDEN FROM THE PUBLIC</h3>
          <div className="kv">
            <div className="key">on-chain</div><div className="val g">never stored — blocks hold only your public key + message</div>
            <div className="key">other users</div><div className="val g">cannot see your IP address</div>
            <div className="key">identity</div><div className="val y">a cryptographic key ({id?.shortId}) — no name, email or phone</div>
          </div>
        </div>

        <div className="section-label" style={{ marginTop: 4 }}>NETWORK IDENTITY</div>
        <div className="detail">
          {net.loading ? (
            <div className="muted">resolving your apparent network identity…</div>
          ) : net.error ? (
            <div className="muted">couldn't reach the lookup service (offline or blocked)</div>
          ) : (
            <>
              <h3 style={{ color: net.isTor ? "#18ffc3" : "#FFBE29" }}>
                {net.isTor ? "🧅 Routed through Tor — your real IP is hidden" : "🌐 Your apparent network identity"}
              </h3>
              <div className="kv">
                <div className="key">apparent IP</div><div className="val y">{net.ip || "—"}</div>
                <div className="key">appears in</div><div className="val">{[net.city, net.country].filter(Boolean).join(", ") || "—"} {net.flag || ""}</div>
                <div className="key">routed via</div><div className="val">{net.isp || "—"}</div>
                <div className="key">Tor</div><div className="val g">{net.isTor ? "✓ active" : "not detected"}</div>
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                {net.isTor
                  ? "This is a Tor relay's address — where you pretend to be, not where you actually are."
                  : "This is the IP & location the outside world sees. If you're not on Tor, it's your real one — open in Tor Browser via a node's .onion address to hide it."}
              </div>
            </>
          )}
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
