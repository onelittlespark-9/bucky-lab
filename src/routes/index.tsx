import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpenCheck, FlaskConical, Stethoscope } from "lucide-react";
import { FormEvent, useState } from "react";

export const Route = createFileRoute("/")({ component: Home });

const TEST_ACCESS_KEY = "bucky-lab:test-mode-access";

function Home() {
  const navigate = useNavigate();
  const [showTestGate, setShowTestGate] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");

  function submitTestAccess(event: FormEvent) {
    event.preventDefault();
    if (username.trim().toLowerCase() !== "onelittlespark") {
      setError("Username not recognised.");
      return;
    }
    sessionStorage.setItem(TEST_ACCESS_KEY, "granted");
    navigate({ to: "/test-exposure" });
  }

  return (
    <main className="min-h-dvh bg-bg px-5 py-8 text-fg sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-5xl flex-col justify-center">
        <header className="mx-auto mb-9 max-w-2xl text-center">
          <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-accent text-lg font-bold text-white shadow-lg">BL</div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Diagnostic radiography simulation</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Bucky Lab</h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted">
            Choose how you want to use the laboratory.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <button
            type="button"
            onClick={() => { setUsername(""); setError(""); setShowTestGate(true); }}
            className="group rounded-2xl border border-border bg-surface p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent"><FlaskConical className="size-5" /></div>
            <h2 className="mt-5 text-lg font-semibold">Test mode</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Developer test bench for exposure, renderer and positioning checks.</p>
            <p className="mt-5 text-xs font-medium text-accent">Restricted access</p>
          </button>

          <Link
            to="/cases"
            className="group rounded-2xl border border-border bg-surface p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent"><Stethoscope className="size-5" /></div>
            <h2 className="mt-5 text-lg font-semibold">Examination</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Work through imaging requests, patient positioning, exposure and image assessment.</p>
            <p className="mt-5 text-xs font-medium text-accent">Open examination worklist</p>
          </Link>

          <Link
            to="/critique-library"
            className="group rounded-2xl border border-border bg-surface p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent"><BookOpenCheck className="size-5" /></div>
            <h2 className="mt-5 text-lg font-semibold">Critique library</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Review projection standards, inclusion criteria and image-quality checkpoints.</p>
            <p className="mt-5 text-xs font-medium text-accent">Browse critique standards</p>
          </Link>
        </section>
      </div>

      {showTestGate ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="test-access-title">
          <form onSubmit={submitTestAccess} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Restricted mode</p>
            <h2 id="test-access-title" className="mt-2 text-xl font-semibold">Test mode access</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Enter the authorised username to open the developer test bench.</p>
            <label className="mt-5 block text-xs font-medium text-muted" htmlFor="test-username">Username</label>
            <input
              id="test-username"
              autoFocus
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              className="mt-2 h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg outline-none focus:border-accent"
              autoComplete="off"
            />
            {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}
            <div className="mt-6 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setShowTestGate(false)} className="h-11 rounded-lg border border-border bg-bg text-sm font-medium text-fg hover:bg-elevated">Cancel</button>
              <button type="submit" className="h-11 rounded-lg bg-accent text-sm font-medium text-accent-fg hover:opacity-90">Continue</button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
