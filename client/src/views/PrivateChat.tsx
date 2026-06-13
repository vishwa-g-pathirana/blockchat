/**
 * Private 1-to-1 chat is temporarily disabled. The previous WebRTC approach
 * leaked the user's real IP (a de-anonymization risk, especially under Tor), so
 * it's being redesigned to be fully anonymous and leak-free before re-enabling.
 */
export default function PrivateChat() {
  return (
    <div className="view active">
      <div className="vhead">
        <h2 className="glow-yel">Private DM</h2>
        <div className="tagpill tag-warn" style={{ marginLeft: "auto" }}>⏳ COMING SOON</div>
      </div>
      <div className="placeholder">
        <div className="big">⚿</div>
        <div>Private 1-to-1 chat is coming soon.</div>
        <div className="section-label" style={{ maxWidth: 440, textAlign: "center", marginTop: 8 }}>
          We're redesigning private messaging to be fully anonymous and leak-free
          (the old peer-to-peer channel could expose your IP). It's disabled for now.
        </div>
      </div>
    </div>
  );
}
