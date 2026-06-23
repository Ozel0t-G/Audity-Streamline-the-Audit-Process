import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

export type WorkflowFilter = {
  scope: "all" | "open" | "closed";
  owner: string;
  search: string;
};

const DEFAULTS: WorkflowFilter = { scope: "all", owner: "", search: "" };

export function useWorkflowFilter(): [WorkflowFilter, (next: Partial<WorkflowFilter>) => void] {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<WorkflowFilter>(() => ({
    scope: (params.get("scope") as WorkflowFilter["scope"]) ?? DEFAULTS.scope,
    owner: params.get("owner") ?? DEFAULTS.owner,
    search: params.get("q") ?? DEFAULTS.search
  }));

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (filter.scope !== DEFAULTS.scope) next.set("scope", filter.scope);
    else next.delete("scope");
    if (filter.owner) next.set("owner", filter.owner);
    else next.delete("owner");
    if (filter.search) next.set("q", filter.search);
    else next.delete("q");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.scope, filter.owner, filter.search]);

  function update(patch: Partial<WorkflowFilter>) {
    setFilter((current) => ({ ...current, ...patch }));
  }

  return [filter, update];
}

type Props = {
  filter: WorkflowFilter;
  onChange: (patch: Partial<WorkflowFilter>) => void;
  owners: string[];
  counts: { findings: number; risks: number; roadmap: number };
};

export function WorkflowFilterBar({ filter, onChange, owners, counts }: Props) {
  return (
    <div className="sticky top-0 z-10 -mx-3 mb-3 flex flex-wrap items-center gap-3 border-b border-audity-border bg-audity-panel/95 px-3 py-2 backdrop-blur">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-semibold text-audity-secondary">Stages:</span>
        <span className="rounded-full bg-audity-primary/15 px-2 py-0.5 font-semibold text-audity-primary">
          ● Findings {counts.findings}
        </span>
        <span className="rounded-full bg-audity-warning/15 px-2 py-0.5 font-semibold text-audity-warning">
          ● Risks {counts.risks}
        </span>
        <span className="rounded-full bg-audity-success/15 px-2 py-0.5 font-semibold text-audity-success">
          ● Roadmap {counts.roadmap}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {(["all", "open", "closed"] as const).map((scope) => (
          <button
            key={scope}
            type="button"
            className={`rounded-audity border px-2 py-1 text-xs font-semibold ${
              filter.scope === scope
                ? "border-audity-primary bg-audity-primary text-white"
                : "border-audity-border text-audity-secondary hover:border-audity-borderStrong"
            }`}
            onClick={() => onChange({ scope })}
          >
            {scope === "all" ? "All" : scope === "open" ? "Only open" : "Only closed"}
          </button>
        ))}
      </div>

      <select
        className="audity-input h-7 max-w-[160px] text-xs"
        value={filter.owner}
        onChange={(event) => onChange({ owner: event.target.value })}
      >
        <option value="">Any owner</option>
        {owners.map((owner) => (
          <option key={owner} value={owner}>
            {owner}
          </option>
        ))}
      </select>

      <input
        type="search"
        className="audity-input h-7 flex-1 min-w-[180px] text-xs"
        placeholder="Search across findings, risks, roadmap…"
        value={filter.search}
        onChange={(event) => onChange({ search: event.target.value })}
      />

      {(filter.scope !== "all" || filter.owner || filter.search) ? (
        <button
          type="button"
          className="text-xs font-semibold text-audity-muted hover:text-audity-secondary"
          onClick={() => onChange({ scope: "all", owner: "", search: "" })}
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
