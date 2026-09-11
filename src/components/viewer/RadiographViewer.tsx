import { useSim } from "@/lib/sim/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { projectionById } from "@/lib/sim/projections";
import { patientById } from "@/lib/sim/patients";
import type { Grade } from "@/lib/sim/types";

function toneFor(g: Grade): "ok" | "warn" | "danger" {
  return g === "excellent" ? "ok" : g === "acceptable" ? "warn" : "danger";
}

export function RadiographViewer() {
  const result = useSim((s) => s.result);
  const retake = useSim((s) => s.retake);
  const setScreen = useSim((s) => s.setScreen);
  const projectionId = useSim((s) => s.projectionId);
  const patientId = useSim((s) => s.patientId);
  const projection = projectionById(projectionId);
  const patient = patientById(patientId);

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No image. Return to the room and expose.
      </div>
    );
  }

  const { metrics, scores, overallGrade, overall } = result;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="flex min-h-64 items-center justify-center bg-well p-4">
        <img
          src={result.dataUrl}
          alt={`${projection.shortName} radiograph of ${patient.name}`}
          className="max-h-full max-w-full object-contain shadow-[0_0_40px_rgba(0,0,0,0.5)]"
        />
      </div>
      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-surface p-4 lg:border-l lg:border-t-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted">
              {patient.name} · {projection.shortName}
            </p>
            <h2 className="text-base font-medium">Image critique</h2>
          </div>
          <Badge tone={toneFor(overallGrade)}>
            {overallGrade} · {Math.round(overall * 100)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-elevated p-3">
          <Stat
            k="EI"
            v={metrics.ei.toFixed(0)}
            tone={metrics.eiStatus === "optimal" ? "ok" : metrics.eiStatus === "under" ? "warn" : "danger"}
          />
          <Stat k="Noise" v={metrics.noise.toFixed(2)} />
          <Stat k="DAP" v={`${metrics.dap.toFixed(1)}`} />
        </div>
        <p className="text-xs leading-relaxed text-muted">
          {metrics.eiStatus === "under" &&
            "Quantum mottle — the detector starved. Trabeculae and lung markings wash into grain. Increase mAs (or kVp) for this habitus."}
          {metrics.eiStatus === "over" &&
            "Overexposure — air spaces clip, contrast collapses, and dose is unjustified. The 15% kVp rule or halving mAs will pull this back."}
          {metrics.eiStatus === "optimal" &&
            "Detector signal is in the target window. Judge collimation, centring and rotation independently of density."}
        </p>

        <Separator />
        <ul className="space-y-3">
          {scores.map((s) => (
            <li key={s.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">{s.label}</span>
                <Badge tone={toneFor(s.grade)}>{s.grade}</Badge>
              </div>
              <p className="text-xs leading-relaxed text-muted">{s.detail}</p>
            </li>
          ))}
        </ul>

        {useSim.getState().mode === "practice" ? (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Essential image characteristics</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                {projection.criteria.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        <div className="mt-auto flex gap-2 pt-2">
          <Button variant="solid" className="flex-1" onClick={retake}>
            Retake
          </Button>
          <Button variant="outline" onClick={() => setScreen("library")}>
            Library
          </Button>
        </div>
      </aside>
    </div>
  );
}

function Stat({ k, v, tone }: { k: string; v: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{k}</p>
      <p className={`font-mono text-sm tabular-nums ${tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-fg"}`}>
        {v}
      </p>
    </div>
  );
}
