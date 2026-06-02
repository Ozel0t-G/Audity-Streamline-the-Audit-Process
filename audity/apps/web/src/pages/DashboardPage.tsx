import { useAuth } from "../auth/AuthProvider";

export function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-audity-app text-audity-text">
      <header className="flex h-12 items-center justify-between border-b border-audity-border bg-audity-topnav px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-7 w-7 place-items-center rounded-audity border border-audity-borderStrong bg-audity-panel text-sm font-bold text-audity-primary">
            A
          </div>
          <span className="text-sm font-semibold">Audity</span>
        </div>
        <button
          className="h-8 rounded-audity border border-audity-borderStrong bg-audity-panel px-3 text-sm text-audity-secondary hover:border-audity-primary hover:text-audity-text"
          onClick={() => void logout()}
        >
          Logout
        </button>
      </header>
      <div className="grid min-h-[calc(100vh-48px)] grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="border-r border-audity-border bg-audity-sidebar p-5">
          <p className="mb-3 text-xs font-semibold uppercase text-audity-muted">Workspace</p>
          <div className="rounded-audity bg-audity-primaryActive px-3 py-2 text-sm font-semibold">
            Dashboard
          </div>
        </aside>
        <section className="bg-audity-page p-5">
          <div className="mb-5 border-b border-audity-border pb-4">
            <p className="text-xs font-semibold uppercase text-audity-primary">Authenticated</p>
            <h1 className="mt-1 text-2xl font-semibold">Dashboard</h1>
            <p className="mt-2 text-sm text-audity-secondary">
              {user?.email} · {user?.role}
            </p>
          </div>
          <div className="min-h-80 rounded-audity border border-audity-border bg-audity-panel" />
        </section>
      </div>
    </main>
  );
}
