import { useStore, SERVER_URL } from "../store";

export default function Landing() {
  const id = useStore((s) => s.identity);
  const status = useStore((s) => s.status);
  const initialize = useStore((s) => s.initialize);
  const connecting = status === "connecting";
  const sid = id?.shortId ?? "……";
  const nodeHost = (() => {
    try {
      return new URL(SERVER_URL).host;
    } catch {
      return SERVER_URL;
    }
  })();

  return (
    <div id="landing">
      <h1 className="brand">BLOCKCHAT</h1>
      <div className="tag">// ANONYMOUS · DECENTRALIZED · ON-CHAIN</div>
      <div className="term glass">
        <div className="l" style={{ animationDelay: ".1s" }}><span className="mut">[</span><span className="ok">boot</span><span className="mut">]</span> blockchat node runtime v0.1.0</div>
        <div className="l" style={{ animationDelay: ".4s" }}><span className="mut">[</span><span className="ok">&nbsp;ok&nbsp;</span><span className="mut">]</span> ed25519 keypair loaded</div>
        <div className="l" style={{ animationDelay: ".7s" }}><span className="mut">[</span><span className="ok">&nbsp;ok&nbsp;</span><span className="mut">]</span> node identity :: <span className="glow-saf">{sid}</span></div>
        <div className="l" style={{ animationDelay: "1.0s" }}><span className="mut">[</span><span className="wt">&nbsp;··&nbsp;</span><span className="mut">]</span> full node :: {nodeHost} <span className="mut">(proof-of-work)</span></div>
        <div className="l" style={{ animationDelay: "1.3s" }}><span className="mut">[</span><span className="ok">&nbsp;ok&nbsp;</span><span className="mut">]</span> local replica ready <span className="mut">(IndexedDB)</span></div>
        <div className="l" style={{ animationDelay: "1.6s" }}><span className="mut">[</span><span className="glow-grn">READY</span><span className="mut">]</span> awaiting node initialization<span className="ok" style={{ animation: "blink 1s steps(1) infinite" }}>_</span></div>
      </div>
      <button className="cta" onClick={initialize} disabled={connecting}>
        {connecting ? "[ CONNECTING… ]" : "[ INITIALIZE NODE ▶ ]"}
      </button>
      <div className="foot">no signup · no email · keys never leave this device</div>
    </div>
  );
}
