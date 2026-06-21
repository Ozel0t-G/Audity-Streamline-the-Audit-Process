import { useMemo, useState } from "react";
import {
  manualArticles,
  manualCategories,
  type ManualArticle,
  type ManualBlock
} from "../data/manualSections";

const audienceLabels: Record<ManualArticle["audience"], { label: string; className: string }> = {
  user: { label: "User", className: "border-audity-primary text-audity-primary" },
  auditor: { label: "Auditor", className: "border-audity-success text-audity-success" },
  admin: { label: "Admin", className: "border-audity-warning text-audity-warning" }
};

function matches(article: ManualArticle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (article.title.toLowerCase().includes(q)) return true;
  if (article.summary.toLowerCase().includes(q)) return true;
  if (article.keywords.some((keyword) => keyword.toLowerCase().includes(q))) return true;
  return article.sections.some((section) =>
    section.heading.toLowerCase().includes(q) ||
    section.blocks.some((block) => {
      if (block.kind === "paragraph") return block.text.toLowerCase().includes(q);
      if (block.kind === "note") return block.text.toLowerCase().includes(q);
      if (block.kind === "warning") return block.text.toLowerCase().includes(q);
      if (block.kind === "steps") return (block.intro?.toLowerCase().includes(q) ?? false) ||
        block.items.some((item) => item.toLowerCase().includes(q));
      if (block.kind === "fields") return (block.intro?.toLowerCase().includes(q) ?? false) ||
        block.items.some((field) => field.name.toLowerCase().includes(q) || field.description.toLowerCase().includes(q));
      if (block.kind === "code") return block.text.toLowerCase().includes(q);
      return false;
    })
  );
}

