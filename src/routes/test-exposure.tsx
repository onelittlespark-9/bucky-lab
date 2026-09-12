import { createFileRoute } from "@tanstack/react-router";
import { TestExposure } from "@/components/app/TestExposure";

export const Route = createFileRoute("/test-exposure")({ component: TestExposure });
