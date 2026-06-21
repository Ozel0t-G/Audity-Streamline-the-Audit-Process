import { useEffect, useState } from "react";
import { useApi } from "../../api/client";

type ProviderKind = "none" | "ollama" | "anthropic" | "openai";

type LlmConfig = {
  provider: ProviderKind;
  endpoint: string;
  model: string;
  hasKey: boolean;
  timeoutSeconds: number;
  maxTokens: number;
  updatedAt: string;
  updatedBy: string | null;
};

type TestResult = { ok: boolean; latencyMs: number; message?: string };

type UsageRow = {
  provider: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_cents: number;
  imports: number;
};

const DEFAULT_ENDPOINTS: Record<ProviderKind, string> = {
  none: "",
  ollama: "http://host.docker.internal:11434",
  anthropic: "https://api.anthropic.com",
  openai: "https://api.openai.com"
};

const DEFAULT_MODELS: Record<ProviderKind, string> = {
  none: "",
  ollama: "llama3.1:8b",
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o-mini"
};

const PROVIDER_OPTIONS: Array<{ value: ProviderKind; label: string; description: string }> = [
  { value: "none", label: "Off", description: "No AI. Framework imports use TODO placeholders that you fill in manually." },
  { value: "ollama", label: "Ollama (self-hosted)", description: "You install Ollama yourself, Audity connects via HTTP. No data leaves your network." },
  { value: "anthropic", label: "Anthropic (Claude)", description: "Cloud API. High quality output. Title + requirement are sent to Anthropic." },
  { value: "openai", label: "OpenAI", description: "Cloud API. Title + requirement are sent to OpenAI." }
];

