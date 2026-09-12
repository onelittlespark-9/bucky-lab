import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FlaskConical } from "lucide-react";
import { useSim } from "@/lib/sim/store";
import { ControlDeck } from "@/components/panels/ControlDeck";
import { RadiographViewer } from "@/components/viewer/RadiographViewer";
import { Library } from "./Library";
import { SetupScreen } from "./SetupScreen";
import { Button } from "@/components/ui/button";
import { patientById } from "@/lib/sim/patients";
import { projectionById } from "@/lib/sim/projections";
import { Badge } from "@/components/ui/badge";

const RoomViewport = lazy(() => import("@/components/room/RoomViewport").then(m => ({ default: m.RoomViewport })));
function RoomFallback() { return <div className="flex h-full min-h-64 items-center justify-center bg-bg text-sm text-muted">Loading the room…</div>; }

export function Lab() {
  const screen = useSim(s => s.screen); const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);
  if (screen === "library") return <Library />;
  if (screen === "setup") return <SetupScreen />;
  if (screen === "viewer") return <div className="flex h-dvh min-h-0 flex-col"><TopBar /><div className="min-h-0 flex-1"><RadiographViewer /></div></div>;
  return <div className="flex h-dvh min-h-0 flex-col"><TopBar /><div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]"><div className="min-h-72 border-b border-border lg:border-b-0 lg:border-r">{mounted ? <Suspense fallback={<RoomFallback />}><RoomViewport /></Suspense> : <RoomFallback />}</div><div className="min-h-0 overflow-hidden bg-panel p-4"><ControlDeck /></div></div></div>;
}

function TopBar() {
  const patientId = useSim(s => s.patientId); const projectionId = useSim(s => s.projectionId); const patient = patientById(patientId); const projection = projectionById(projectionId);
  return <header className="flex items-center gap-3 border-b border-border bg-surface px-3 py-2"><Link to="/cases"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="size-4" />Library</Button></Link><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{projection.shortName}</p><p className="truncate text-[11px] text-muted">{patient.name} · {patient.habitus} · {patient.heightCm} cm</p></div><Link to="/test-exposure"><Button variant="outline" size="sm" className="gap-1.5"><FlaskConical className="size-4" />Test bench</Button></Link><Badge>{projection.setup}</Badge></header>;
}
