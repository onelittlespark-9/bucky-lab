import { useMemo, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import { requestFromBank } from "@/lib/sim/request-bank";
import { requestSpecificity } from "@/lib/sim/request-specificity";
import { departmentForRequest, edModifiedViewsForRequest, type EDModifiedViewId } from "@/lib/sim/departments";
import { poseForExtremityPlacement } from "@/lib/sim/extremity-kinematics";
import type { PlacementMode } from "@/lib/sim/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const OPTIONS: { id: PlacementMode; title: string; detail: string; badge: string }[] = [
  { id: "standing", title: "Standing", detail: "Patient erect, free-standing.", badge: "Erect · free standing" },
  { id: "seated", title: "Seated", detail: "Patient sitting on a stool or chair.", badge: "Erect · seated" },
  { id: "upright-bucky", title: "Upright bucky", detail: "Patient against the wall stand.", badge: "Wall stand" },
  { id: "table", title: "X-ray table", detail: "Patient on the table.", badge: "Table" },
];

function naturalPatientReply(history: string, anatomy: string) {
  const h = history.toLowerCase();
  if (/fall onto.*right hand|foosh.*right/i.test(h)) return "I fell onto my right hand and it's been swollen and sore since. The worst of it is around the wrist and thumb side.";
  if (/fall onto.*left hand|foosh.*left/i.test(h)) return "I landed on my left hand when I fell. My wrist and elbow have been hurting since, especially when I try to move them.";
  if (/punched a wall/i.test(h)) return "I punched a wall. The pain is mainly along the little-finger side of my right hand and it's quite swollen.";
  if (/inversion injury/i.test(h)) return "I rolled my ankle inwards. It's swollen on the outside and it hurts when I try to put weight on it.";
  if (/left knee/i.test(h)) return "I landed on my left knee. It's very sore and I can't straighten it properly.";
  if (/right shoulder/i.test(h)) return "I fell onto my right shoulder. It's painful and I can't move the arm normally.";
  if (/shortened.*externally rotated left leg/i.test(h)) return "I fell and hurt my left hip. I can't put weight through it, and the leg feels shorter and turned out.";
  if (/right wrist injury/i.test(h)) return "It's actually my right wrist that I injured. The request says left, but that's not the side that hurts.";
  if (/cervical|hard collar|road traffic/i.test(h)) return "I was in a road traffic collision and my neck hurts in the middle. I've been told not to move it and I'm still wearing the collar.";
  if (/chest|cough|breathlessness|pneumonia|pleuritic/i.test(h)) return "I've been having trouble with my breathing and chest symptoms. That's what brought me in.";
  if (/abdomen|abdominal|vomiting|distension/i.test(h)) return "My stomach has been painful and swollen, and I've been feeling sick.";
  return `It's mainly my ${anatomy.toLowerCase()} that's been bothering me. That's what I was hoping you could look at.`;
}

function interviewPrompts(anatomy: string, laterality: string) {
  const side = laterality === "not specified" ? "" : `, particularly on the ${laterality} side`;
  return [
    "Can you tell me a little about what's brought you in today?",
    `Where is it bothering you most${side}?`,
    `Just so I get this right, we're looking at your ${anatomy.toLowerCase()}${side}. Does that sound right?`,
  ];
}

