import { type FormEvent, useEffect, useRef, useState } from "react";
import { shortId } from "@blockchat/shared";
import { useStore } from "../store";
import { fmtTime } from "../format";

export default function PublicChat() {
  const chain = useStore((s) => s.chain);
  const id = useStore((s) => s.identity);
  const send = useStore((s) => s.send);
  const pending = useStore((s) => s.pending);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // hide a confirmed block while its mining card is still on screen (no flicker/dupe)
  const pendingTs = new Set(pending.map((p) => p.clientTs));
  const messages = chain.filter((b) => b.index > 0 && !(b.author === id?.author && pendingTs.has(b.clientTs)));

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, pending.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    send(text);
    setText("");
  };

  return (
    <div className="view active">
      <div className="vhead">
        <h2 className="glow-saf">#public-chain</h2>
        <div className="sub">the shared ledger · every message is a block</div>
        <div className="tagpill tag-e2e" style={{ marginLeft: "auto" }}>⛓ ON-CHAIN</div>
      </div>
      <div className="scroll" ref={scrollRef}>
        {messages.length === 0 && pending.length === 0 && (
          <div className="section-label">no messages yet — author the first block ▸</div>
        )}
        {messages.map((b) => {
          const you = b.author === id?.author;
          return (
            <div className={"msg" + (you ? " you" : "")} key={b.index}>
              <div className="idx">#{b.index}</div>
              <div className="body2">
                <div className="mhead">
                  <span className="node">node {shortId(b.author)}</span>
                  {you && <span className="glow-saf" style={{ fontSize: 11 }}>YOU</span>}
                  <span className="time">{fmtTime(b.timestamp)}</span>
                  <span className="hash">hash 0x{b.hash.slice(0, 4)}…</span>
                </div>
                <div className="mtext">{b.data}</div>
                <div className="mined">⛓ mined · nonce {b.nonce}{you ? " · signed by your key ✓" : ""}</div>
              </div>
            </div>
          );
        })}
        {pending.map((p) => (
          <div className={"msg mining" + (p.status === "mined" ? " done" : "")} key={"p" + p.clientTs}>
            <div className="idx">{p.status === "mined" ? "✓" : "⛏"}</div>
            <div className="body2">
              <div className="mhead">
                <span className="node">node {id?.shortId}</span>
                <span className="glow-saf" style={{ fontSize: 11 }}>YOU</span>
                <span className="time">now</span>
              </div>
              <div className="mtext">{p.data}</div>
              <div className="mined mining-txt">
                {p.status === "mined" ? "✓ mined · added to the chain" : "⛏ mining · proof-of-work…"}
              </div>
              {p.status === "mining" && <div className="miningbar" />}
            </div>
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <div className="inp">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="type a message" autoFocus />
          <span className="hint">↵ broadcasts as a new block</span>
        </div>
        <button className="send" type="submit">SEND ▶</button>
      </form>
    </div>
  );
}
