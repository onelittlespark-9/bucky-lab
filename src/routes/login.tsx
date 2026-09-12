import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({ component: Login });

/**
 * Authentication is currently disabled. Keep this as a clean application
 * entry screen rather than rendering the clinical simulator underneath it.
 * No patient, request, projection or examination information belongs here.
 */
function Login() {
  return (
    <main className="min-h-dvh bg-bg px-5 py-10 text-fg">
      <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-5xl place-items-center">
        <div className="grid w-full overflow-hidden rounded-3xl border border-border bg-surface shadow-xl md:grid-cols-[1.05fr_.95fr]">
          <section className="border-b border-border p-8 md:border-b-0 md:border-r md:p-12">
            <div className="mb-8 grid size-14 place-items-center rounded-2xl bg-accent text-lg font-bold text-white shadow-lg">
              BL
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Diagnostic radiography simulation</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">Bucky Lab</h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-muted">
              A practical radiography laboratory for learning patient care,
              positioning, projection, exposure and image critique before placement.
            </p>
          </section>

          <section className="p-8 md:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Laboratory access</p>
            <h2 className="mt-3 text-2xl font-semibold">Enter the laboratory</h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              The simulator is currently running in guest learning mode while the
              production identity system is being rebuilt.
            </p>
            <Link
              to="/"
              className="mt-7 flex h-12 w-full items-center justify-center rounded-sm bg-accent px-5 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
            >
              Continue to Bucky Lab
            </Link>
            <div className="mt-6 rounded-xl border border-border bg-bg/60 p-4">
              <p className="text-xs font-semibold text-fg">Privacy boundary</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Patient and examination information only appears after entering
                the laboratory, not on this access screen.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
