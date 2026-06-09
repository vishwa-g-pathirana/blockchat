import { useStore, type ViewId } from "../store";
import Blockie from "./Blockie";
import { ICONS } from "./icons";

function NavItem({ id, label, badge }: { id: ViewId; label: string; badge?: string }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  return (
    <div className={"nav-item" + (view === id ? " active" : "")} onClick={() => setView(id)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{ICONS[id]}</svg>
      {label}
      {badge && <span className="badge">{badge}</span>}
    </div>
  );
}

export default function Rail() {
  const id = useStore((s) => s.identity);
  const peers = useStore((s) => s.peers);
  const dms = useStore((s) => s.dms);
  const online = peers.filter((p) => p.status !== "gone").length;
  const dmCount = Object.keys(dms).length;

  return (
    <div className="rail">
      <div className="sec">CHANNELS</div>
      <NavItem id="public" label="Public Chain" badge="live" />
      <NavItem id="private" label="Private DM" badge={dmCount ? String(dmCount) : undefined} />
      <div className="sec">NETWORK</div>
      <NavItem id="network" label="Node Map" badge={String(online || 1)} />
      <NavItem id="mynode" label="My Node" />
      <div className="idcard">
        {id && <Blockie author={id.author} />}
        <div className="who">
          <b>{id?.shortId}</b>
          <span><span className="d live" /> online · this device</span>
        </div>
      </div>
    </div>
  );
}
