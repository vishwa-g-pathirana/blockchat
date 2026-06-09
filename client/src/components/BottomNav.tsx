import { useStore, type ViewId } from "../store";
import { ICONS } from "./icons";

const ITEMS: { id: ViewId; label: string }[] = [
  { id: "public", label: "Public" },
  { id: "private", label: "Private" },
  { id: "network", label: "Network" },
  { id: "mynode", label: "Node" },
];

/** Mobile-only bottom tab bar (hidden on desktop via CSS). */
export default function BottomNav() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const dms = useStore((s) => s.dms);
  const dmCount = Object.keys(dms).length;

  return (
    <div className="bottomnav">
      {ITEMS.map((it) => (
        <button key={it.id} className={"bnav-item" + (view === it.id ? " active" : "")} onClick={() => setView(it.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>{ICONS[it.id]}</svg>
          {it.label}
          {it.id === "private" && dmCount > 0 && <span className="bnav-badge">{dmCount}</span>}
        </button>
      ))}
    </div>
  );
}
