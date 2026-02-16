import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const SHORTCUTS: Record<string, string> = {
  "g d": "/",           // Go to dashboard
  "g s": "/scans",      // Go to scans
  "g m": "/mentions",   // Go to mentions
  "g n": "/narratives", // Go to narratives
  "g r": "/risk-console",
  "g i": "/incidents",
  "g p": "/people",
  "g e": "/escalations",
  "g t": "/settings",
};

export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    let buffer = "";
    let timer: ReturnType<typeof setTimeout>;

    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      buffer += e.key;
      clearTimeout(timer);
      timer = setTimeout(() => { buffer = ""; }, 500);

      const match = SHORTCUTS[buffer];
      if (match) {
        e.preventDefault();
        navigate(match);
        buffer = "";
      }

      // Single key shortcuts
      if (e.key === "?" && !buffer.startsWith("g")) {
        // Could open help modal - for now just log
        console.log("Keyboard shortcuts: g+d=Dashboard, g+s=Scans, g+m=Mentions, g+n=Narratives, g+r=Risk, g+i=Incidents");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);
}
