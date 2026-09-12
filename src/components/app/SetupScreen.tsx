import { useMemo, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import { requestFromBank } from "@/lib/sim/request-bank";
import { requestSpecificity } from "@/lib/sim/request-specificity";
import { departmentForRequest, edModifiedViewsForRequest } from "@/lib/sim/departments";
import { poseForExtremityPlacement } from "@/lib/sim/extremity-kinematics";
import type { PlacementMode } from "@/lib/sim/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const OPTIONS: { id: PlacementMode; title: string; detail: string; badge: string }[] = [
  { id: "standing", title: "Standing", detail: "Patient erect, free-standing.", badge: "Erect · free standing" },
  { id: "seated", title: "Seated", detail: "Patient sitting on a stool or chair.", badge: "Erect · seated" },
  { id: "upright-bucky", title: "Upright bucky", detail: "Patient against the wall stand. Bucky height and tilt are adjustable in the room.", badge: "Wall stand" },
  { id: "table", title: "X-ray table", detail: "Patient on the table. Table height and position are adjustable in the room.", badge: "Table" },
];

function patientReply(history: string, anatomy: string) {
  const lower = history.toLowerCase();
  if (lower.includes("fall onto the outstretched right hand")) return "I fell onto my outstretched right hand. My wrist has been swollen and it hurts around the thumb side.";
  if (lower.includes("punched a wall")) return "I punched a wall with my right hand. The pain and swelling are mainly over the little-finger side of my hand.";
  if (lower.includes("inversion injury")) return "I rolled my right ankle inwards. It is swollen and painful around the outside.";
  if (lower.includes("left knee")) return "I fell onto my left knee. It is very painful and I cannot straighten it properly.";
  if (lower.includes("left hand with elbow pain")) return "I fell onto my left hand and now my left elbow is painful and swollen.";
  if (lower.includes("right shoulder")) return "I fell onto my right shoulder. It is very painful and difficult to move.";
  if (lower.includes("shortened externally rotated left leg")) return "I fell and hurt my left hip. I cannot put weight through it and my left leg feels shorter and turned out.";
  if (lower.includes("right wrist injury")) return "It is actually my right wrist that I injured — not my left.";
  if (lower.includes("neck") || lower.includes("cervical")) return "I was involved in a road traffic collision and my neck is painful in the middle. I have been told to keep this collar on.";
  return `I'm here because of the problem described in my referral, involving my ${anatomy.toLowerCase()}.`;
}

