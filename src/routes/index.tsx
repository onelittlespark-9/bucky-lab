import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Layers3, ScanLine } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;

  const areas = [
    [BookOpen, "Patient & request", "Read the clinical story and speak naturally with the patient before positioning."],
    [Layers3, "Positioning", "Use the room, detector and patient controls to reproduce real clinical positioning decisions."],
    [ScanLine, "Radiograph", "Assess anatomy, positioning, exposure, collimation and recognisable technical errors."],
  ] as const;

  return <main className="min-h-dvh bg-bg text-fg">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-xl bg-accent text-sm font-bold text-white">BL</div><div><p className="font-semibold">Bucky Lab</p><p className="text-xs text-muted">Radiography simulation laboratory</p></div></div><Link to="/cases" className="text-sm text-muted hover:text-fg">Case library</Link></div></header>
    <section className="mx-auto grid min-h-[calc(100dvh-73px)] max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.15fr_.85fr]">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Learn by doing</p><h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">Practise the whole radiographic examination — not just the exposure.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-muted">Bucky Lab puts you in the position of the radiographer. Meet the patient, work through the clinical request, choose a safe position, produce the image and decide whether the radiograph is technically acceptable.</p><div className="mt-7 flex flex-wrap gap-3"><Link to="/cases"><Button size="lg" className="gap-2">Open 150-case library <ArrowRight className="size-4" /></Button></Link><Link to="/lab"><Button size="lg" variant="outline">Continue to laboratory</Button></Link></div></div>
      <div className="grid gap-3">{areas.map(([Icon, title, body]) => <div key={title} className="rounded-2xl border border-border bg-surface p-5"><Icon className="size-5 text-accent" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-muted">{body}</p></div>)}</div>
    </section>
  </main>;
}

function LoadingScreen() { return <main className="grid min-h-dvh place-items-center bg-bg px-5"><div className="w-full max-w-sm text-center"><div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-accent text-lg font-bold text-white shadow-lg">BL</div><h1 className="text-xl font-semibold text-fg">Loading Bucky Lab</h1><p className="mt-2 text-sm text-muted">Checking your session and preparing the radiography laboratory…</p><div className="mx-auto mt-5 h-1.5 w-48 overflow-hidden rounded-full bg-bg"><div className="h-full w-1/2 animate-pulse rounded-full bg-accent" /></div></div></main>; }
