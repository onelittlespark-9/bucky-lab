import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import type { PlacementMode } from "@/lib/sim/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const OPTIONS: {
  id: PlacementMode;
  title: string;
  detail: string;
  badge: string;
}[] = [
  { id: "standing", title: "Standing", detail: "Patient erect, free-standing.", badge: "Erect · free standing" },
  { id: "seated", title: "Seated", detail: "Patient sitting on a stool or chair.", badge: "Erect · seated" },
  { id: "upright-bucky", title: "Upright bucky", detail: "Patient against the wall stand. Bucky height and tilt are adjustable in the room.", badge: "Wall stand" },
  { id: "table", title: "X-ray table", detail: "Patient on the table. Table height and position are adjustable in the room.", badge: "Table" },
];

export function SetupScreen() {
  const projectionId = useSim((s) => s.projectionId);
  const patientId = useSim((s) => s.patientId);
  const equipment = useSim((s) => s.equipment);
  const confirmSetup = useSim((s) => s.confirmSetup);
  const setScreen = useSim((s) => s.setScreen);
  const patchEquipment = useSim((s) => s.patchEquipment);
  const projection = projectionById(projectionId);
  const patient = patientById(patientId);
  const selected = equipment.placement;
  const suggested: PlacementMode = projection.setup === "wall" ? "upright-bucky" : "table";

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="border-b border-border bg-surface px-4 py-3">
        <p className="text-xs text-muted">Positioning setup</p>
        <h1 className="text-lg font-semibold text-fg">{projection.name}</h1>
        <p className="text-sm text-muted">{patient.name} · {patient.habitus} · {patient.heightCm} cm</p>
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-4 p-4">
        <p className="text-sm leading-relaxed text-muted">Choose how the patient will be presented. The suggested setup is a starting point, not a restriction — extremities and joints can be adapted to the room equipment.</p>
        <div className="flex items-center gap-2 text-xs text-muted"><span>Typical setup</span><Badge tone="accent">{suggested === "upright-bucky" ? "Upright bucky" : "Table"}</Badge></div>
        <div className="flex flex-col gap-2">
          {OPTIONS.map((opt) => { const active=selected===opt.id; return <button key={opt.id} type="button" onClick={()=>patchEquipment({placement:opt.id,buckyTilt:opt.id==="upright-bucky"?0:equipment.buckyTilt})} className={"rounded-lg border px-4 py-3 text-left transition-colors "+(active?"border-accent bg-accent/10":"border-border bg-surface hover:border-muted")}><div className="flex items-center justify-between gap-2"><span className="font-medium text-fg">{opt.title}</span><span className="text-[11px] text-muted">{opt.badge}</span></div><p className="mt-1 text-xs leading-relaxed text-muted">{opt.detail}</p></button>; })}
        </div>
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs leading-relaxed text-muted">
          <strong className="text-fg">Extremity / joint variation</strong><br/>
          Use the upright bucky for standing or seated limb work, or tilt the bucky to 90° for a table-top detector position. Hands, wrists, elbows, knees, ankles and feet can therefore be presented against the detector without forcing every examination onto the fixed X-ray table.
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>patchEquipment({placement:"upright-bucky",buckyTilt:90})}>Tilt bucky 90° · table position</Button><Button size="sm" variant="outline" onClick={()=>patchEquipment({placement:"upright-bucky",buckyTilt:0})}>Return upright</Button></div>
        </div>
        <div className="mt-auto flex flex-col gap-2 pt-4"><Button variant="solid" size="lg" className="w-full" onClick={()=>confirmSetup(selected)}>Enter room with this setup</Button><Button variant="ghost" className="w-full" onClick={()=>setScreen("library")}>Back to library</Button></div>
      </main>
    </div>
  );
}
