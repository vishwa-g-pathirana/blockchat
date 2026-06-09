import { useEffect } from "react";
import { useStore } from "./store";
import Landing from "./components/Landing";
import Window from "./components/Window";

export default function App() {
  const initialized = useStore((s) => s.initialized);
  const ensureIdentity = useStore((s) => s.ensureIdentity);

  useEffect(() => {
    ensureIdentity();
  }, [ensureIdentity]);

  return (
    <>
      <div className="fx grid" />
      <div className="fx beam" />
      <div className="fx scan" />
      <div className="fx vign" />
      {initialized ? <Window /> : <Landing />}
    </>
  );
}