export function SetupScreen() {
  const projectionId = useSim(s => s.projectionId); const patientId = useSim(s => s.patientId); const requestId = useSim(s => s.requestId); const equipment = useSim(s => s.equipment); const pose = useSim(s => s.pose);
  const confirmSetup = useSim(s => s.confirmSetup); const patchPose = useSim(s => s.patchPose); const setScreen = useSim(s => s.setScreen); const patchEquipment = useSim(s => s.patchEquipment); const patchTube = useSim(s => s.patchTube);
  const projection = projectionById(projectionId); const patient = patientById(patientId); const request = requestId ? requestFromBank(requestId) : null; const specificity = request ? requestSpecificity(request) : null; const selected = equipment.placement;
  const department = request ? departmentForRequest(request) : "outpatient"; const edViews = useMemo(() => request ? edModifiedViewsForRequest(request) : [], [request]);
  const suggested: PlacementMode = projection.setup === "wall" ? "upright-bucky" : "table";
  const [sideChoice, setSideChoice] = useState<"left" | "right" | null>(specificity?.laterality === "left" || specificity?.laterality === "right" ? specificity.laterality : null);
  const [interviewStarted, setInterviewStarted] = useState(false); const [patientConfirmed, setPatientConfirmed] = useState<boolean | null>(null); const [aoiConfirmed, setAoiConfirmed] = useState(false);
  const [mobility, setMobility] = useState<"standard" | "limited" | null>(null); const [modifiedView, setModifiedView] = useState("standard");
  const extremityExam = !!specificity && /hand|wrist|elbow|shoulder|knee|ankle|foot|hip/i.test(specificity.anatomy); const needsSide = !!specificity && specificity.laterality === "not specified" && extremityExam;
  const reply = request && specificity ? patientReply(request.clinicalHistory, specificity.anatomy) : "";
  const discrepancy = !!request && !request.isValid;
  const edShoulder = department === "ed" && edViews.some(v => v.id === "seated-axial-shoulder");

  const enterRoom = () => {
    if (!specificity || !aoiConfirmed || (needsSide && !sideChoice) || patientConfirmed !== true) return;
    const placement = modifiedView === "seated-axial-shoulder" ? "seated" : selected;
    confirmSetup(placement); patchPose(poseForExtremityPlacement(projectionId, placement, equipment.buckyTilt, pose));
    if (modifiedView === "seated-axial-shoulder") {
      patchEquipment({ placement: "seated", buckyTilt: 45 });
      patchTube({ angle: 45 });
    }
  };

  return <div className="flex min-h-dvh flex-col bg-bg">
    <header className="border-b border-border bg-surface px-4 py-3"><p className="text-xs text-muted">Patient examination · request review</p><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold text-fg">{projection.name}</h1><Badge tone={department === "ed" ? "danger" : department === "inpatient" ? "accent" : "muted"}>{department === "ed" ? "Emergency department" : department === "inpatient" ? "Inpatient" : "Outpatient"}</Badge></div><p className="text-sm text-muted">{patient.name} · {patient.age} years · {patient.habitus}</p></header>
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      {specificity && <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Before positioning</p><h2 className="mt-1 text-base font-semibold">Talk to the patient and establish the area of interest</h2></div><Badge tone={patientConfirmed === true ? "ok" : "muted"}>{patientConfirmed === true ? "Confirmed" : "Not confirmed"}</Badge></div>
        <p className="mt-2 text-sm leading-relaxed text-muted">Do not simply repeat the request. Use the history, then ask the patient what happened and confirm the body part and side in plain language.</p>
        {!interviewStarted ? <Button className="mt-4" onClick={() => setInterviewStarted(true)}>Ask: “Can you tell me why you're here today?”</Button> : <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-border bg-bg p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Patient says</p><p className="mt-1 text-sm leading-relaxed">“{reply}”</p></div>
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Now confirm the examination</p><p className="mt-1 text-sm leading-relaxed">“I understand you're expecting an X-ray of your <strong>{specificity.anatomy}</strong>{specificity.laterality !== "not specified" ? ` on the ${specificity.laterality} side` : ""}. Is that correct?”</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={patientConfirmed === true ? "solid" : "outline"} onClick={() => { setPatientConfirmed(true); setAoiConfirmed(true); }}>Yes — that's right</Button><Button size="sm" variant={patientConfirmed === false ? "solid" : "outline"} onClick={() => { setPatientConfirmed(false); setAoiConfirmed(false); }}>No — that's not right</Button></div></div>
          {patientConfirmed === false && <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm"><strong className="text-fg">Stop before exposure.</strong><p className="mt-1 text-muted">The patient's answer does not confirm the request. Query the request rather than choosing an AOI yourself.</p>{discrepancy && <p className="mt-2 font-medium text-fg">This scenario is deliberately inconsistent: the referral does not match the patient's reported side.</p>}<Button size="sm" variant="outline" className="mt-3" onClick={() => setScreen("library")}>Return to worklist / query request</Button></div>}
          {needsSide && patientConfirmed === true && <div className="mt-3"><p className="text-xs font-medium text-fg">Confirm the side you heard from the patient:</p><div className="mt-2 flex gap-2">{(["left", "right"] as const).map(side => <Button key={side} size="sm" variant={sideChoice === side ? "solid" : "outline"} onClick={() => { setSideChoice(side); setAoiConfirmed(false); }}>{side === "left" ? "Left" : "Right"}</Button>)}</div></div>}
        </div>}
        {patientConfirmed === true && <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3 text-xs"><p className="font-semibold text-fg">AOI confirmed</p><p className="mt-1 text-muted">{specificity.laterality} · {specificity.extent} · {specificity.anatomy}. {specificity.surface !== "not specified" ? `${specificity.surface} surface.` : "No surface has been specified — do not invent one."}</p></div>}
      </section>}

      {department === "ed" && <section className="rounded-xl border border-red-500/25 bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">ED mobility check</p><h2 className="mt-1 text-base font-semibold">Can the patient safely achieve the standard position?</h2></div><Badge tone={mobility === "limited" ? "danger" : mobility === "standard" ? "ok" : "muted"}>{mobility === "limited" ? "Modified view" : mobility === "standard" ? "Standard view" : "Not assessed"}</Badge></div><p className="mt-2 text-sm leading-relaxed text-muted">In trauma, the patient's ability to move is part of the examination decision. Never force a painful shoulder, suspected fracture or immobilised patient into a textbook position.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={mobility === "standard" ? "solid" : "outline"} onClick={() => { setMobility("standard"); setModifiedView("standard"); }}>Can move safely</Button><Button size="sm" variant={mobility === "limited" ? "solid" : "outline"} onClick={() => setMobility("limited")}>Movement limited / painful</Button></div>{mobility === "limited" && <div className="mt-4 space-y-2">{edViews.map(view => <button key={view.id} type="button" onClick={() => setModifiedView(view.id)} className={`w-full rounded-lg border px-4 py-3 text-left ${modifiedView === view.id ? "border-accent bg-accent/10" : "border-border hover:border-muted"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium text-fg">{view.label}</span>{view.id === "seated-axial-shoulder" && <Badge tone="accent">Recommended when appropriate</Badge>}</div><p className="mt-1 text-xs leading-relaxed text-muted">{view.when}</p>{view.id !== "standard" && <div className="mt-2 grid gap-1 text-xs text-muted"><span><strong className="text-fg">Patient:</strong> {view.positioning}</span><span><strong className="text-fg">Tube:</strong> {view.tube}</span><span><strong className="text-fg">Bucky:</strong> {view.bucky}</span></div>}</button>)}</div>}</section>}

      <section className="rounded-xl border border-border bg-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Patient presentation</p><p className="mt-1 text-sm leading-relaxed text-muted">Choose how the patient will be presented. The suggested setup is a starting point, not a restriction.</p><div className="mt-3 flex items-center gap-2 text-xs text-muted"><span>Typical setup</span><Badge tone="accent">{suggested === "upright-bucky" ? "Upright bucky" : "Table"}</Badge></div><div className="mt-3 flex flex-col gap-2">{OPTIONS.map(opt => { const active = selected === opt.id; return <button key={opt.id} type="button" onClick={() => patchEquipment({ placement: opt.id, buckyTilt: opt.id === "upright-bucky" ? 0 : equipment.buckyTilt })} className={`rounded-lg border px-4 py-3 text-left transition-colors ${active ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-muted"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium text-fg">{opt.title}</span><span className="text-[11px] text-muted">{opt.badge}</span></div><p className="mt-1 text-xs leading-relaxed text-muted">{opt.detail}</p></button>; })}</div></section>

      <div className="rounded-lg border border-accent/30 bg-accent/5 p-3 text-xs leading-relaxed text-muted"><strong className="text-fg">Extremity / joint variation</strong><br/>Use the upright bucky for standing or seated limb work, or tilt the bucky to 90° for a table-top detector position. Hands, wrists, elbows, knees, ankles and feet can therefore be presented against the detector without forcing every examination onto the fixed X-ray table.<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => patchEquipment({ placement: "upright-bucky", buckyTilt: 90 })}>Tilt bucky 90° · table position</Button><Button size="sm" variant="outline" onClick={() => patchEquipment({ placement: "upright-bucky", buckyTilt: 0 })}>Return upright</Button></div></div>
      <div className="mt-auto flex flex-col gap-2 pt-2"><Button variant="solid" size="lg" className="w-full" disabled={!interviewStarted || patientConfirmed !== true || !aoiConfirmed || (needsSide && !sideChoice) || (department === "ed" && mobility === null)} onClick={enterRoom}>Continue to positioning</Button><Button variant="ghost" className="w-full" onClick={() => setScreen("library")}>Back to worklist</Button></div>
    </main>
  </div>;
}
