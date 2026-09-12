import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Zap } from "lucide-react";
import { PROJECTIONS } from "@/lib/sim/projections";
import { patientById } from "@/lib/sim/patients";
import { useSim } from "@/lib/sim/store";
import { Button } from "@/components/ui/button";

const TEST_PATIENT = "amara";

const GROUPS = [
  "Thorax",
  "Abdomen",
  "Pelvis & hips",
  "Spine",
  "Upper limb",
  "Lower limb",
  "Skull",
];

export function TestExposure() {
  const setProjection = useSim(s => s.setProjection);
  const applyHandbook = useSim(s => s.applyHandbook);
  const patchExposure = useSim(s => s.patchExposure);
  const expose = useSim(s => s.expose);
  const result = useSim(s => s.result);
  const exposing = useSim(s => s.exposing);
  const error = useSim(s => s.error);
  const [selected, setSelected] = useState<string | null>(null);
  const patient = patientById(TEST_PATIENT);

  const grouped = useMemo(() => GROUPS.map(region => ({
    region,
    projections: PROJECTIONS.filter(p => p.region === region),
  })).filter(g => g.projections.length), []);

  async function test(projectionId: string) {
    setSelected(projectionId);
    setProjection(projectionId);
    setTimeout(async () => {
      applyHandbook();
      patchExposure({ marker: null });
      await expose();
    }, 0);
  }

  return (
    <div className="min-h-dvh bg-bg text-foreground">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
        <Link to="/cases">
          <Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="size-4" />Library</Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold">Radiograph renderer test bench</h1>
          <p className="text-xs text-muted">Perfect reference positioning · fixed collimation · one-click exposure</p>
        </div>
        <span className="rounded border border-border px-2 py-1 text-[10px] font-semibold tracking-wide text-muted">TEMPORARY</span>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-xl border border-border bg-panel p-4">
          <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
            <div className="font-medium">Benchmark patient</div>
            <div className="mt-1 text-xs text-muted">{patient.name} · {patient.habitus} · {patient.heightCm} cm · no pathology</div>
            <div className="mt-2 text-xs text-muted">Each button resets the projection, applies the defined handbook position and CR, locks the defined SID and collimation, then exposes immediately.</div>
          </div>

          <div className="space-y-5">
            {grouped.map(group => (
              <div key={group.region}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{group.region}</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.projections.map(projection => {
                    const active = selected === projection.id && exposing;
                    return (
                      <Button
                        key={projection.id}
                        variant={selected === projection.id ? "default" : "outline"}
                        className="h-auto min-h-16 justify-between gap-3 px-3 py-2 text-left"
                        disabled={exposing}
                        onClick={() => void test(projection.id)}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{projection.name}</span>
                          <span className="mt-0.5 block text-[11px] opacity-70">{projection.sidCm} cm · {projection.collimationW} × {projection.collimationH} cm · {projection.kvp} kVp</span>
                        </span>
                        <Zap className={`size-4 shrink-0 ${active ? "animate-pulse" : ""}`} />
                      </Button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-xl border border-border bg-panel p-4 lg:sticky lg:top-20 lg:h-fit">
          <h2 className="font-semibold">Test result</h2>
          {selected ? (
            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded-lg border border-border bg-surface p-3">
                <div className="font-medium">{PROJECTIONS.find(p => p.id === selected)?.name}</div>
                <div className="mt-1 text-xs text-muted">{exposing ? "Exposing…" : result ? "Exposure complete" : "Preparing…"}</div>
              </div>
              {result?.dataUrl ? (
                <div className="overflow-hidden rounded-lg border border-border bg-black">
                  <img src={result.dataUrl} alt="Test radiograph" className="block h-auto w-full" />
                </div>
              ) : null}
              {result ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-border p-2"><span className="text-muted">Overall</span><div className="font-semibold">{Math.round(result.overall)}/100</div></div>
                  <div className="rounded border border-border p-2"><span className="text-muted">EI</span><div className="font-semibold">{Math.round(result.metrics.ei)}</div></div>
                </div>
              ) : null}
              {error ? <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">{error}</div> : null}
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">Choose an anatomical area above. No room setup or positioning interaction is required.</p>
          )}
        </aside>
      </main>
    </div>
  );
}
