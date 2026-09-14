import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { PROJECTIONS } from "@/lib/sim/projections";

export const Route = createFileRoute("/critique-library")({ component: CritiqueLibrary });

function CritiqueLibrary() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("All");
  const regions = useMemo(() => ["All", ...Array.from(new Set(PROJECTIONS.map(p => p.region)))], []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PROJECTIONS.filter(p => (region === "All" || p.region === region) && (!needle || `${p.name} ${p.shortName} ${p.region} ${p.criteria.join(" ")}`.toLowerCase().includes(needle)));
  }, [query, region]);

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-4">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-bg hover:text-fg">
            <ArrowLeft className="size-4" /> Home
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Learning reference</p>
            <h1 className="mt-1 text-xl font-semibold">Radiograph critique library</h1>
          </div>
          <BookOpenCheck className="size-5 text-accent" />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Projection standards</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Use these criteria when reviewing positioning, anatomical coverage, centring and the expected structures on the final image.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search chest, pelvis, hand, C-spine…"
              className="h-11 rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-accent"
            />
            <select value={region} onChange={e => setRegion(e.target.value)} className="h-11 rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-accent">
              {regions.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {filtered.map(projection => (
            <article key={projection.id} className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{projection.region}</p>
                  <h2 className="mt-1 text-lg font-semibold">{projection.name}</h2>
                </div>
                <span className="rounded-full border border-border bg-bg px-2.5 py-1 text-[11px] font-medium text-muted">{projection.sidCm} cm SID</span>
              </div>

              <dl className="mt-5 space-y-3 text-sm">
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Position</dt><dd className="mt-1 leading-6">{projection.position}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Centring</dt><dd className="mt-1 leading-6">{projection.centring}</dd></div>
                <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Collimation</dt><dd className="mt-1 leading-6">{projection.collimation}</dd></div>
              </dl>

              <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">Image critique checkpoints</p>
                <ul className="mt-3 space-y-2 text-sm leading-6">
                  {projection.criteria.map(criterion => <li key={criterion} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" /> <span>{criterion}</span></li>)}
                </ul>
              </div>
            </article>
          ))}
        </div>

        {!filtered.length ? <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">No critique standards match your search.</div> : null}
      </div>
    </main>
  );
}
