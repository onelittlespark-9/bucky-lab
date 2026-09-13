import { Canvas } from "@react-three/fiber";
import { XrayRoom } from "./XrayRoom";

export function RoomViewport() {
  return (
    <div className="relative h-full min-h-64 w-full bg-bg">
      <Canvas
        camera={{ position: [2.4, 1.6, 2.2], fov: 42 }}
        dpr={[1, 1.25]}
        shadows="basic"
        performance={{ min: 0.5, max: 1, debounce: 180 }}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        style={{ touchAction: "none" }}
      >
        <XrayRoom />
      </Canvas>
      <p className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-muted">
        Drag to orbit · scroll to zoom · tap gold landmarks to centre
      </p>
    </div>
  );
}
