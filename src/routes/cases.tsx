import { createFileRoute } from "@tanstack/react-router";
import { Lab } from "@/components/app/Lab";

export const Route = createFileRoute("/cases")({ component: CasesPage });

function CasesPage() { return <Lab />; }
