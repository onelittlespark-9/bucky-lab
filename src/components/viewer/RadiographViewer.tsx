import { useEffect, useMemo, useState } from "react";
import { useSim } from "@/lib/sim/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { projectionById } from "@/lib/sim/projections";
import { patientById } from "@/lib/sim/patients";
import { requestFromBank } from "@/lib/sim/request-bank";
import { pacsReportForCase } from "@/lib/sim/pacs-reports";
import { evaluatePLATECAANN } from "@/lib/sim/platecaann";
import type { Grade, PlatecaannDecision, PlatecaannItem } from "@/lib/sim/types";

function toneFor(g: Grade): "ok" | "warn" | "danger" {
  return g === "excellent" ? "ok" : g === "acceptable" ? "warn" : "danger";
}

const INITIAL_PLATECAANN: PlatecaannItem[] = [
  { key: "P", label: "Patient identification", decision: "concern", note: "Confirm full name, DOB and hospital/ID number against the request." },
  { key: "L", label: "Label / marker", decision: "concern", note: "Check correct anatomical side marker and any relevant portable/postural annotation." },
  { key: "A-area", label: "Area of interest", decision: "concern", note: "Confirm all required anatomy and relevant surrounding structures are included." },
  { key: "T", label: "Technique / positioning", decision: "concern", note: "Assess projection, positioning, rotation, angulation and superimposition." },
  { key: "E-contrast", label: "Exposure — contrast", decision: "concern", note: "Is tissue differentiation and anatomical contrast appropriate for this examination?" },
  { key: "E-density", label: "Exposure — density", decision: "concern", note: "Is the overall density appropriate, with required anatomy adequately visualised?" },
  { key: "E-sharpness", label: "Exposure — sharpness", decision: "concern", note: "Assess motion and geometric sharpness; fine anatomical detail should be visible." },
  { key: "C", label: "Collimation", decision: "concern", note: "Assess four-sided collimation, field size, scatter and unnecessary exposure." },
  { key: "A-artifact", label: "Artefacts", decision: "concern", note: "Look for clothing, jewellery, external objects, lines or devices that obscure anatomy or mimic pathology." },
  { key: "A-abnormality", label: "Abnormality", decision: "concern", note: "Search systematically for trauma, pathology, devices, post-operative appearances and unexpected findings." },
  { key: "N-repeat", label: "Need for repeat", decision: "concern", note: "Would another exposure materially improve the diagnostic information enough to justify the dose?" },
  { key: "N-further", label: "Need for further views", decision: "concern", note: "Is the current image acceptable but another projection clinically required?" },
];

function improvementSuggestions(objective: ReturnType<typeof evaluatePLATECAANN>) {
  const suggestions: string[] = [];
  for (const item of objective.items) {
    if (item.decision !== "fail") continue;
    if (item.key === "T") suggestions.push("Correct the patient positioning/centring and tube angulation before exposing again.");
    else if (item.key === "E-contrast") suggestions.push("Adjust the exposure technique to improve tissue differentiation for this projection.");
    else if (item.key === "E-density") suggestions.push("Review exposure factors and patient thickness; aim for appropriate receptor exposure rather than simply making the displayed image brighter.");
    else if (item.key === "E-sharpness") suggestions.push("Reduce motion and consider the geometric factors affecting sharpness before repeating the exposure.");
    else if (item.key === "C") suggestions.push("Tighten the collimation to the required anatomy while keeping all clinically necessary structures included.");
    else if (item.key === "A-artifact") suggestions.push("Remove or reposition the obscuring artefact before the next exposure where possible.");
    else if (item.key === "N-repeat") suggestions.push("The technical defect may compromise the clinical question; correct the underlying problem before repeating.");
    else suggestions.push(`${item.label}: ${item.note}`);
  }
  if (!suggestions.length) suggestions.push("No major technical correction is currently required. Proceed to your final-image critique and judge the image clinically.");
  return [...new Set(suggestions)];
}

