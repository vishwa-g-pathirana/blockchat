import { type FormEvent, useEffect, useRef, useState } from "react";
import { shortId } from "@blockchat/shared";
import { useStore } from "../store";
import { fmtTime } from "../format";

export default function PrivateChat() {
  const activePeer = useStore((s) => s.activePeer);
  const dms = useStore((s) => s.dms);
  const dmStatus = useStore((s) => s.dmStatus);
  const sendDM = useStore((s) => s.sendDM);
  const openDM = useStore((s) => s.openDM);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const convos = Object.keys(dms);
  const thread = activePeer ? dms[activePeer] || [] : [];
  const status = activePeer ? dmStatus[activePeer] : undefined;
  const connected = status === "connected";

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length]);

  if (!activePeer) {
    return (
      <div className="view active">
        <div className="vhead">
          <h2 className="glow-yel">Private DM</h2>
          <div className="tagpill tag-e2e">⚿ E2E</div>
        </div>
        <div className="placeholder">
          <div className="big">⚿</div>
          <div>No conversation selected.</div>
          <div className="section-label">open <b>Node Map</b> and click a node to start an encrypted, off-chain chat</div>
          {convos.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
              {convos.map((a) => (
                <button key={a} className="send ghost" onClick={() => openDM(a)}>chat with {shortId(a)} ▸</button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const statusDot = connected ? "live" : status === "offline" ? "gone" : "idle";
  const statusText = connected
    ? "WebRTC connected · direct peer · no relay · E2E encrypted"
    : status === "offline"
    ? "peer offline / unreachable — they must be online to connect"
    : "establishing direct P2P channel…";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendDM(text);
    setText("");
  };

  return (
    <div className="view active">
      <div className="vhead">
        <h2 className="glow-yel">node {shortId(activePeer)}</h2>
        <div className="tagpill tag-e2e">⚿ E2E ENCRYPTED</div>
        <div className="tagpill tag-warn" style={{ marginLeft: "auto" }}>⚠ off-chain · ephemeral</div>
      </div>
      <div className="scroll" ref={scrollRef}>
        {thread.length === 0 && (
          <div className="section-label">{connected ? "channel open — say hi ▸" : "waiting for the encrypted channel…"}</div>
        )}
        {thread.map((m, i) => (
          <div className={"bubrow" + (m.dir === "out" ? " out" : "")} key={i}>
            <div className={"bub " + (m.dir === "out" ? "out" : "in")}>
              {m.text}
              <div className="meta">{fmtTime(m.ts)}{m.dir === "out" ? " · sent" : ""}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="statusline"><span className={"d " + statusDot} /> {statusText}</div>
      <form className="composer" onSubmit={submit}>
        <div className="inp">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={connected ? "⚿ encrypted message" : "waiting for peer…"}
            disabled={!connected}
          />
        </div>
        <button className="send ghost" type="submit" disabled={!connected}>SEND ▶</button>
      </form>
    </div>
  );
}
