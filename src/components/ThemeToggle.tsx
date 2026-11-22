import { useEffect, useState } from "react";

type Theme = "dark" | "paper";

const STORAGE_KEY = "qz-theme";

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.dataset.theme === "paper" ? "paper" : "dark";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Sync with the value the inline head script already applied.
  useEffect(() => {
    setTheme(readTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "paper" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage can be blocked — the in-page toggle still works */
    }
  }

  const isPaper = theme === "paper";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isPaper}
      aria-label={isPaper ? "Switch to dark mode" : "Switch to paper mode"}
      title={isPaper ? "Dark mode" : "Paper mode"}
      className="grid size-9 place-items-center rounded-full border border-line text-ink transition-colors duration-200 hover:border-ink/40 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-[17px]"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mounted && isPaper ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
          </>
        ) : (
          <path d="M20.5 14.3A8.6 8.6 0 1 1 9.7 3.5a6.9 6.9 0 0 0 10.8 10.8Z" />
        )}
      </svg>
    </button>
  );
}