function Block({ block }: { block: ManualBlock }) {
  if (block.kind === "paragraph") {
    return <p className="text-sm leading-7 text-audity-secondary">{block.text}</p>;
  }
  if (block.kind === "note") {
    return (
      <div className="rounded-audity border-l-4 border-audity-primary bg-audity-primaryActive/20 px-3 py-2 text-sm leading-6 text-audity-text">
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-audity-primary">Note</span>
        {block.text}
      </div>
    );
  }
  if (block.kind === "warning") {
    return (
      <div className="rounded-audity border-l-4 border-audity-warning bg-audity-warning/10 px-3 py-2 text-sm leading-6 text-audity-text">
        <span className="mr-1 text-xs font-bold uppercase tracking-wider text-audity-warning">Warning</span>
        {block.text}
      </div>
    );
  }
  if (block.kind === "steps") {
    return (
      <div className="space-y-2">
        {block.intro ? <p className="text-sm font-medium text-audity-text">{block.intro}</p> : null}
        <ol className="space-y-2 text-sm leading-7 text-audity-secondary">
          {block.items.map((item, index) => (
            <li key={index} className="flex gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-audity-primary bg-audity-primaryActive/20 text-[11px] font-bold text-audity-primary">
                {index + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  if (block.kind === "fields") {
    return (
      <div className="space-y-2">
        {block.intro ? <p className="text-sm font-medium text-audity-text">{block.intro}</p> : null}
        <dl className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-x-4">
          {block.items.map((field) => (
            <div key={field.name} className="contents">
              <dt className="text-sm font-semibold text-audity-text">{field.name}</dt>
              <dd className="text-sm leading-6 text-audity-secondary">{field.description}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  if (block.kind === "code") {
    return (
      <pre className="overflow-x-auto rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-xs leading-5 text-audity-text">
        <code>{block.text}</code>
      </pre>
    );
  }
  return null;
}

export function ManualPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeArticleId, setActiveArticleId] = useState<string>(manualArticles[0]?.id ?? "");

  const filteredArticles = useMemo(
    () => manualArticles.filter((article) =>
      (!activeCategory || article.category === activeCategory) && matches(article, query)
    ),
    [activeCategory, query]
  );

  const activeArticle = useMemo(() => {
    const exact = filteredArticles.find((article) => article.id === activeArticleId);
    if (exact) return exact;
    const inAllArticles = manualArticles.find((article) => article.id === activeArticleId);
    if (inAllArticles && !filteredArticles.length) return inAllArticles;
    return filteredArticles[0] ?? inAllArticles ?? null;
  }, [activeArticleId, filteredArticles]);

  const articlesByCategory = useMemo(() => {
    const map = new Map<string, ManualArticle[]>();
    for (const article of filteredArticles) {
      const list = map.get(article.category) ?? [];
      list.push(article);
      map.set(article.category, list);
    }
    return map;
  }, [filteredArticles]);

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-14 lg:max-h-[calc(100vh-3.5rem)] lg:overflow-y-auto lg:pr-1">
        <div className="rounded-audity border border-audity-border bg-audity-panel p-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search articles, keywords"
            className="audity-input mb-3"
            aria-label="Search the manual"
          />
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`rounded-audity border px-2 py-0.5 text-xs font-semibold ${activeCategory === null ? "border-audity-primary bg-audity-primaryActive/20 text-audity-text" : "border-audity-borderStrong text-audity-secondary hover:border-audity-primary hover:text-audity-text"}`}
              onClick={() => setActiveCategory(null)}
            >
              All
            </button>
            {manualCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`rounded-audity border px-2 py-0.5 text-xs font-semibold ${activeCategory === category.id ? "border-audity-primary bg-audity-primaryActive/20 text-audity-text" : "border-audity-borderStrong text-audity-secondary hover:border-audity-primary hover:text-audity-text"}`}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </div>
          {manualCategories.map((category) => {
            const items = articlesByCategory.get(category.id) ?? [];
            if (!items.length) return null;
            return (
              <div key={category.id} className="mb-3">
                <p className="mb-1 text-[11px] font-medium tracking-wide text-audity-muted">{category.label}</p>
                <nav className="space-y-0.5">
                  {items.map((article) => (
                    <button
                      key={article.id}
                      type="button"
                      onClick={() => setActiveArticleId(article.id)}
                      className={`block w-full rounded-audity px-2 py-1.5 text-left text-sm ${activeArticle?.id === article.id ? "bg-audity-primaryActive/30 font-semibold text-audity-text" : "text-audity-secondary hover:bg-audity-panelAlt hover:text-audity-text"}`}
                    >
                      {article.title}
                    </button>
                  ))}
                </nav>
              </div>
            );
          })}
          {!filteredArticles.length ? (
            <p className="text-xs text-audity-muted">No articles match the search.</p>
          ) : null}
        </div>
      </aside>

      <article className="min-w-0">
        {activeArticle ? (
          <div className="rounded-audity border border-audity-border bg-audity-panel p-5 lg:p-7">
            <header className="mb-5 border-b border-audity-border pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium tracking-wide text-audity-primary">
                  {manualCategories.find((category) => category.id === activeArticle.category)?.label}
                </span>
                <span
                  className={`rounded-audity border px-2 py-0.5 text-[11px] font-medium tracking-wide ${audienceLabels[activeArticle.audience].className}`}
                >
                  {audienceLabels[activeArticle.audience].label}
                </span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold text-audity-text">{activeArticle.title}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-audity-secondary">{activeArticle.summary}</p>
              {activeArticle.screenshot ? (
                <p className="mt-3 rounded-audity border border-audity-border bg-audity-page px-3 py-2 text-xs text-audity-muted">{activeArticle.screenshot}</p>
              ) : null}
              {activeArticle.keywords.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {activeArticle.keywords.map((keyword) => (
                    <button
                      type="button"
                      key={keyword}
                      className="rounded-audity border border-audity-borderStrong bg-audity-page px-2 py-0.5 text-[11px] text-audity-secondary hover:border-audity-primary hover:text-audity-primary"
                      onClick={() => setQuery(keyword)}
                      title={`Filter by "${keyword}"`}
                    >
                      {keyword}
                    </button>
                  ))}
                </div>
              ) : null}
            </header>
            <div className="space-y-6">
              {activeArticle.sections.map((section) => (
                <section key={section.heading}>
                  <h2 className="mb-3 text-lg font-semibold text-audity-text">{section.heading}</h2>
                  <div className="space-y-3">
                    {section.blocks.map((block, index) => <Block key={index} block={block} />)}
                  </div>
                </section>
              ))}
            </div>
            {activeArticle.related?.length ? (
              <footer className="mt-6 border-t border-audity-border pt-4">
                <p className="mb-2 text-[11px] font-medium tracking-wide text-audity-muted">Related articles</p>
                <div className="flex flex-wrap gap-2">
                  {activeArticle.related.map((relatedId) => {
                    const related = manualArticles.find((article) => article.id === relatedId);
                    if (!related) return null;
                    return (
                      <button
                        type="button"
                        key={relatedId}
                        onClick={() => {
                          setQuery("");
                          setActiveCategory(null);
                          setActiveArticleId(relatedId);
                        }}
                        className="rounded-audity border border-audity-borderStrong bg-audity-page px-2.5 py-1 text-sm font-semibold text-audity-primary hover:border-audity-primary"
                      >
                        {related.title}
                      </button>
                    );
                  })}
                </div>
              </footer>
            ) : null}
          </div>
        ) : (
          <div className="rounded-audity border border-dashed border-audity-border bg-audity-panel/40 p-10 text-center text-sm text-audity-muted">
            No article selected.
          </div>
        )}
      </article>
    </div>
  );
}
