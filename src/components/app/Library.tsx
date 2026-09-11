import { useState } from "react";
import { IMAGING_REQUESTS, type ImagingRequest } from "@/lib/sim/requests";
import { patientById } from "@/lib/sim/patients";
import { useSim } from "@/lib/sim/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Library() {
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);
  const startExam = useSim((s) => s.startExam);
  const [selectedId, setSelectedId] = useState<string | null>(IMAGING_REQUESTS[0]?.id ?? null);
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);

  const selected = IMAGING_REQUESTS.find((r) => r.id === selectedId) ?? null;

  function handleAccept(req: ImagingRequest) {
    setRejectMsg(null);
    if (!req.isValid) {
      setRejectMsg(req.rejectionReason ?? "This request is not appropriate as written.");
      return;
    }
    const firstProjection = req.requestedProjections[0] ?? "pa-chest";
    startExam(firstProjection, req.patientId, req.id);
  }

  function handleReject(req: ImagingRequest) {
    if (!req.isValid) {
      setRejectMsg(req.rejectionReason ?? "Request rejected.");
      return;
    }
    setRejectMsg(
      "This request appears clinically appropriate. If you believe it should be rejected, discuss with a supervising radiographer.",
    );
  }

  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Bucky Lab</h1>
            <p className="text-sm text-muted">Imaging request review</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={mode === "practice" ? "default" : "outline"}
              onClick={() => setMode("practice")}
            >
              Practice
            </Button>
            <Button
              size="sm"
              variant={mode === "assessment" ? "default" : "outline"}
              onClick={() => setMode("assessment")}
            >
              Assessment
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          <p className="text-sm text-muted">
            Review each imaging request. Accept only if the examination matches the clinical history.
            Reject if the request is incorrect or incomplete.
          </p>

          {rejectMsg ? (
            <div className="rounded-md border border-border bg-elevated px-3 py-2 text-sm text-fg">
              {rejectMsg}
            </div>
          ) : null}

          <div className="space-y-2">
            {IMAGING_REQUESTS.map((req) => {
              const active = req.id === selectedId;
              return (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(req.id);
                    setRejectMsg(null);
                  }}
                  className={
                    "w-full rounded-lg border px-4 py-3 text-left transition-colors " +
                    (active
                      ? "border-accent bg-accent/10"
                      : "border-border bg-surface hover:border-muted")
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-fg">{req.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">{req.requestedViewsLabel}</p>
                    </div>
                    <Badge tone="muted">{req.id.replace("req-", "#")}</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="space-y-4">
          {selected ? (
            <div className="sticky top-6 rounded-lg border border-border bg-surface p-5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                Request detail
              </p>
              <h3 className="mt-1 text-lg font-medium">{selected.title}</h3>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted">Clinical history</p>
                  <p className="mt-1 leading-relaxed">{selected.clinicalHistory}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted">Requested examinations</p>
                  <p className="mt-1 font-medium">{selected.requestedViewsLabel}</p>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted">Patient</p>
                  <p className="mt-1">
                    {patientById(selected.patientId).name} · {patientById(selected.patientId).age} years ·{" "}
                    {patientById(selected.patientId).habitus}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Button variant="solid" className="w-full" onClick={() => handleAccept(selected)}>
                  Accept request & start examination
                </Button>
                <Button variant="outline" className="w-full" onClick={() => handleReject(selected)}>
                  Reject request
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-muted">
              Select an imaging request to review the clinical history and decide whether it is appropriate.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
