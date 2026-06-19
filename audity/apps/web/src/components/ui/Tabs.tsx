import { ReactNode, useRef, type KeyboardEvent } from "react";

export type TabItem<TKey extends string = string> = {
  key: TKey;
  label: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  hint?: string;
};

type TabsProps<TKey extends string> = {
  items: TabItem<TKey>[];
  activeKey: TKey;
  onChange: (key: TKey) => void;
  ariaLabel?: string;
  className?: string;
};

export function Tabs<TKey extends string>({ items, activeKey, onChange, ariaLabel, className = "" }: TabsProps<TKey>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function focusEnabled(direction: 1 | -1, startIndex: number) {
    if (!items.length) return;
    let index = startIndex;
    for (let step = 0; step < items.length; step++) {
      index = (index + direction + items.length) % items.length;
      const candidate = items[index];
      if (!candidate.disabled) {
        buttonRefs.current[index]?.focus();
        onChange(candidate.key);
        return;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusEnabled(1, index);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusEnabled(-1, index);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusEnabled(1, items.length - 1);
    } else if (event.key === "End") {
      event.preventDefault();
      focusEnabled(-1, 0);
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 border-b border-audity-border ${className}`}
    >
      {items.map((item, index) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`tab-panel-${item.key}`}
            id={`tab-${item.key}`}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            title={item.hint}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-audity-primary ${
              isActive
                ? "border-audity-primary text-audity-text"
                : "border-transparent text-audity-secondary hover:border-audity-borderStrong hover:text-audity-text"
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span>{item.label}</span>
            {item.badge ? <span>{item.badge}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
