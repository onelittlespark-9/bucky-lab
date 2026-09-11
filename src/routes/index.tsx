import { createFileRoute } from "@tanstack/react-router";
import { Lab } from "@/components/app/Lab";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <Lab />;
}