export function AiSettingsPage() {
  const api = useApi();
  const [tab, setTab] = useState<"provider" | "usage" | "test">("provider");
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [draft, setDraft] = useState<LlmConfig | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [testTitle, setTestTitle] = useState("Privileged Access Review");
  const [testRequirement, setTestRequirement] = useState(
    "The organization shall review privileged accounts at least quarterly and document the outcome."
  );
  const [testLanguage, setTestLanguage] = useState<"de" | "en">("en");
  const [enrichResult, setEnrichResult] = useState<unknown>(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api<LlmConfig>("/api/admin/llm/config")
      .then((payload) => {
        if (!cancelled) {
          setConfig(payload);
          setDraft(payload);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load config");
      });
    return () => { cancelled = true; };
  }, [api]);

  useEffect(() => {
    if (tab !== "usage") return;
    let cancelled = false;
    void api<{ last30Days: UsageRow[] }>("/api/admin/llm/usage")
      .then((payload) => {
        if (!cancelled) setUsage(payload.last30Days);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [api, tab]);

  function updateDraft<K extends keyof LlmConfig>(key: K, value: LlmConfig[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setSaved("");
  }

  function selectProvider(provider: ProviderKind) {
    setDraft((current) => current ? {
      ...current,
      provider,
      endpoint: current.provider === provider ? current.endpoint : DEFAULT_ENDPOINTS[provider],
      model: current.provider === provider ? current.model : DEFAULT_MODELS[provider]
    } : current);
    setApiKeyInput("");
    setClearKey(false);
    setTestResult(null);
    setSaved("");
  }

  async function handleSave() {
    if (!draft) return;
    setError("");
    setSaved("");
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        provider: draft.provider,
        endpoint: draft.endpoint || undefined,
        model: draft.model || undefined,
        timeoutSeconds: draft.timeoutSeconds,
        maxTokens: draft.maxTokens
      };
      if (apiKeyInput.trim().length > 0) payload.apiKey = apiKeyInput.trim();
      if (clearKey) payload.clearKey = true;
      const result = await api<{ llmConfig: LlmConfig }>("/api/admin/llm/config", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setConfig(result.llmConfig);
      setDraft(result.llmConfig);
      setApiKeyInput("");
      setClearKey(false);
      setSaved("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setError("");
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api<TestResult>("/api/admin/llm/test", { method: "POST", body: JSON.stringify({}) });
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, latencyMs: 0, message: err instanceof Error ? err.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function handleEnrich() {
    setError("");
    setEnriching(true);
    setEnrichResult(null);
    try {
      const result = await api("/api/admin/llm/enrich-preview", {
        method: "POST",
        body: JSON.stringify({
          title: testTitle,
          requirement: testRequirement,
          language: testLanguage
        })
      });
      setEnrichResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrich failed");
    } finally {
      setEnriching(false);
    }
  }

  if (!draft || !config) {
    return <div className="text-sm text-audity-muted">Loading…</div>;
  }

  const isExternal = draft.provider === "anthropic" || draft.provider === "openai";
  const needsKey = isExternal;
  const showEndpoint = draft.provider !== "none";
  const showModel = draft.provider !== "none";

  return (
    <>
      <div className="audity-page-header">
        <p className="audity-page-kicker">Administration</p>
        <h1 className="audity-page-title">AI & Integrations</h1>
        <p className="audity-page-copy">
          Configure the LLM provider Audity uses for framework imports. The default is <strong>Off</strong> —
          AI is optional and only used when you actively turn it on.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-audity-border">
        {(["provider", "usage", "test"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === key
                ? "border-audity-primary text-audity-primary"
                : "border-transparent text-audity-secondary hover:text-audity-text"
            }`}
            onClick={() => setTab(key)}
          >
            {key === "provider" ? "Provider" : key === "usage" ? "Usage" : "Test Console"}
          </button>
        ))}
      </div>

      {error ? <div className="mb-3 rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div> : null}
      {saved ? <div className="mb-3 rounded-audity border border-audity-success bg-audity-success/10 px-3 py-2 text-sm text-audity-success">{saved}</div> : null}

      {tab === "provider" ? (
        <div className="grid gap-4 max-w-3xl">
          <fieldset className="audity-card">
            <legend className="audity-section-title px-1">Provider</legend>
            <div className="space-y-2">
              {PROVIDER_OPTIONS.map((option) => (
                <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-audity-md border p-3 transition ${draft.provider === option.value ? "border-audity-primary bg-audity-primaryActive/30" : "border-audity-border hover:border-audity-borderStrong"}`}>
                  <input
                    type="radio"
                    name="provider"
                    value={option.value}
                    checked={draft.provider === option.value}
                    onChange={() => selectProvider(option.value)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm font-semibold text-audity-text">{option.label}</p>
                    <p className="mt-0.5 text-xs text-audity-secondary">{option.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </fieldset>

          {showEndpoint || showModel ? (
            <fieldset className="audity-card">
              <legend className="audity-section-title px-1">Connection</legend>
              {draft.provider === "ollama" ? (
                <p className="mb-3 rounded-audity border border-audity-warning/40 bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
                  Ollama is not bundled with Audity — install it yourself on the host:
                  <code className="ml-1 text-[11px]">brew install ollama && ollama pull llama3.1:8b</code> or on Linux
                  <code className="ml-1 text-[11px]">curl -fsSL https://ollama.com/install.sh | sh && ollama pull llama3.1:8b</code>.
                  The default endpoint <code className="text-[11px]">http://host.docker.internal:11434</code> lets the Audity
                  container reach the host. If Ollama runs on a different machine, point the endpoint there.
                </p>
              ) : null}
              {isExternal ? (
                <div className="mb-3 rounded-audity border border-audity-warning/40 bg-audity-warning/10 px-3 py-2 text-xs text-audity-warning">
                  <p>
                    Framework imports send only <strong>title + requirement</strong> per control to
                    {draft.provider === "anthropic" ? " Anthropic" : " OpenAI"}. No audit answers,
                    no customer data, no PII.
                  </p>
                  <p className="mt-2">
                    Get your API key here:{" "}
                    <a
                      className="font-semibold underline"
                      href={draft.provider === "anthropic" ? "https://console.anthropic.com/settings/keys" : "https://platform.openai.com/api-keys"}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {draft.provider === "anthropic" ? "console.anthropic.com → API Keys" : "platform.openai.com → API keys"}
                    </a>{" "}
                    — sign in, create a new key, paste it below. Audity stores it encrypted
                    and never displays it again.
                  </p>
                </div>
              ) : null}
              {showEndpoint ? (
                <div className="mb-3">
                  <label className="audity-label">Endpoint</label>
                  <input
                    className="audity-input"
                    value={draft.endpoint}
                    placeholder={DEFAULT_ENDPOINTS[draft.provider]}
                    onChange={(event) => updateDraft("endpoint", event.target.value)}
                  />
                </div>
              ) : null}
              {showModel ? (
                <div className="mb-3">
                  <label className="audity-label">Model</label>
                  <input
                    className="audity-input"
                    value={draft.model}
                    placeholder={DEFAULT_MODELS[draft.provider]}
                    onChange={(event) => updateDraft("model", event.target.value)}
                  />
                </div>
              ) : null}
              {needsKey ? (
                <div className="mb-3">
                  <label className="audity-label">API Key</label>
                  <input
                    className="audity-input"
                    type="password"
                    autoComplete="off"
                    placeholder={config.hasKey ? "•••••••••• (saved)" : "Paste API key"}
                    value={apiKeyInput}
                    onChange={(event) => {
                      setApiKeyInput(event.target.value);
                      if (event.target.value) setClearKey(false);
                    }}
                  />
                  {config.hasKey ? (
                    <label className="mt-2 flex items-center gap-2 text-xs text-audity-secondary">
                      <input type="checkbox" checked={clearKey} onChange={(event) => setClearKey(event.target.checked)} />
                      Remove stored key
                    </label>
                  ) : null}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="audity-label">Timeout (Sekunden)</label>
                  <input
                    type="number"
                    className="audity-input"
                    min={5}
                    max={600}
                    value={draft.timeoutSeconds}
                    onChange={(event) => updateDraft("timeoutSeconds", Number(event.target.value) || 60)}
                  />
                </div>
                <div>
                  <label className="audity-label">Max Tokens</label>
                  <input
                    type="number"
                    className="audity-input"
                    min={256}
                    max={8000}
                    value={draft.maxTokens}
                    onChange={(event) => updateDraft("maxTokens", Number(event.target.value) || 2000)}
                  />
                </div>
              </div>
            </fieldset>
          ) : null}

          <div className="flex items-center gap-2">
            <button type="button" className="audity-btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </button>
            {draft.provider !== "none" ? (
              <button type="button" className="audity-btn-secondary" disabled={testing} onClick={handleTest}>
                {testing ? "Testing…" : "Test Connection"}
              </button>
            ) : null}
            {testResult ? (
              <span className={`text-sm ${testResult.ok ? "text-audity-success" : "text-audity-error"}`}>
                {testResult.ok ? "✓" : "✗"} {testResult.message ?? ""} {testResult.latencyMs ? `(${testResult.latencyMs} ms)` : ""}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-audity-muted">
            Zuletzt geändert: {new Date(config.updatedAt).toLocaleString()}
          </p>
        </div>
      ) : null}

      {tab === "usage" ? (
        <div className="max-w-3xl">
          <p className="mb-3 text-sm text-audity-secondary">Token and cost usage over the last 30 days.</p>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-audity-panelAlt text-left text-xs uppercase text-audity-muted">
              <tr>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2 text-right">Imports</th>
                <th className="px-3 py-2 text-right">Tokens in</th>
                <th className="px-3 py-2 text-right">Tokens out</th>
                <th className="px-3 py-2 text-right">Estimated cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((row) => (
                <tr key={row.provider ?? "none"} className="border-b border-audity-border">
                  <td className="px-3 py-2 font-medium">{row.provider ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.imports}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.tokens_in.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.tokens_out.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums">${(row.cost_cents / 100).toFixed(2)}</td>
                </tr>
              ))}
              {!usage.length ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-audity-muted">Noch keine Imports in den letzten 30 Tagen.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "test" ? (
        <div className="max-w-3xl grid gap-3">
          <p className="text-sm text-audity-secondary">
            Test enrichment behaviour against a single requirement without uploading a whole framework.
            {config.provider === "none" ? " (Currently provider = Off → TODO placeholders.)" : ""}
          </p>
          <div className="grid gap-2">
            <label className="audity-label">Title</label>
            <input className="audity-input" value={testTitle} onChange={(event) => setTestTitle(event.target.value)} />
            <label className="audity-label">Requirement</label>
            <textarea
              className="audity-input"
              rows={4}
              value={testRequirement}
              onChange={(event) => setTestRequirement(event.target.value)}
            />
            <div className="flex items-center gap-2">
              <label className="audity-label mb-0">Language</label>
              <select className="audity-input max-w-[120px]" value={testLanguage} onChange={(event) => setTestLanguage(event.target.value as "de" | "en")}>
                <option value="de">de</option>
                <option value="en">en</option>
              </select>
              <button type="button" className="audity-btn-primary" disabled={enriching} onClick={handleEnrich}>
                {enriching ? "Generating…" : "Enrich"}
              </button>
            </div>
          </div>
          {enrichResult ? (
            <pre className="audity-card overflow-auto text-xs">{JSON.stringify(enrichResult, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
