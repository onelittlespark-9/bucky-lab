import { createFileRoute, Navigate } from "@tanstack/react-router";
import { TestExposure } from "../components/app/TestExposure";

const TEST_ACCESS_KEY = "bucky-lab:test-mode-access";

export const Route = createFileRoute("/test-exposure")({ component: ProtectedTestExposure });

function ProtectedTestExposure() {
  const unlocked = typeof window !== "undefined" && sessionStorage.getItem(TEST_ACCESS_KEY) === "granted";
  if (!unlocked) return <Navigate to="/" />;
  return <TestExposure />;
}
