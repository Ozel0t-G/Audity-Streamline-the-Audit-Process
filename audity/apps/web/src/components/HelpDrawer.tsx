import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { manualSections } from "../data/manualSections";

type HelpDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return manualSections;
    return manualSections.filter((section) => {
      if (section.title.toLowerCase().includes(q)) return true;
      return section.body.some((line) => line.toLowerCase().includes(q));
    });
  }, [query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Help & Manual"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full w-full max-w-md flex-col border-l border-audity-border bg-audity-panel shadow-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-audity-border px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-audity-text">Help & Manual</h2>
            <p className="text-xs text-audity-muted">Search the audit playbook without leaving this page.</p>
          </div>
          <button
            type="button"
            className="rounded-audity border border-audity-borderStrong px-2 py-1 text-xs text-audity-secondary hover:border-audity-primary hover:text-audity-text"
            onClick={onClose}
            aria-label="Close help"
          >
            ✕
          </button>
        </header>
        <div className="border-b border-audity-border px-4 py-2">
          <input
            type="search"
            className="h-9 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
            placeholder="Search topics..."
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search help topics"
          />
        </div>
        <div className="flex-1 overflow-auto px-4 py-3">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-audity-muted">No topics match "{query}".</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((section) => (
                <li key={section.id} className="rounded-audity border border-audity-border bg-audity-panelAlt p-3">
                  <h3 className="text-sm font-semibold text-audity-text">{section.title}</h3>
                  <ul className="mt-1 flex flex-col gap-1 text-xs text-audity-secondary">
                    {section.body.slice(0, 3).map((line, idx) => (
                      <li key={idx}>{line}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="border-t border-audity-border px-4 py-2 text-xs">
          <Link
            to="/manual"
            onClick={onClose}
            className="font-semibold text-audity-primary hover:underline"
          >
            Open full manual →
          </Link>
        </footer>
      </aside>
    </div>
  );
}
