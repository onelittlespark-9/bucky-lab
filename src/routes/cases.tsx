import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Lab } from "@/components/app/Lab";
import { useSim } from "@/lib/sim/store";

export const Route = createFileRoute("/cases")({ component: CasesPage });

function CasesPage() {
  const setScreen = useSim(s => s.setScreen);
  useEffect(() => { setScreen("library"); }, [setScreen]);
  return <Lab />;
}