export function RadiographViewer() {
  const result = useSim(s => s.result);
  const error = useSim(s => s.error);
  const retake = useSim(s => s.retake);
  const setScreen = useSim(s => s.setScreen);
  const nextRequestedView = useSim(s => s.nextRequestedView);
  const completeCurrentRequest = useSim(s => s.completeCurrentRequest);
  const requestId = useSim(s => s.requestId);
  const viewIndex = useSim(s => s.viewIndex);
  const projectionId = useSim(s => s.projectionId);
  const patientId = useSim(s => s.patientId);
  const exposure = useSim(s => s.exposure);
  const pose = useSim(s => s.pose);
  const tube = useSim(s => s.tube);

  const projection = projectionById(projectionId);
  const patient = patientById(patientId);
  const request = requestId ? requestFromBank(requestId) : undefined;
  const hasAnother = Boolean(request && viewIndex < request.requestedProjections.length - 1);
  const lastView = !hasAnother;

  const [plate, setPlate] = useState<PlatecaannItem[]>(INITIAL_PLATECAANN);
  const [findings, setFindings] = useState("");
  const [impression, setImpression] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [critiqueUnlocked, setCritiqueUnlocked] = useState(false);

  const report = useMemo(() => pacsReportForCase(requestId), [requestId]);
  const objective = useMemo(
    () => (result ? evaluatePLATECAANN({ patient, projection, pose, tube, exposure, result, marker: exposure.marker }) : null),
    [result, patient, projection, pose, tube, exposure],
  );

  useEffect(() => {
    setCritiqueUnlocked(false);
    setSubmitted(false);
    setPlate(INITIAL_PLATECAANN);
    setFindings("");
    setImpression("");
    setBrightness(1);
    setContrast(1);
    setZoom(1);
  }, [result]);

  // ─── Render-failure diagnostic overlay ───────────────────────────────────
  if (error) {
    const isRenderFailure = error.startsWith("Render failed");
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-6 bg-well p-6">
        <div className="w-full max-w-xl rounded-xl border border-danger/40 bg-surface p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <Badge tone="danger">Render failed</Badge>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-fg">
                {isRenderFailure ? "The radiograph could not be generated" : "Exposure error"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{error}</p>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-border bg-elevated p-4 text-xs leading-relaxed text-muted">
            <p className="font-medium text-fg">What to try</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>Return to the room and click <strong>Load standard technique</strong>.</li>
              <li>Click <strong>Set standard position</strong> then re-expose.</li>
              <li>If every projection fails, reload the page to reset the WebGL / atlas context.</li>
              <li>Check the browser console for the full stack trace (look for “[Bucky Lab]”).</li>
            </ul>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="solid" onClick={retake}>Return to room and retry</Button>
            <Button variant="outline" onClick={() => setScreen("library")}>Back to worklist</Button>
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        No image. Return to the room and expose.
      </div>
    );
  }

  const { metrics, overallGrade } = result;
  const repeatChoice = plate.find(x => x.key === "N-repeat")?.decision;
  const furtherChoice = plate.find(x => x.key === "N-further")?.decision;
  const canSubmit =
    critiqueUnlocked &&
    plate.every(x => x.decision !== "concern") &&
    Boolean(findings.trim() && impression.trim());
  const setDecision = (key: PlatecaannItem["key"], decision: PlatecaannDecision) =>
    setPlate(items => items.map(item => (item.key === key ? { ...item, decision } : item)));
  const postProcessStyle = {
    filter: `brightness(${brightness}) contrast(${contrast})`,
    transform: `scale(${zoom})`,
  };
  const repeatCorrect = objective ? (repeatChoice === "fail") === objective.repeatRequired : false;
  const furtherRequiredByRequest = hasAnother;
  const furtherCorrect = objective ? (furtherChoice === "fail") === furtherRequiredByRequest : false;
  const suggestions = objective ? improvementSuggestions(objective) : [];
  const scoreTone = (objective?.score ?? 0) >= 85 ? "ok" : (objective?.score ?? 0) >= 70 ? "warn" : "danger";

  return (
    <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
      <div className="flex min-h-64 flex-col bg-well p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface p-2">
          <div className="flex items-center gap-2">
            <Badge>PACS workstation</Badge>
            <span className="text-xs text-muted">Post-processing</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setBrightness(v => Math.max(0.7, v - 0.1))}>Density −</Button>
            <Button size="sm" variant="outline" onClick={() => setBrightness(v => Math.min(1.4, v + 0.1))}>Density +</Button>
            <Button size="sm" variant="outline" onClick={() => setContrast(v => Math.max(0.7, v - 0.1))}>Contrast −</Button>
            <Button size="sm" variant="outline" onClick={() => setContrast(v => Math.min(1.4, v + 0.1))}>Contrast +</Button>
            <Button size="sm" variant="outline" onClick={() => setZoom(v => Math.min(1.8, v + 0.1))}>Zoom +</Button>
            <Button size="sm" variant="outline" onClick={() => { setBrightness(1); setContrast(1); setZoom(1); }}>Reset</Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="flex min-h-full min-w-full items-center justify-center p-4">
            <img
              src={result.dataUrl}
              alt={`${projection.shortName} radiograph of ${patient.name}`}
              className="max-h-full max-w-full object-contain shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-transform"
              style={postProcessStyle}
            />
          </div>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border bg-surface p-4 lg:border-l lg:border-t-0">
        <div>
          <p className="text-xs text-muted">
            {patient.name} · {projection.shortName}
            {request ? ` · view ${viewIndex + 1}/${request.requestedProjections.length}` : ""}
          </p>
          <h2 className="text-base font-medium">
            {critiqueUnlocked ? "Final-image PLATECAANN critique" : "Automatic image assessment"}
          </h2>
          <p className="mt-1 text-xs text-muted">
            {critiqueUnlocked
              ? "Critique the final image yourself. Do not equate every imperfection with a repeat; decide whether the defect compromises the clinical question."
              : "The simulator has assessed the exposed image first. Use the feedback to decide whether the image should be improved before you perform your own critique."}
          </p>
        </div>

        <div className="rounded-md border border-border bg-elevated p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted">Automatic image decision score</p>
              <p className={`mt-1 font-mono text-3xl font-semibold ${scoreTone === "danger" ? "text-danger" : scoreTone === "warn" ? "text-warn" : "text-ok"}`}>
                {objective?.score ?? 0}/100
              </p>
            </div>
            <Badge tone={scoreTone}>{objective?.diagnostic ? "Diagnostic quality" : "Needs improvement"}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted">{objective?.summary}</p>
        </div>

        {!critiqueUnlocked ? (
          <div className="rounded-md border border-border bg-elevated p-4">
            <h3 className="text-sm font-semibold">How to improve this image</h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
              {suggestions.map((s, i) => (
                <li key={i}>• {s}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              If a repeat is needed, return to the room and correct the acquisition. If the image is acceptable, continue without repeating.
            </p>
            <div className="mt-3 grid gap-2">
              <Button variant="solid" onClick={() => setCritiqueUnlocked(true)}>Begin final-image critique</Button>
              {objective?.repeatRequired && (
                <Button variant="outline" onClick={retake}>Return to room and improve image</Button>
              )}
            </div>
          </div>
        ) : null}

        {critiqueUnlocked && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-md border border-border bg-elevated p-3">
              <Stat k="EI" v={metrics.ei.toFixed(0)} tone={metrics.eiStatus === "optimal" ? "ok" : metrics.eiStatus === "under" ? "warn" : "danger"} />
              <Stat k="Contrast" v={metrics.contrast.toFixed(2)} />
              <Stat k="Sharpness" v={metrics.noise < 0.18 ? "Good" : metrics.noise < 0.3 ? "Review" : "Poor"} />
            </div>
            <Separator />
            <div className="space-y-2">
              {plate.map(item => (
                <div key={item.key} className="rounded-md border border-border bg-elevated p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge>
                        {item.key
                          .replace("E-", "E — ")
                          .replace("A-area", "A")
                          .replace("A-artifact", "A")
                          .replace("A-abnormality", "A")
                          .replace("N-repeat", "N")
                          .replace("N-further", "N")}
                      </Badge>
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    <select
                      value={item.decision}
                      onChange={e => setDecision(item.key, e.target.value as PlatecaannDecision)}
                      className="rounded border border-border bg-surface px-2 py-1 text-xs text-fg"
                    >
                      <option value="concern">Review</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.note}</p>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-border bg-elevated p-3 text-xs">
              <strong className="text-fg">Your technical decision</strong>
              <p className="mt-1 text-muted">
                Automatic score above is based on the simulated acquisition. Your task now is to independently judge the final image.
              </p>
              {repeatChoice !== "concern" && (
                <p className="mt-1">
                  Repeat decision: <strong>{repeatChoice === "fail" ? "REPEAT" : "ACCEPT"}</strong>{" "}
                  {repeatCorrect ? "— correct" : "— review"}
                </p>
              )}
              {furtherChoice !== "concern" && (
                <p>
                  Further views: <strong>{furtherChoice === "fail" ? "REQUIRED" : "NOT REQUIRED"}</strong>{" "}
                  {furtherCorrect ? "— correct" : "— review"}
                </p>
              )}
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Your radiographic findings</h3>
              <textarea
                value={findings}
                onChange={e => setFindings(e.target.value)}
                placeholder="Describe the abnormality, location and relevant radiographic signs…"
                className="min-h-24 w-full rounded-md border border-border bg-elevated p-2 text-sm text-fg outline-none"
              />
              <textarea
                value={impression}
                onChange={e => setImpression(e.target.value)}
                placeholder="Your impression…"
                className="min-h-16 w-full rounded-md border border-border bg-elevated p-2 text-sm text-fg outline-none"
              />
            </div>
            {submitted && report ? (
              <>
                <div className="rounded-md border border-border bg-elevated p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">PACS — Radiologist-style reference report</h3>
                    <Badge tone="ok">Submitted</Badge>
                  </div>
                  <div className="space-y-2 text-xs leading-relaxed">
                    <p><strong>Clinical details:</strong> {report.clinicalHistory}</p>
                    <p><strong>Technique:</strong> {report.technique}</p>
                    <p><strong>Findings:</strong> {report.findings}</p>
                    <p><strong>Impression:</strong> {report.impression}</p>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-elevated p-4">
                  <h3 className="text-sm font-semibold">Clinical decision feedback</h3>
                  <p className="mt-1 text-xs text-muted">
                    Repeat decision: {repeatCorrect ? "Correct" : "Review your decision"}. Further-view decision:{" "}
                    {furtherCorrect ? "Correct" : "Review the clinical indication and requested views"}.
                  </p>
                  <p className="mt-2 text-xs text-muted">{objective?.summary}</p>
                </div>
                <div className="border-t border-border pt-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted">Learning comparison</p>
                  <p className="mt-1 text-xs text-muted">
                    Compare your findings and impression with the reference report. The aim is to recognise the same clinically important abnormality, not reproduce exact wording.
                  </p>
                </div>
              </>
            ) : null}
          </>
        )}

        <div className="mt-auto grid gap-2 pt-2">
          {critiqueUnlocked && !submitted ? (
            <Button variant="solid" disabled={!canSubmit} onClick={() => setSubmitted(true)}>Submit image to PACS</Button>
          ) : null}
          {hasAnother ? <Button variant="solid" onClick={nextRequestedView}>Take next requested view</Button> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={retake}>Repeat this view</Button>
            <Button variant="outline" onClick={() => setScreen("room")}>Return to room</Button>
          </div>
          {submitted && (
            <Button variant={lastView ? "solid" : "outline"} disabled={!lastView} onClick={completeCurrentRequest}>
              {lastView ? "Complete request" : "Complete after all views"}
            </Button>
          )}
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
