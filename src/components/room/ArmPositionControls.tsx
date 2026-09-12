import type { CSSProperties } from "react";
import { useSim } from "@/lib/sim/store";
import { projectionById } from "@/lib/sim/projections";

const button: CSSProperties = { background: "rgba(255,255,255,.07)", color: "white", border: "1px solid rgba(255,255,255,.12)", borderRadius: 7, padding: "6px 5px", fontSize: 10, cursor: "pointer" };
const section: CSSProperties = { fontSize: 9, letterSpacing: ".12em", opacity: .55, margin: "10px 0 5px" };

export function ArmPositionControls() {
  const projectionId = useSim(s => s.projectionId);
  const pose = useSim(s => s.pose);
  const patchPose = useSim(s => s.patchPose);
  const upperLimb = /hand|wrist|elbow|shoulder/i.test(`${projectionId} ${projectionById(projectionId).name}`);
  if (!upperLimb) return null;
  const slider = (label: string, value: number, min: number, max: number, onChange: (v: number) => void, display: string) => (
    <label style={{ display: "block", marginTop: 8 }}>
      <span style={{ display: "flex", justifyContent: "space-between", fontSize: 9, opacity: .8 }}><span>{label}</span><span>{display}</span></span>
      <input aria-label={label} type="range" min={min} max={max} step={1} value={value} onChange={e => onChange(Number(e.target.value))} style={{ width: "100%", accentColor: "#9bcbb5" }} />
    </label>
  );
  return <div>
    <div style={section}>PATIENT ARM</div>
    {slider("Arm elevation", pose.armRaise * 100, 0, 100, v => patchPose({ armRaise: v / 100 }), `${Math.round(pose.armRaise * 100)}%`)}
    {slider("Elbow flexion", pose.elbowFlex, 0, 140, v => patchPose({ elbowFlex: v }), `${Math.round(pose.elbowFlex)}°`)}
    {slider("Turn arm medial ↔ lateral", pose.armRotation, -90, 90, v => patchPose({ armRotation: v }), pose.armRotation < 0 ? `${Math.abs(Math.round(pose.armRotation))}° medial` : pose.armRotation > 0 ? `${Math.round(pose.armRotation)}° lateral` : "neutral")}
    {slider("Forearm pronation ↔ supination", pose.forearmRotation, -90, 90, v => patchPose({ forearmRotation: v }), pose.forearmRotation < 0 ? `${Math.abs(Math.round(pose.forearmRotation))}° pronation` : pose.forearmRotation > 0 ? `${Math.round(pose.forearmRotation)}° supination` : "neutral")}
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginTop: 6 }}>
      <button onClick={() => patchPose({ armRotation: -90 })} style={button}>Medial</button>
      <button onClick={() => patchPose({ armRotation: 90 })} style={button}>Lateral</button>
      <button onClick={() => patchPose({ forearmRotation: -90 })} style={button}>Pronate</button>
      <button onClick={() => patchPose({ forearmRotation: 90 })} style={button}>Supinate</button>
    </div>
  </div>;
}
