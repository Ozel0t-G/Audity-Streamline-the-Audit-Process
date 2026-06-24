import { useCallback, useState, type FormEvent } from "react";
import { useApi } from "../../api/client";
import { useAuth } from "../../auth/AuthProvider";

const SERVICES = ["api", "web", "worker", "db", "redis", "storage"];

type CommandArg = { name: string; kind: "service" | "int"; required?: boolean; max?: number; default?: number };
type CommandSpec = { name: string; category: string; description: string; args?: CommandArg[] };

export function MaintenanceConsolePage() {
  const api = useApi();
  const { user } = useAuth();
  const isInstanceAdmin = user?.role === "Instance Admin";

  const [showAuth, setShowAuth] = useState(false);
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [commands, setCommands] = useState<CommandSpec[]>([]);
  const [argState, setArgState] = useState<Record<string, Record<string, string>>>({});
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const append = useCallback((text: string) => setLog((l) => `${l}${text}\n`), []);

  const submitAuth = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setError("");
      setBusy(true);
      try {
        const res = await api<{ grant: string }>("/api/admin/console/authorize", {
          method: "POST",
          body: JSON.stringify({ password, totp })
        });
        setGrant(res.grant);
        setShowAuth(false);
        setPassword("");
        setTotp("");
        const list = await api<{ commands: CommandSpec[] }>("/api/admin/console/commands");
        setCommands(list.commands);
        setLog("Session authorized. Pick a maintenance command below.\n");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authorization failed");
      } finally {
        setBusy(false);
      }
    },
    [api, password, totp]
  );

  const setArg = (cmd: string, name: string, value: string) =>
    setArgState((s) => ({ ...s, [cmd]: { ...(s[cmd] ?? {}), [name]: value } }));

  const run = useCallback(
    async (cmd: CommandSpec) => {
      if (!grant) return;
      const args = argState[cmd.name] ?? {};
      // Restarting api or web kills this very request path (browser → web → api), so the
      // response can't come back. Warn and treat the resulting drop as expected, not an error.
      const selfRestart = cmd.name === "restart" && (args.service === "api" || args.service === "web");
      setBusy(true);
      setError("");
      append(`$ ${cmd.name}${Object.entries(args).map(([k, v]) => ` ${k}=${v}`).join("")}`);
      if (selfRestart) {
        append(`note: restarting '${args.service}' drops this console connection — give it a few seconds, then reconnect.`);
      }
      try {
        const res = await api<{ ok: boolean; output: string }>("/api/admin/console/run", {
          method: "POST",
          body: JSON.stringify({ grant, command: cmd.name, args })
        });
        append(res.output || "(no output)");
      } catch (err) {
        if (selfRestart) {
          append("(connection dropped as expected — the restart was triggered; reconnect in a few seconds.)");
        } else {
          if (err instanceof Error && /re-authenticate|grant_invalid/i.test(err.message)) {
            setGrant(null);
            setCommands([]);
          }
          append(`error: ${err instanceof Error ? err.message : "failed"}`);
        }
      } finally {
        setBusy(false);
      }
    },
    [api, grant, argState, append]
  );

  const endSession = useCallback(async () => {
    if (grant) await api("/api/admin/console/end", { method: "POST", body: JSON.stringify({ grant }) }).catch(() => undefined);
    setGrant(null);
    setCommands([]);
    append("Session ended.");
  }, [api, grant, append]);

  if (!isInstanceAdmin) {
    return <p className="text-sm text-audity-error">Instance Admin role required.</p>;
  }

  const categories = Array.from(new Set(commands.map((c) => c.category)));

  return (
    <div className="space-y-4">
      <div className="rounded-audity border border-audity-error bg-audity-error/10 p-4">
        <h1 className="text-lg font-semibold text-audity-text">Maintenance Mode — Server Console</h1>
        <p className="mt-1 text-sm text-audity-error">
          ⚠ Runs a fixed allowlist of vetted maintenance commands. Every command is recorded and all
          Instance Admins are notified. Requires re-authentication with password + MFA.
        </p>
      </div>

      {error ? (
        <div className="rounded-audity border border-audity-error bg-audity-error/10 px-3 py-2 text-sm text-audity-error">{error}</div>
      ) : null}

      {!grant ? (
        <button type="button" className="audity-btn-primary" onClick={() => setShowAuth(true)}>
          Open console
        </button>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-audity-muted">Session active — allowlist commands only.</span>
            <button type="button" className="audity-btn-secondary audity-btn-sm" onClick={endSession}>
              End session
            </button>
          </div>

          {categories.map((cat) => (
            <div key={cat} className="rounded-audity border border-audity-border bg-audity-panel/40 p-3">
              <p className="audity-label mb-2">{cat}</p>
              <div className="space-y-2">
                {commands.filter((c) => c.category === cat).map((cmd) => (
                  <div key={cmd.name} className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="audity-btn-secondary audity-btn-sm font-mono"
                      disabled={busy}
                      onClick={() => run(cmd)}
                    >
                      {cmd.name}
                    </button>
                    {(cmd.args ?? []).map((arg) =>
                      arg.kind === "service" ? (
                        <select
                          key={arg.name}
                          className="audity-input w-32"
                          value={argState[cmd.name]?.[arg.name] ?? ""}
                          onChange={(e) => setArg(cmd.name, arg.name, e.target.value)}
                        >
                          <option value="">{arg.name}…</option>
                          {SERVICES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          key={arg.name}
                          type="number"
                          className="audity-input w-24"
                          placeholder={arg.name}
                          value={argState[cmd.name]?.[arg.name] ?? ""}
                          onChange={(e) => setArg(cmd.name, arg.name, e.target.value)}
                        />
                      )
                    )}
                    <span className="text-xs text-audity-muted">{cmd.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <pre className="h-[360px] w-full overflow-auto rounded-audity border border-audity-border bg-[#0b0f17] p-3 font-mono text-xs text-audity-text whitespace-pre-wrap">
            {log}
          </pre>
        </div>
      )}

      {showAuth ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitAuth} className="w-full max-w-sm space-y-3 rounded-audity border border-audity-border bg-audity-panel p-4">
            <h2 className="text-base font-semibold text-audity-text">Re-authenticate</h2>
            <p className="text-xs text-audity-muted">Confirm your password and MFA code to open the server console.</p>
            <label className="block text-sm">
              <span className="text-audity-muted">Password</span>
              <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full audity-input" required />
            </label>
            <label className="block text-sm">
              <span className="text-audity-muted">MFA code (or recovery code)</span>
              <input type="text" inputMode="numeric" autoComplete="one-time-code" value={totp} onChange={(e) => setTotp(e.target.value)} className="mt-1 w-full audity-input" required />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="audity-btn-secondary" onClick={() => setShowAuth(false)}>Cancel</button>
              <button type="submit" className="audity-btn-primary" disabled={busy}>{busy ? "Authorizing…" : "Open console"}</button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