export function SetupScreen() {
  const projectionId = useSim(s => s.projectionId); const patientId = useSim(s => s.patientId); const requestId = useSim(s => s.requestId); const equipment = useSim(s => s.equipment); const pose = useSim(s => s.pose);
  const confirmSetup = useSim(s => s.confirmSetup); const patchPose = useSim(s => s.patchPose); const setScreen = useSim(s => s.setScreen); const patchEquipment = useSim(s => s.patchEquipment); const patchTube = useSim(s => s.patchTube);
  const projection = projectionById(projectionId); const patient = patientById(patientId); const request = requestId ? requestFromBank(requestId) : null; const specificity = request ? requestSpecificity(request) : null; const selected = equipment.placement;
  const department = request ? departmentForRequest(request) : "outpatient"; const edViews = useMemo(() => request ? edModifiedViewsForRequest(request) : [], [request]);
  const suggested: PlacementMode = projection.setup === "wall" ? "upright-bucky" : "table";
  const [sideChoice, setSideChoice] = useState<"left" | "right" | null>(specificity?.laterality === "left" || specificity?.laterality === "right" ? specificity.laterality : null);
  const [interviewStep, setInterviewStep] = useState(0); const [patientConfirmed, setPatientConfirmed] = useState<boolean | null>(null); const [aoiConfirmed, setAoiConfirmed] = useState(false);
  const [mobility, setMobility] = useState<"standard" | "limited" | null>(null); const [modifiedView, setModifiedView] = useState<EDModifiedViewId>("standard");
  const extremityExam = !!specificity && /hand|wrist|elbow|shoulder|knee|ankle|foot|hip/i.test(specificity.anatomy); const needsSide = !!specificity && specificity.laterality === "not specified" && extremityExam;
  const prompts = specificity ? interviewPrompts(specificity.anatomy, specificity.laterality) : [];
  const reply = request && specificity ? naturalPatientReply(request.clinicalHistory, specificity.anatomy) : "";
  const discrepancy = !!request && !request.isValid;

  const enterRoom = () => {
    if (!specificity || !aoiConfirmed || (needsSide && !sideChoice) || patientConfirmed !== true) return;
    const view = edViews.find(v => v.id === modifiedView); const placement = view?.placement ?? selected;
    confirmSetup(placement); patchPose(poseForExtremityPlacement(projectionId, placement, view?.buckyTilt ?? equipment.buckyTilt, pose));
    if (department === "ed" && mobility === "limited" && view && view.id !== "standard") { patchEquipment({ placement, ...(view.buckyTilt !== undefined ? { buckyTilt: view.buckyTilt } : {}) }); if (view.tubeAngle !== undefined) patchTube({ angle: view.tubeAngle }); }
  };

  return <div className="flex min-h-dvh flex-col bg-bg">
    <header className="border-b border-border bg-surface px-4 py-3"><p className="text-xs text-muted">Patient examination · request review</p><div className="flex flex-wrap items-center gap-2"><h1 className="text-lg font-semibold text-fg">{projection.name}</h1><Badge tone={department === "ed" ? "danger" : department === "inpatient" ? "accent" : "muted"}>{department === "ed" ? "Emergency department" : department === "inpatient" ? "Inpatient" : "Outpatient"}</Badge></div><p className="text-sm text-muted">{patient.name} · {patient.age} years · {patient.habitus}</p></header>
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      {specificity && <section className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Before positioning</p><h2 className="mt-1 text-base font-semibold">Have a normal conversation first</h2></div><Badge tone={patientConfirmed === true ? "ok" : "muted"}>{patientConfirmed === true ? "Confirmed" : "Not confirmed"}</Badge></div>
        <p className="mt-2 text-sm leading-relaxed text-muted">Don't read the request back to the patient. Start open, listen to their answer, then narrow down the exact area and side before you position them.</p>
        <div className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">You ask</p><p className="mt-1 text-sm leading-relaxed">“{prompts[Math.min(interviewStep, 2)]}”</p>
          {interviewStep < 2 ? <Button className="mt-3" onClick={() => setInterviewStep(s => s + 1)}>{interviewStep === 0 ? "Listen to the patient" : "Clarify the area"}</Button> : <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={patientConfirmed === true ? "solid" : "outline"} onClick={() => { setPatientConfirmed(true); setAoiConfirmed(true); }}>Yes — that's right</Button><Button size="sm" variant={patientConfirmed === false ? "solid" : "outline"} onClick={() => { setPatientConfirmed(false); setAoiConfirmed(false); }}>No — that's not right</Button></div>}
        </div>
        {interviewStep > 0 && <div className="mt-3 rounded-lg border border-border bg-bg p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Patient replies</p><p className="mt-1 text-sm leading-relaxed">“{reply}”</p></div>}
        {patientConfirmed === false && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm"><strong>Stop before exposure.</strong><p className="mt-1 text-muted">The patient's answer does not confirm the request. Query it rather than guessing the area or side.</p>{discrepancy && <p className="mt-2 font-medium">This case deliberately contains a referral/patient discrepancy.</p>}<Button size="sm" variant="outline" className="mt-3" onClick={() => setScreen("library")}>Return to worklist / query request</Button></div>}
        {needsSide && patientConfirmed === true && <div className="mt-3"><p className="text-xs font-medium">Which side did the patient identify?</p><div className="mt-2 flex gap-2">{(["left", "right"] as const).map(side => <Button key={side} size="sm" variant={sideChoice === side ? "solid" : "outline"} onClick={() => { setSideChoice(side); setAoiConfirmed(true); }}>{side === "left" ? "Left" : "Right"}</Button>)}</div></div>}
        {patientConfirmed === true && <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3 text-xs"><p className="font-semibold">AOI confirmed</p><p className="mt-1 text-muted">{specificity.laterality} · {specificity.extent} · {specificity.anatomy}. {specificity.surface !== "not specified" ? `${specificity.surface} surface.` : "No surface has been specified."}</p></div>}
      </section>}

      {department === "ed" && <section className="rounded-xl border border-red-500/25 bg-surface p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-red-500">ED mobility check</p><h2 className="mt-1 text-base font-semibold">Can they safely achieve the standard position?</h2></div><Badge tone={mobility === "limited" ? "danger" : mobility === "standard" ? "ok" : "muted"}>{mobility === "limited" ? "Modified view" : mobility === "standard" ? "Standard view" : "Not assessed"}</Badge></div><p className="mt-2 text-sm text-muted">In trauma, don't force a painful or immobilised patient into a textbook position.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant={mobility === "standard" ? "solid" : "outline"} onClick={() => { setMobility("standard"); setModifiedView("standard"); }}>Can move safely</Button><Button size="sm" variant={mobility === "limited" ? "solid" : "outline"} onClick={() => setMobility("limited")}>Movement limited / painful</Button></div>{mobility === "limited" && <div className="mt-4 space-y-2">{edViews.map(view => <button key={view.id} type="button" onClick={() => setModifiedView(view.id)} className={`w-full rounded-lg border px-4 py-3 text-left ${modifiedView === view.id ? "border-accent bg-accent/10" : "border-border hover:border-muted"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{view.label}</span>{view.id !== "standard" && <Badge tone="accent">Modified</Badge>}</div><p className="mt-1 text-xs text-muted">{view.when}</p></button>)}</div>}</section>}

      <section className="rounded-xl border border-border bg-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Patient presentation</p><p className="mt-1 text-sm text-muted">Choose how the patient will be presented. The suggested setup is a starting point.</p><div className="mt-3 flex items-center gap-2 text-xs text-muted"><span>Typical setup</span><Badge tone="accent">{suggested === "upright-bucky" ? "Upright bucky" : "Table"}</Badge></div><div className="mt-3 flex flex-col gap-2">{OPTIONS.map(opt => { const active = selected === opt.id; return <button key={opt.id} type="button" onClick={() => patchEquipment({ placement: opt.id, buckyTilt: opt.id === "upright-bucky" ? 0 : equipment.buckyTilt })} className={`rounded-lg border px-4 py-3 text-left ${active ? "border-accent bg-accent/10" : "border-border bg-surface hover:border-muted"}`}><div className="flex items-center justify-between gap-2"><span className="font-medium">{opt.title}</span><span className="text-[11px] text-muted">{opt.badge}</span></div><p className="mt-1 text-xs text-muted">{opt.detail}</p></button>; })}</div></section>
      <div className="mt-auto flex flex-col gap-2 pt-2"><Button variant="solid" size="lg" className="w-full" disabled={interviewStep < 2 || patientConfirmed !== true || !aoiConfirmed || (needsSide && !sideChoice) || (department === "ed" && mobility === null)} onClick={enterRoom}>Continue to positioning</Button><Button variant="ghost" className="w-full" onClick={() => setScreen("library")}>Back to worklist</Button></div>
    </main>
  </div>;
}
