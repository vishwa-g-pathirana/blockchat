import { useStore } from "../store";
import Rail from "./Rail";
import BottomNav from "./BottomNav";
import PublicChat from "../views/PublicChat";
import PrivateChat from "../views/PrivateChat";
import Network from "../views/Network";
import MyNode from "../views/MyNode";

export default function Window() {
  const view = useStore((s) => s.view);
  const id = useStore((s) => s.identity);
  const chain = useStore((s) => s.chain);
  const peers = useStore((s) => s.peers);
  const status = useStore((s) => s.status);

  const height = chain.length ? chain[chain.length - 1].index : 0;
  const online = peers.filter((p) => p.status !== "gone").length || 1;

  return (
    <div id="app">
      <div className="window glass">
        <div className="titlebar">
          <div className="dots"><i className="r" /><i className="o" /><i className="y" /></div>
          <div className="tbtitle">blockchat@node:~ <b>{id?.shortId}</b></div>
          <div className="pills">
            {status === "ready" ? (
              <div className="pill"><span className="d live" /> <b>{online}</b> peers</div>
            ) : (
              <div className="pill reconnect">⟳ reconnecting…</div>
            )}
            <div className="pill hide-mobile">height <b>{height}</b></div>
          </div>
        </div>
        <div className="body">
          <Rail />
          <div className="main">
            {view === "public" && <PublicChat />}
            {view === "private" && <PrivateChat />}
            {view === "network" && <Network />}
            {view === "mynode" && <MyNode />}
          </div>
          <BottomNav />
        </div>
      </div>
    </div>
  );
}
