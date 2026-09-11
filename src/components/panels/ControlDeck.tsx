import { useSim } from "@/lib/sim/store";
import { patientById } from "@/lib/sim/patients";
import { LANDMARKS, projectionById, scaleLandmarkY } from "@/lib/sim/projections";
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
              <Slider
                min={-90}
                max={90}
                step={1}
                value={[pose.rotationY]}
                onValueChange={([v]) => patchPose({ rotationY: v ?? 0 })}
              />
            </Row>
            <Row label="Chin raise" value={`${Math.round(pose.chinUp * 100)}%`}>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[pose.chinUp]}
                onValueChange={([v]) => patchPose({ chinUp: v ?? 0 })}
              />
            </Row>
            <Row label="Shoulder roll" value={`${Math.round(pose.shoulderRoll * 100)}%`}>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[pose.shoulderRoll]}
                onValueChange={([v]) => patchPose({ shoulderRoll: v ?? 0 })}
              />
            </Row>
            <Row label="Arm raise" value={`${Math.round(pose.armRaise * 100)}%`}>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[pose.armRaise]}
                onValueChange={([v]) => patchPose({ armRaise: v ?? 0 })}
              />
            </Row>
            <Row label="Knee flexion" value={`${pose.kneeFlex.toFixed(0)}°`}>
              <Slider
                min={0}
                max={90}
                step={1}
                value={[pose.kneeFlex]}
                onValueChange={([v]) => patchPose({ kneeFlex: v ?? 0 })}
              />
            </Row>
            <Row label="Hip internal rotation" value={`${pose.hipInternal.toFixed(0)}°`}>
              <Slider
                min={0}
                max={25}
                step={1}
                value={[pose.hipInternal]}
                onValueChange={([v]) => patchPose({ hipInternal: v ?? 0 })}
              />
            </Row>
            <Row label="Elbow flexion" value={`${pose.elbowFlex.toFixed(0)}°`}>
              <Slider
                min={0}
                max={140}
                step={1}
                value={[pose.elbowFlex]}
                onValueChange={([v]) => patchPose({ elbowFlex: v ?? 0 })}
              />
            </Row>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={pose.breath === "inspiration" ? "default" : "outline"}
                onClick={() => patchPose({ breath: "inspiration" })}
              >
                Inspiration
              </Button>
              <Button
                size="sm"
                variant={pose.breath === "expiration" ? "default" : "outline"}
                onClick={() => patchPose({ breath: "expiration" })}
              >
                Expiration
              </Button>
            </div>
            {mode === "practice" ? (
              <Button size="sm" variant="outline" className="w-full" onClick={applyHandbook}>
                Snap to handbook position
              </Button>
            ) : null}
          </TabsContent>

          <TabsContent value="beam" className="space-y-4">
            {mode === "practice" ? (
              <p className="text-xs leading-relaxed text-muted">{projection.beam} {projection.collimation}</p>
            ) : null}
            <Row label="Longitudinal (vertex → feet)" value={`${tube.crY.toFixed(1)} cm`}>
              <Slider
                min={0}
                max={patient.heightCm}
                step={0.5}
                value={[tube.crY]}
                onValueChange={([v]) => patchTube({ crY: v ?? 0 })}
              />
            </Row>
            <Row label="Transverse (MSP)" value={`${tube.crX.toFixed(1)} cm`}>
              <Slider
                min={-20}
                max={20}
                step={0.5}
                value={[tube.crX]}
                onValueChange={([v]) => patchTube({ crX: v ?? 0 })}
              />
            </Row>
            <Row label="SID / FFD" value={`${tube.sid.toFixed(0)} cm`}>
              <Slider
                min={90}
                max={200}
                step={1}
                value={[tube.sid]}
                onValueChange={([v]) => patchTube({ sid: v ?? 100 })}
              />
            </Row>
            <Row label="Tube angle (cranial +)" value={`${tube.angle.toFixed(0)}°`}>
              <Slider
                min={-30}
                max={40}
                step={1}
                value={[tube.angle]}
                onValueChange={([v]) => patchTube({ angle: v ?? 0 })}
              />
            </Row>
            <Separator />
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Collimation at IR</p>
            <Row label="Width" value={`${tube.collimationW.toFixed(0)} cm`}>
              <Slider
                min={6}
                max={43}
                step={1}
                value={[tube.collimationW]}
                onValueChange={([v]) => patchTube({ collimationW: v ?? 10 })}
              />
            </Row>
            <Row label="Height" value={`${tube.collimationH.toFixed(0)} cm`}>
              <Slider
                min={6}
                max={43}
                step={1}
                value={[tube.collimationH]}
                onValueChange={([v]) => patchTube({ collimationH: v ?? 10 })}
              />
            </Row>
            {mode === "practice" ? (
              <div className="space-y-2">
                <Label>Centre on landmark</Label>
                <div className="flex flex-wrap gap-1.5">
                  {LANDMARKS.filter((l) => l.y > 0).slice(0, 12).map((lm) => (
                    <Button
                      key={lm.id}
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
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
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={showLandmarks ? "default" : "outline"}
                onClick={() => useSim.setState({ showLandmarks: !showLandmarks })}
              >
                Landmarks
              </Button>
              <Button
                size="sm"
                variant={showLightField ? "default" : "outline"}
                onClick={() => useSim.setState({ showLightField: !showLightField })}
              >
                Light field
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="expose" className="space-y-4">
            <div className="rounded-md border border-border bg-elevated p-3">
              <div className="flex items-baseline justify-between">
                <Label>Predicted EI</Label>
                <span className="font-mono text-lg tabular-nums text-fg">{ei.toFixed(0)}</span>
              </div>
              <Badge
                tone={eiStatus === "optimal" ? "ok" : eiStatus === "under" ? "warn" : "danger"}
                className="mt-2"
              >
                {eiStatus === "optimal"
                  ? "Target window"
                  : eiStatus === "under"
                    ? "Likely underexposed"
                    : "Likely overexposed"}
              </Badge>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                {patient.name} · {patient.habitus} · part ~{projection.region === "Thorax" ? patient.thickness.chest : projection.region === "Abdomen" ? patient.thickness.abdomen : projection.setup === "tabletop" ? patient.thickness.extremity : patient.thickness.pelvis} cm. Chart for this model: {sug.kvp} kVp / {sug.mas} mAs.
              </p>
            </div>
            <Row label="kVp" value={`${exposure.kvp}`}>
              <Slider
                min={40}
                max={125}
                step={1}
                value={[exposure.kvp]}
                onValueChange={([v]) => patchExposure({ kvp: v ?? 70 })}
              />
            </Row>
            <Row label="mAs" value={exposure.mas < 10 ? exposure.mas.toFixed(1) : exposure.mas.toFixed(0)}>
              <Slider
                min={0.5}
                max={80}
                step={0.5}
                value={[exposure.mas]}
                onValueChange={([v]) => patchExposure({ mas: v ?? 2 })}
              />
            </Row>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={exposure.grid ? "default" : "outline"}
                onClick={() => patchExposure({ grid: !exposure.grid })}
              >
                Grid {exposure.grid ? "in" : "out"}
              </Button>
              <Button
                size="sm"
                variant={exposure.focalSpot === "fine" ? "default" : "outline"}
                onClick={() =>
                  patchExposure({ focalSpot: exposure.focalSpot === "fine" ? "broad" : "fine" })
                }
              >
                {exposure.focalSpot} focus
              </Button>
              <Button
                size="sm"
                variant={exposure.marker === "L" ? "default" : "outline"}
                onClick={() => patchExposure({ marker: exposure.marker === "L" ? null : "L" })}
              >
                L
              </Button>
              <Button
                size="sm"
                variant={exposure.marker === "R" ? "default" : "outline"}
                onClick={() => patchExposure({ marker: exposure.marker === "R" ? null : "R" })}
              >
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
