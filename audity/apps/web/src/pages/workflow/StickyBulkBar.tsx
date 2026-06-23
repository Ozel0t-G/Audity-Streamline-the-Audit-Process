type Props = {
  count: number;
  entityLabel: string;
  statusOptions: string[];
  priorityOptions?: string[];
  statusValue: string;
  priorityValue: string;
  onStatus: (value: string) => void;
  onPriority?: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  applyDisabled?: boolean;
};

export function StickyBulkBar({
  count,
  entityLabel,
  statusOptions,
  priorityOptions,
  statusValue,
  priorityValue,
  onStatus,
  onPriority,
  onApply,
  onClear,
  applyDisabled
}: Props) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-audity border border-audity-borderStrong bg-audity-panel px-4 py-3 shadow-lg">
      <span className="text-sm font-semibold text-audity-text">
        {count} {entityLabel} selected
      </span>
      <label className="text-xs text-audity-secondary">
        Status
        <select
          className="audity-input ml-2 h-7 text-xs"
          value={statusValue}
          onChange={(event) => onStatus(event.target.value)}
        >
          <option value="">No change</option>
          {statusOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </label>
      {priorityOptions && onPriority ? (
        <label className="text-xs text-audity-secondary">
          Priority
          <select
            className="audity-input ml-2 h-7 text-xs"
            value={priorityValue}
            onChange={(event) => onPriority(event.target.value)}
          >
            <option value="">No change</option>
            {priorityOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button
        type="button"
        className="audity-btn-primary text-xs"
        onClick={onApply}
        disabled={applyDisabled}
      >
        Apply
      </button>
      <button
        type="button"
        className="text-xs font-semibold text-audity-muted hover:text-audity-secondary"
        onClick={onClear}
      >
        Clear selection
      </button>
    </div>
  );
}
