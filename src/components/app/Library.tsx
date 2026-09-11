import { useState } from "react";
import { IMAGING_REQUESTS, type ImagingRequest, PATHOLOGIES } from "@/lib/sim/requests";
import { patientById } from "@/lib/sim/patients";
import { useSim } from "@/lib/sim/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const URGENCY_TONE: Record<string, "ok" | "warn" | "danger"> = {
  routine: "ok",
  urgent: "warn",
  stat: "danger",
};

export function Library() {
  const startExam = useSim((s) => s.startExam);
  const mode = useSim((s) => s.mode);
  const setMode = useSim((s) => s.setMode);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "accepted" | "rejected-correct" | "rejected-wrong" | "accepted-invalid";
    message: string;
  } | null>(null);

  const selected = selectedId ? IMAGING_REQUESTS.find((r) => r.id === selectedId) : null;

  function handleAccept(req: ImagingRequest) {
    if (!req.isValid) {
      setFeedback({
        type: "accepted-invalid",
        message:
          "This request should not have been accepted. " +
          (req.rejectionReason ?? "The request does not match the clinical history."),
      });
      return;
    }

    // For now start the first requested projection (full multi-view support later)
    const firstProjection = req.requestedProjections[0] ?? "pa-chest";
    startExam(firstProjection, req.patientId, req.id);
  }

  function handleReject(req: ImagingRequest) {
    if (req.isValid) {
      setFeedback({
        type: "rejected-wrong",
        message:
          "This request is appropriate and should have been accepted. The clinical history and requested projections match.",
      });
      return;
    }

    setFeedback({
      type: "rejected-correct",
      message: req.rejectionReason ?? "Correct — this request is not suitable.",
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
            Radiographic laboratory
          </p>
          <h1 className="text-3xl font-medium tracking-tight text-fg sm:text-4xl">Bucky Lab</h1>
          <p className="text-sm leading-relaxed text-muted">
            Review imaging requests, decide whether they are appropriate, then position the patient,
            collimate and expose. Some requests contain deliberate errors that must be rejected.
            Approximately 40% of valid cases include pathology visible on the radiograph.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={mode === "practice" ? "default" : "outline"} onClick={() => setMode("practice")}>
            Practice
          </Button>
          <Button
            variant={mode === "assessment" ? "default" : "outline"}
            onClick={() => setMode("assessment")}
          >
            Assessment
          </Button>
        </div>
      </header>

      {feedback && (
        <div
          className={cn(
            "rounded-lg border p-4 text-sm",
            feedback.type === "rejected-correct" && "border-ok/40 bg-ok/10 text-ok",
            feedback.type === "accepted-invalid" && "border-danger/40 bg-danger/10 text-danger",
            feedback.type === "rejected-wrong" && "border-warn/40 bg-warn/10 text-warn",
          )}
        >
          <p className="font-medium">
            {feedback.type === "rejected-correct" && "Correct rejection"}
            {feedback.type === "accepted-invalid" && "Incorrect acceptance"}
            {feedback.type === "rejected-wrong" && "Incorrect rejection"}
          </p>
          <p className="mt-1 leading-relaxed">{feedback.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setFeedback(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Request list */}
        <section className="space-y-3">
          <h2 className="text-sm font-medium text-fg">Imaging requests</h2>
          <div className="space-y-2">
            {IMAGING_REQUESTS.map((req) => {
              const active = req.id === selectedId;
              const patient = patientById(req.patientId);
              return (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(req.id);
                    setFeedback(null);
                  }}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left transition-colors",
                    active ? "border-accent bg-elevated" : "border-border bg-surface hover:border-muted",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{req.title}</p>
                      <p className="mt-1 text-xs text-muted">
                        {patient.name} · {patient.age} y · {req.region}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {req.urgency && (
                        <Badge tone={URGENCY_TONE[req.urgency] ?? "ok"}>{req.urgency}</Badge>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                    {req.clinicalHistory}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Detail panel */}
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

                {mode === "practice" && selected.pathologyId !== "none" && (
                  <div className="rounded-md border border-border bg-elevated p-3 text-xs text-muted">
                    <span className="font-medium text-fg">Practice hint: </span>
                    This case may contain pathology ({PATHOLOGIES[selected.pathologyId].name}).
                  </div>
                )}
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
