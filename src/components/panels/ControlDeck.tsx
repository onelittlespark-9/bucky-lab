import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { LANDMARKS, projectionById, scaleLandmarkY } from "@/lib/sim/projections";
import { suggestedTechnique, classifyEI } from "@/lib/sim/exposure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReactNode } from "react";

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="font-mono text-xs tabular-nums text-fg">{value}</span>
      </div>
      {children}
    </div>
  );
}

export function ControlDeck() {
  const pose = useSim((s) => s.pose);
  const tube = useSim((s) => s.tube);
  const exposure = useSim((s) => s.exposure);
  const patchPose = useSim((s) => s.patchPose);
  const patchTube = useSim((s) => s.patchTube);
  const patchExposure = useSim((s) => s.patchExposure);
  const applyHandbook = useSim((s) => s.applyHandbook);
  const applySuggestedFactors = useSim((s) => s.applySuggestedFactors);
  const showLandmarks = useSim((s) => s.showLandmarks);
  const showLightField = useSim((s) => s.showLightField);
  const setShowLightField = useSim((s) => s.setShowLightField);
  const setShowLandmarks = useSim((s) => s.setShowLandmarks);
  const mode = useSim((s) => s.mode);
  const patientId = useSim((s) => s.patientId);
  const projectionId = useSim((s) => s.projectionId);
  const predictedEI = useSim((s) => s.predictedEI);
  const preparing = useSim((s) => s.preparing);
  const exposing = useSim((s) => s.exposing);
  const prepare = useSim((s) => s.prepare);
  const expose = useSim((s) => s.expose);
  const setLandmarkCR = useSim((s) => s.setLandmarkCR);

  const patient = patientById(patientId);
  const projection = projectionById(projectionId);
  const sug = suggestedTechnique(patient, projection);
  const ei = predictedEI();
  const eiStatus = classifyEI(ei);

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted">{projection.region}</p>
          <h2 className="text-base font-medium leading-snug">{projection.name}</h2>
        </div>
        <Badge tone={mode === "practice" ? "accent" : "warn"}>{mode}</Badge>
      </div>

      <Tabs defaultValue="position" className="flex min-h-0 flex-1 flex-col">
        <TabsList>
          <TabsTrigger value="position">Position</TabsTrigger>
          <TabsTrigger value="beam">Beam</TabsTrigger>
          <TabsTrigger value="expose">Expose</TabsTrigger>
        </TabsList>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <TabsContent value="position" className="space-y-4">
            {mode === "practice" ? (
              <p className="text-xs leading-relaxed text-muted">{projection.position}</p>
            ) : (
              <p className="text-xs text-muted">Assessment — handbook prompts hidden.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => patchPose({ recumbency: "erect" })}>
                Erect
              </Button>
              <Button size="sm" variant="outline" onClick={() => patchPose({ recumbency: "supine" })}>
                Supine
              </Button>
              <Button size="sm" variant="outline" onClick={() => patchPose({ rotationY: 0 })}>
                AP/PA
              </Button>
              <Button size="sm" variant="outline" onClick={() => patchPose({ rotationY: 90 })}>
                Lateral
              </Button>
              <Button size="sm" variant="outline" onClick={() => patchPose({ rotationY: 45 })}>
                45° oblique
              </Button>
            </div>
            <Row label="Rotation" value={`${pose.rotationY.toFixed(0)}°`}>
              <Slider min={-90} max={90} step={1} value={[pose.rotationY]} onValueChange={([v]) => patchPose({ rotationY: v ?? 0 })} />
            </Row>
            <Row label="Oblique" value={`${pose.oblique.toFixed(0)}°`}>
              <Slider min={-45} max={45} step={1} value={[pose.oblique]} onValueChange={([v]) => patchPose({ oblique: v ?? 0 })} />
            </Row>
            <Row label="Chin raise" value={`${(pose.chinUp * 100).toFixed(0)}%`}>
              <Slider min={0} max={1} step={0.05} value={[pose.chinUp]} onValueChange={([v]) => patchPose({ chinUp: v ?? 0 })} />
            </Row>
            <Row label="Shoulder roll" value={`${(pose.shoulderRoll * 100).toFixed(0)}%`}>
              <Slider min={0} max={1} step={0.05} value={[pose.shoulderRoll]} onValueChange={([v]) => patchPose({ shoulderRoll: v ?? 0 })} />
            </Row>
            <Row label="Arm raise" value={`${(pose.armRaise * 100).toFixed(0)}%`}>
              <Slider min={0} max={1} step={0.05} value={[pose.armRaise]} onValueChange={([v]) => patchPose({ armRaise: v ?? 0 })} />
            </Row>
            <Row label="Elbow flex" value={`${pose.elbowFlex.toFixed(0)}°`}>
              <Slider min={0} max={140} step={1} value={[pose.elbowFlex]} onValueChange={([v]) => patchPose({ elbowFlex: v ?? 0 })} />
            </Row>
            <Row label="Knee flex" value={`${pose.kneeFlex.toFixed(0)}°`}>
              <Slider min={0} max={120} step={1} value={[pose.kneeFlex]} onValueChange={([v]) => patchPose({ kneeFlex: v ?? 0 })} />
            </Row>
            <Row label="Hip internal rot." value={`${pose.hipInternal.toFixed(0)}°`}>
              <Slider min={0} max={30} step={1} value={[pose.hipInternal]} onValueChange={([v]) => patchPose({ hipInternal: v ?? 0 })} />
            </Row>
            <div className="flex gap-2">
              <Button size="sm" variant={pose.breath === "inspiration" ? "default" : "outline"} onClick={() => patchPose({ breath: "inspiration" })}>
                Inspiration
              </Button>
              <Button size="sm" variant={pose.breath === "expiration" ? "default" : "outline"} onClick={() => patchPose({ breath: "expiration" })}>
                Expiration
              </Button>
            </div>
            {mode === "practice" ? (
              <Button size="sm" variant="outline" className="w-full" onClick={applyHandbook}>
                Apply handbook pose &amp; centring
              </Button>
            ) : null}
          </TabsContent>

          <TabsContent value="beam" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={showLightField ? "default" : "outline"} onClick={() => setShowLightField(!showLightField)}>
                Primary beam / collimation light: {showLightField ? "ON" : "OFF"}
              </Button>
              {mode === "practice" ? (
                <Button size="sm" variant={showLandmarks ? "default" : "outline"} onClick={() => setShowLandmarks(!showLandmarks)}>
                  Landmarks: {showLandmarks ? "ON" : "OFF"}
                </Button>
              ) : null}
            </div>
            {mode === "practice" ? (
              <p className="text-xs leading-relaxed text-muted">{projection.centring}</p>
            ) : null}
            <Row label="CR height (cm from vertex)" value={tube.crY.toFixed(1)}>
              <Slider min={0} max={patient.heightCm} step={0.5} value={[tube.crY]} onValueChange={([v]) => patchTube({ crY: v ?? 40 })} />
            </Row>
            <Row label="CR lateral (cm)" value={tube.crX.toFixed(1)}>
              <Slider min={-20} max={20} step={0.5} value={[tube.crX]} onValueChange={([v]) => patchTube({ crX: v ?? 0 })} />
            </Row>
            <Row label="SID (cm)" value={`${tube.sid.toFixed(0)}`}>
              <Slider min={80} max={200} step={1} value={[tube.sid]} onValueChange={([v]) => patchTube({ sid: v ?? 100 })} />
            </Row>
            <Row label="Tube angle" value={`${tube.angle.toFixed(0)}°`}>
              <Slider min={-30} max={30} step={1} value={[tube.angle]} onValueChange={([v]) => patchTube({ angle: v ?? 0 })} />
            </Row>
            <Row label="Collimation W (cm)" value={tube.collimationW.toFixed(1)}>
              <Slider min={5} max={45} step={0.5} value={[tube.collimationW]} onValueChange={([v]) => patchTube({ collimationW: v ?? 20 })} />
            </Row>
            <Row label="Collimation H (cm)" value={tube.collimationH.toFixed(1)}>
              <Slider min={5} max={45} step={0.5} value={[tube.collimationH]} onValueChange={([v]) => patchTube({ collimationH: v ?? 20 })} />
            </Row>
            {mode === "practice" ? (
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-wider text-muted">Landmarks</p>
                <div className="flex flex-wrap gap-1.5">
                  {LANDMARKS.filter((l) => l.y > 0).map((lm) => (
                    <Button
                      key={lm.id}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setLandmarkCR(scaleLandmarkY(lm.y, patient.heightCm), lm.x * patient.morph.torsoWidth)
                      }
                    >
                      {lm.label}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="expose" className="space-y-4">
            <div className="rounded-md border border-border bg-elevated p-3 text-xs">
              <p className="text-muted">Predicted EI</p>
              <p className="mt-1 font-mono text-lg tabular-nums text-fg">{ei.toFixed(0)}</p>
              <p className="mt-1 text-muted">
                Status: <span className="text-fg">{eiStatus}</span>
                {mode === "practice" ? (
                  <span className="text-muted"> · chart suggests {sug.kvp} kVp / {sug.mas} mAs</span>
                ) : null}
              </p>
            </div>
            <Row label="kVp" value={`${exposure.kvp}`}>
              <Slider min={40} max={125} step={1} value={[exposure.kvp]} onValueChange={([v]) => patchExposure({ kvp: v ?? 70 })} />
            </Row>
            <Row label="mAs" value={exposure.mas < 10 ? exposure.mas.toFixed(1) : exposure.mas.toFixed(0)}>
              <Slider min={0.5} max={100} step={0.5} value={[exposure.mas]} onValueChange={([v]) => patchExposure({ mas: v ?? 2 })} />
            </Row>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={exposure.grid ? "default" : "outline"} onClick={() => patchExposure({ grid: !exposure.grid })}>
                Grid {exposure.grid ? "in" : "out"}
              </Button>
              <Button
                size="sm"
                variant={exposure.focalSpot === "fine" ? "default" : "outline"}
                onClick={() => patchExposure({ focalSpot: exposure.focalSpot === "fine" ? "broad" : "fine" })}
              >
                {exposure.focalSpot} focus
              </Button>
              <Button size="sm" variant={exposure.marker === "L" ? "default" : "outline"} onClick={() => patchExposure({ marker: exposure.marker === "L" ? null : "L" })}>
                L
              </Button>
              <Button size="sm" variant={exposure.marker === "R" ? "default" : "outline"} onClick={() => patchExposure({ marker: exposure.marker === "R" ? null : "R" })}>
                R
              </Button>
            </div>
            {mode === "practice" ? (
              <Button size="sm" variant="outline" className="w-full" onClick={applySuggestedFactors}>
                Load chart factors for this habitus
              </Button>
            ) : null}
            <Separator />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="lg" onClick={prepare} disabled={preparing || exposing}>
                {preparing ? "Rotor up" : "Prepare"}
              </Button>
              <Button variant="solid" size="lg" onClick={() => void expose()} disabled={exposing}>
                {exposing ? "Exposing" : "Expose"}
              </Button>
            </div>
            <p className="text-[11px] text-muted">
              Two-stage console: prepare spins the anode, then expose. Collimate before you press it.
            </p>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
