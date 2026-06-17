import { useEffect, useState } from "react";

const STORAGE_KEY = "audity_onboarding_tips_dismissed_v1";

const TIPS = [
  {
    title: "Press Cmd/Ctrl + K for quick navigation",
    body: "Jump to any customer, assessment, finding or report from anywhere."
  },
  {
    title: "Click the ? icon for help",
    body: "The Help drawer searches the full manual without leaving your page."
  },
  {
    title: "Audit Center has a 7-step workflow",
    body: "The progress stepper at the top of every assessment shows what's done and what's next."
  }
];

export function OnboardingTips() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setDismissed(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setDismissed(true);
    }
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore quota
    }
  }

  if (dismissed) return null;

  return (
    <section
      aria-label="Quick tips"
      className="mb-4 rounded-audity border border-audity-primary/50 bg-audity-primary/5 px-4 py-3"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-audity-text">Quick tips to get the most out of Audity</h2>
          <p className="text-xs text-audity-muted">Three shortcuts new users tend to miss.</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-audity border border-audity-borderStrong bg-audity-panel px-2 py-0.5 text-xs text-audity-secondary hover:border-audity-primary hover:text-audity-text"
          aria-label="Dismiss tips"
        >
          Dismiss
        </button>
      </header>
      <ul className="mt-2 grid gap-2 md:grid-cols-3">
        {TIPS.map((tip) => (
          <li
            key={tip.title}
            className="rounded-audity border border-audity-border bg-audity-panel px-3 py-2"
          >
            <p className="text-xs font-semibold text-audity-text">{tip.title}</p>
            <p className="mt-0.5 text-xs text-audity-secondary">{tip.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
