import { ReactNode } from "react";

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
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 border-b border-audity-border ${className}`}
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-controls={`tab-panel-${item.key}`}
            id={`tab-${item.key}`}
            tabIndex={isActive ? 0 : -1}
            disabled={item.disabled}
            title={item.hint}
            onClick={() => onChange(item.key)}
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
