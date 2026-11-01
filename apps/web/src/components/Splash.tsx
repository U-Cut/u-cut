import { useCallback, useEffect, useState } from "react";
import { Scissors } from "./icons";

const seenKey = "ucut-splash-seen";
const showForMs = 1900;

/** Once a session, and never inside the Mac app, which draws its own while the engine starts. */
function shouldShow(): boolean {
  if (new URLSearchParams(window.location.search).has("shell")) return false;
  try {
    if (window.sessionStorage.getItem(seenKey)) return false;
    window.sessionStorage.setItem(seenKey, "1");
  } catch {
    // Private windows can refuse storage, and showing the splash again does no harm.
  }
  return true;
}

const firstLoad = shouldShow();

export function Splash() {
  const [phase, setPhase] = useState<"showing" | "leaving" | "gone">(
    firstLoad ? "showing" : "gone",
  );
  const leave = useCallback(() => setPhase((now) => (now === "showing" ? "leaving" : now)), []);

  useEffect(() => {
    if (phase !== "showing") return;
    const timer = setTimeout(leave, showForMs);
    window.addEventListener("keydown", leave);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", leave);
    };
  }, [phase, leave]);

  if (phase === "gone") return null;
  return (
    <div
      className={`splash ${phase === "leaving" ? "is-leaving" : ""}`}
      aria-hidden="true"
      onClick={leave}
      onAnimationEnd={(event) => {
        if (event.animationName === "splash-leave") setPhase("gone");
      }}
    >
      <div className="splash-mark">
        <span>U</span>
        <Scissors />
        <span className="splash-cut">Cut</span>
      </div>
    </div>
  );
}
