import { useEffect, useMemo, useRef } from "react";

type SearchResult = {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
};

type CommandPaletteProps = {
  query: string;
  onQueryChange: (value: string) => void;
  actions: SearchResult[];
  results: SearchResult[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (result: SearchResult) => void;
  onClose: () => void;
};

const CATEGORY_LABEL: Record<string, string> = {
  action: "Quick actions",
  customer: "Customers",
  assessment: "Assessments",
  finding: "Findings",
  evidence: "Evidence",
  risk: "Risks",
  control: "Controls",
  page: "Pages",
  framework: "Frameworks"
};

function categoryLabel(type: string) {
  if (CATEGORY_LABEL[type]) return CATEGORY_LABEL[type];
  return type.charAt(0).toUpperCase() + type.slice(1) + "s";
}

export function CommandPalette({
  query,
  onQueryChange,
  actions,
  results,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onClose
}: CommandPaletteProps) {
  const flat = useMemo(() => [...actions, ...results], [actions, results]);
  const grouped = useMemo(() => {
    const map = new Map<string, SearchResult[]>();
    for (const item of flat) {
      const key = item.type === "action" ? "action" : item.type;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [flat]);

  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const lastInteractionRef = useRef<"keyboard" | "mouse">("keyboard");

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        lastInteractionRef.current = "keyboard";
        onActiveIndexChange(Math.min(flat.length - 1, activeIndex + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        lastInteractionRef.current = "keyboard";
        onActiveIndexChange(Math.max(0, activeIndex - 1));
      } else if (event.key === "Enter") {
        const selected = flat[activeIndex];
        if (selected) {
          event.preventDefault();
          onSelect(selected);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flat, activeIndex, onActiveIndexChange, onSelect, onClose]);

  let runningIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-audity border border-audity-border bg-audity-panel shadow-2xl">
        <div className="border-b border-audity-border p-3">
          <input
            className="h-10 w-full rounded-audity border border-audity-border bg-audity-page px-3 text-sm text-audity-text outline-none focus:border-audity-primary"
            placeholder="Type to search customers, assessments, findings — or pick a quick action..."
            autoFocus
            value={query}
            onChange={(event) => {
              onQueryChange(event.target.value);
              onActiveIndexChange(0);
            }}
            aria-label="Search query"
          />
        </div>
        <div ref={listRef} className="max-h-[60vh] overflow-auto p-2">
          {grouped.size === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-audity-muted">
              {query.trim() ? "No matches. Try fewer or different words." : "Start typing to search."}
            </div>
          ) : null}
          {Array.from(grouped.entries()).map(([type, items]) => (
            <div key={type} className="mb-2 last:mb-0">
              <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-audity-muted">
                {categoryLabel(type)}
              </div>
              {items.map((result) => {
                const myIndex = runningIndex++;
                const isActive = myIndex === activeIndex;
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    ref={isActive ? activeRef : undefined}
                    className={`flex w-full items-center gap-2 rounded-audity px-3 py-2 text-left ${isActive ? "bg-audity-page ring-1 ring-audity-primary" : "hover:bg-audity-page"}`}
                    onClick={() => onSelect(result)}
                    onMouseMove={() => {
                      if (lastInteractionRef.current !== "mouse" || activeIndex !== myIndex) {
                        lastInteractionRef.current = "mouse";
                        if (activeIndex !== myIndex) onActiveIndexChange(myIndex);
                      }
                    }}
                    aria-current={isActive ? "true" : undefined}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-audity-text">{result.title}</span>
                      {result.subtitle ? (
                        <span className="block truncate text-xs text-audity-muted">{result.subtitle}</span>
                      ) : null}
                    </span>
                    {isActive ? (
                      <span className="shrink-0 rounded border border-audity-border bg-audity-panelAlt px-1.5 py-0.5 text-[10px] font-semibold text-audity-muted">
                        Enter ↵
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-audity-border bg-audity-panelAlt px-3 py-2 text-[10px] text-audity-muted">
          <span><kbd className="rounded border border-audity-border bg-audity-page px-1 py-0.5">↑</kbd> <kbd className="rounded border border-audity-border bg-audity-page px-1 py-0.5">↓</kbd> navigate</span>
          <span><kbd className="rounded border border-audity-border bg-audity-page px-1 py-0.5">↵</kbd> open</span>
          <span><kbd className="rounded border border-audity-border bg-audity-page px-1 py-0.5">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
