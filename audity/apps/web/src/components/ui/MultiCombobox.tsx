import { useEffect, useId, useMemo, useRef, useState } from "react";

export type ComboOption = { value: string; label: string; hint?: string };

type Props = {
  options: ComboOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
  emptyText?: string;
  allowCreate?: boolean;
  ariaLabel?: string;
  required?: boolean;
  disabled?: boolean;
};

export function MultiCombobox({
  options,
  value,
  onChange,
  placeholder = "Search…",
  label,
  emptyText = "No matches",
  allowCreate = false,
  ariaLabel,
  required,
  disabled
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();

  const selectedOptions = useMemo(
    () => value.map((v) => options.find((option) => option.value === v) ?? { value: v, label: v }),
    [value, options]
  );

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const available = options.filter((option) => !value.includes(option.value));
    if (!lowered) return available;
    return available.filter((option) => option.label.toLowerCase().includes(lowered) || option.value.toLowerCase().includes(lowered));
  }, [options, query, value]);

  const canCreate = allowCreate && query.trim().length > 0 && !options.some((option) => option.label.toLowerCase() === query.trim().toLowerCase()) && !value.includes(query.trim());

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  function toggle(val: string) {
    if (value.includes(val)) {
      onChange(value.filter((entry) => entry !== val));
    } else {
      onChange([...value, val]);
    }
    setQuery("");
    inputRef.current?.focus();
  }

  function remove(val: string) {
    onChange(value.filter((entry) => entry !== val));
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const total = filtered.length + (canCreate ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (total > 0) setActiveIndex((idx) => (idx + 1) % total);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (total > 0) setActiveIndex((idx) => (idx - 1 + total) % total);
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      if (activeIndex < filtered.length) {
        toggle(filtered[activeIndex].value);
      } else if (canCreate) {
        toggle(query.trim());
      }
    } else if (event.key === "Backspace" && !query && value.length) {
      remove(value[value.length - 1]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      {label ? (
        <label className={`audity-label ${required ? "audity-label-required" : ""}`}>{label}</label>
      ) : null}
      <div
        className={`flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-audity border border-audity-border bg-audity-page px-2 py-1.5 text-sm transition focus-within:border-audity-primary focus-within:ring-2 focus-within:ring-audity-primary/40 ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setOpen(true);
          }
        }}
      >
        {selectedOptions.map((option) => (
          <span key={option.value} className="inline-flex items-center gap-1 rounded-full bg-audity-primaryActive px-2 py-0.5 text-xs font-medium text-audity-primary">
            {option.label}
            {!disabled ? (
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  remove(option.value);
                }}
                className="rounded-full text-audity-primary/70 hover:text-audity-primary"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            ) : null}
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          aria-label={ariaLabel ?? label}
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          role="combobox"
          disabled={disabled}
          placeholder={selectedOptions.length ? "" : placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-w-[80px] flex-1 bg-transparent text-sm text-audity-text placeholder:text-audity-muted focus:outline-none"
        />
      </div>
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-60 overflow-auto rounded-audity-md border border-audity-border bg-audity-panel shadow-audity-raised"
        >
          {filtered.map((option, index) => (
            <li
              key={option.value}
              role="option"
              aria-selected={value.includes(option.value)}
              onMouseDown={(event) => {
                event.preventDefault();
                toggle(option.value);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm ${index === activeIndex ? "bg-audity-panelAlt text-audity-text" : "text-audity-secondary"}`}
            >
              <span>
                {option.label}
                {option.hint ? <span className="ml-2 text-xs text-audity-muted">{option.hint}</span> : null}
              </span>
            </li>
          ))}
          {canCreate ? (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(event) => {
                event.preventDefault();
                toggle(query.trim());
              }}
              onMouseEnter={() => setActiveIndex(filtered.length)}
              className={`flex cursor-pointer items-center gap-2 border-t border-audity-border px-3 py-2 text-sm ${activeIndex === filtered.length ? "bg-audity-panelAlt text-audity-text" : "text-audity-primary"}`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add "{query.trim()}"
            </li>
          ) : null}
          {!filtered.length && !canCreate ? (
            <li className="px-3 py-3 text-sm text-audity-muted">{emptyText}</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
