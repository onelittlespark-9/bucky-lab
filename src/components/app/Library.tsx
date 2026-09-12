import { useMemo, useState } from "react";
import { REQUEST_BANK } from "@/lib/sim/request-bank";
import type { ImagingRequest } from "@/lib/sim/requests";
import { patientById } from "@/lib/sim/patients";
import { requestSpecificity } from "@/lib/sim/request-specificity";
import { useSim } from "@/lib/sim/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 12;
const urgencyLabel = (urgency: ImagingRequest["urgency"]) => urgency === "stat" ? "STAT" : urgency === "urgent" ? "URGENT" : "ROUTINE";

export function Library() {
  const mode = useSim(s => s.mode); const setMode = useSim(s => s.setMode); const startExam = useSim(s => s.startExam);
  const completed = useSim(s => s.completedRequestIds); const resetRequests = useSim(s => s.resetRequests); const startNextRequest = useSim(s => s.startNextRequest); const completeRequestById = useSim(s => s.completeRequestById);
  const [selectedId, setSelectedId] = useState<string | null>(null); const [page, setPage] = useState(0); const [popup, setPopup] = useState<{ title: string; message: string } | null>(null);
  const pageCount = Math.ceil(REQUEST_BANK.length / PAGE_SIZE);
  const pageRequests = useMemo(() => REQUEST_BANK.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [page]);
  const selected = REQUEST_BANK.find(r => r.id === selectedId) ?? pageRequests[0] ?? null;
  const allDone = completed.length >= REQUEST_BANK.length; const remaining = REQUEST_BANK.length - completed.length;
  const specificity = selected ? requestSpecificity(selected) : null;

  function handleAccept(req: ImagingRequest) {
    if (completed.includes(req.id)) return;
    if (!req.isValid) { setPopup({ title: "Request requires a query", message: req.rejectionReason ?? "The request should be amended before exposure." }); return; }
    startExam(req.requestedProjections[0] ?? "pa-chest", req.patientId, req.id, 0);
  }
  function handleReject(req: ImagingRequest) {
    if (req.isValid) { setPopup({ title: "Do not reject this request", message: "The request is clinically appropriate as written. Continue to patient identification and examination unless you identify a genuine discrepancy." }); return; }
    completeRequestById(req.id); setPopup({ title: "Correct decision", message: `Correct — do not expose this patient until the request is amended. ${req.rejectionReason ?? "Query the referrer before proceeding."}` });
  }

  return <div className="min-h-dvh bg-bg">
    <header className="border-b border-border bg-surface px-4 py-4">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">General radiography · Worklist</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Bucky Lab</h1><p className="mt-1 text-sm text-muted">Select the next imaging request as you would from a departmental worklist. Read the history before you approach the patient.</p></div>
          <div className="flex items-center gap-2"><Button size="sm" variant={mode === "practice" ? "default" : "outline"} onClick={() => setMode("practice")}>Practice</Button><Button size="sm" variant={mode === "assessment" ? "default" : "outline"} onClick={() => setMode("assessment")}>Assessment</Button><Button size="sm" variant="outline" onClick={resetRequests}>Reset</Button></div>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-7xl px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm"><span><strong>{remaining}</strong> requests remaining</span><span className="text-muted">{completed.length} completed</span><span className="text-muted">{REQUEST_BANK.length} cases in bank</span></div>
        {!allDone ? <Button size="sm" onClick={startNextRequest}>Take next request</Button> : <Button size="sm" onClick={resetRequests}>Start new run</Button>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3"><div><p className="text-sm font-semibold">Imaging worklist</p><p className="text-xs text-muted">Page {page + 1} of {pageCount}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next</Button></div></div>
          <div className="grid grid-cols-[74px_minmax(150px,1.15fr)_minmax(170px,1.1fr)_minmax(190px,1.35fr)_90px] border-b border-border bg-bg px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted"><span>Priority</span><span>Patient</span><span>Examination</span><span>Clinical history</span><span>Status</span></div>
          <div>{pageRequests.map(req => { const active = req.id === selected?.id; const done = completed.includes(req.id); const patient = patientById(req.patientId); return <button key={req.id} type="button" onClick={() => setSelectedId(req.id)} className={`grid w-full grid-cols-[74px_minmax(150px,1.15fr)_minmax(170px,1.1fr)_minmax(190px,1.35fr)_90px] items-center border-b border-border px-4 py-3 text-left transition-colors ${active ? "bg-accent/10" : "hover:bg-bg/70"} ${done ? "opacity-55" : ""}`}>
            <span><Badge tone={req.urgency === "stat" ? "danger" : req.urgency === "urgent" ? "accent" : "muted"}>{urgencyLabel(req.urgency)}</Badge></span>
            <span className="min-w-0 pr-3"><span className="block truncate font-medium text-fg">{patient.name}</span><span className="block text-[11px] text-muted">{patient.age}y · {patient.sex}</span></span>
            <span className="min-w-0 pr-3"><span className="block font-medium text-fg">{req.title}</span><span className="block truncate text-[11px] text-muted">{req.requestedViewsLabel}</span></span>
            <span className="min-w-0 pr-3 text-xs leading-relaxed text-muted">{req.clinicalHistory}</span>
            <span>{done ? <Badge tone="ok">Done</Badge> : req.isValid ? <Badge tone="muted">Ready</Badge> : <Badge tone="danger">Query</Badge>}</span>
          </button>; })}</div>
        </section>

        <aside className="rounded-lg border border-border bg-surface p-5 xl:sticky xl:top-5 xl:h-fit">
          {selected && specificity ? <>
            <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium uppercase tracking-wider text-muted">Request detail</p><h2 className="mt-1 text-lg font-semibold">{selected.title}</h2></div><Badge tone={selected.urgency === "stat" ? "danger" : selected.urgency === "urgent" ? "accent" : "muted"}>{urgencyLabel(selected.urgency)}</Badge></div>
            <div className="mt-5 space-y-4 text-sm">
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Clinical history</p><p className="mt-1 leading-relaxed">{selected.clinicalHistory}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Requested examination</p><p className="mt-1 font-medium">{selected.requestedViewsLabel}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Patient</p><p className="mt-1">{patientById(selected.patientId).name} · {patientById(selected.patientId).age} years · {patientById(selected.patientId).habitus}</p><p className="mt-1 text-xs leading-relaxed text-muted">{patientById(selected.patientId).notes}</p></div>
              <div className="rounded-md border border-accent/30 bg-accent/5 p-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-muted">AOI to confirm with patient</p><p className="mt-2 text-xs leading-relaxed">Do not treat the request alone as the patient's story. During the examination, ask what brought them in, establish the symptomatic area and then confirm the requested examination and side before positioning.</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted">Side</span><p className="font-medium">{specificity.laterality}</p></div><div><span className="text-muted">Extent</span><p className="font-medium">{specificity.extent}</p></div><div className="col-span-2"><span className="text-muted">Anatomy</span><p className="font-medium">{specificity.anatomy}</p></div></div></div>
            </div>
            <div className="mt-6 grid gap-2"><Button variant="solid" className="w-full" disabled={completed.includes(selected.id)} onClick={() => handleAccept(selected)}>{completed.includes(selected.id) ? "Completed" : "Open patient examination"}</Button><Button variant="outline" className="w-full" disabled={completed.includes(selected.id)} onClick={() => handleReject(selected)}>Query / reject request</Button></div>
          </> : <p className="text-sm text-muted">Select a request to review it.</p>}
        </aside>
      </div>
    </main>

    {popup ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl"><p className="text-[11px] uppercase tracking-wider text-muted">Worklist decision</p><h2 className="mt-1 text-lg font-semibold">{popup.title}</h2><p className="mt-4 text-sm leading-relaxed">{popup.message}</p><div className="mt-6 flex justify-end"><Button onClick={() => setPopup(null)}>Understood</Button></div></div></div> : null}
  </div>;
}
