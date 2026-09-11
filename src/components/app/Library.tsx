import { PATIENTS } from "@/lib/sim/patients";
import { PROJECTIONS, REGIONS } from "@/lib/sim/projections";
import { useSim } from "@/lib/sim/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const HABITUS_LABEL: Record<string, string> = {
  asthenic: "Asthenic",
  hyposthenic: "Hyposthenic",
  sthenic: "Sthenic",
  hypersthenic: "Hypersthenic",
};

export function Library() {
  const patientId = useSim((s) => s.patientId);
  const setPatient = useSim((s) => s.setPatient);
  const startExam = useSim((s) => s.startExam);
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Radiographic laboratory</p>
          <h1 className="text-3xl font-medium tracking-tight text-fg sm:text-4xl">Bucky Lab</h1>
          <p className="text-sm leading-relaxed text-muted">
            Position living-scale models, collimate the light field, and expose. Images follow tissue
            attenuation — bone, air and soft tissue — so over- and underexposure fail the way they do on a real plate.
            Centring points follow Clark's handbook.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={mode === "practice" ? "default" : "outline"} onClick={() => setMode("practice")}>
            Practice
          </Button>
          <Button variant={mode === "assessment" ? "default" : "outline"} onClick={() => setMode("assessment")}>
            Assessment
          </Button>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-fg">Models</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {PATIENTS.map((p) => {
            const active = p.id === patientId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPatient(p.id)}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors",
                  active ? "border-accent bg-elevated" : "border-border bg-surface hover:border-muted",
                )}
              >
                <div className="mb-3 flex h-24 items-end justify-center">
                  <HabitusSilhouette
                    width={p.morph.torsoWidth}
                    abdomen={p.morph.abdomen}
                    skin={p.skin}
                    gown={p.gown}
                    hair={p.hair}
                  />
                </div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-[11px] text-muted">
                  {p.age} · {HABITUS_LABEL[p.habitus]} · {p.heightCm} cm
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {PATIENTS.find((p) => p.id === patientId)?.notes}
        </p>
      </section>

      {REGIONS.map((region) => {
        const items = PROJECTIONS.filter((p) => p.region === region);
        return (
          <section key={region} className="space-y-3">
            <h2 className="text-sm font-medium text-fg">{region}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((pr) => (
                <button
                  key={pr.id}
                  type="button"
                  onClick={() => startExam(pr.id)}
                  className="rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-muted"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{pr.name}</p>
                    <Badge>{pr.sidCm} cm</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted">{pr.centring}</p>
                  <p className="mt-3 font-mono text-[11px] tabular-nums text-subtle">
                    {pr.kvp} kVp · {pr.mas} mAs · {pr.grid ? "grid" : "no grid"}
                  </p>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function HabitusSilhouette({
  width,
  abdomen,
  skin,
  gown,
  hair,
}: {
  width: number;
  abdomen: number;
  skin: string;
  gown: string;
  hair: string;
}) {
  const w = 18 * width;
  const hip = 16 * width * (0.8 + abdomen * 0.15);
  return (
    <svg width="56" height="96" viewBox="0 0 56 96" aria-hidden="true">
      <ellipse cx="28" cy="12" rx="8" ry="9" fill={skin} />
      <ellipse cx="28" cy="8" rx="8" ry="6" fill={hair} />
      <rect x={28 - w * 0.35} y="20" width={w * 0.7} height="8" rx="3" fill={skin} />
      <path
        d={`M ${28 - w} 30 Q ${28 - hip} 58 ${28 - hip * 0.7} 72 L ${28 + hip * 0.7} 72 Q ${28 + hip} 58 ${28 + w} 30 Z`}
        fill={gown}
      />
      <rect x={28 - 6} y="70" width="5" height="22" rx="2" fill={skin} />
      <rect x={28 + 1} y="70" width="5" height="22" rx="2" fill={skin} />
    </svg>
  );
}
