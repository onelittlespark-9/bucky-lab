import {useMemo,useState} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowLeft,ScanLine} from "lucide-react";
import {Button} from "@/components/ui/button";
import {CT_PHASES,CT_PROTOCOLS,type CtPhase} from "@/lib/ct/ct-protocols";

export function CtLab(){
 const[protocolId,setProtocolId]=useState("ct-cap"),[phase,setPhase]=useState<CtPhase>("portal-venous");
 const protocol=useMemo(()=>CT_PROTOCOLS.find(p=>p.id===protocolId)??CT_PROTOCOLS[0]!,[protocolId]);
 function choose(id:string){const p=CT_PROTOCOLS.find(x=>x.id===id)!;setProtocolId(id);setPhase(p.defaultPhase);}
 return <div className="min-h-dvh bg-bg text-foreground">
  <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/95 px-4 py-3 backdrop-blur">
   <Link to="/"><Button variant="ghost" size="sm" className="gap-1.5"><ArrowLeft className="size-4"/>Home</Button></Link>
   <div><h1 className="text-base font-semibold">CT Advanced Imaging</h1><p className="text-xs text-muted">Protocol selection · contrast timing · reconstruction planning</p></div>
  </header>
  <main className="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_430px]">
   <section className="space-y-5 rounded-xl border border-border bg-panel p-4">
    <div><h2 className="font-semibold">CT case library</h2><p className="mt-1 text-xs text-muted">Educational UK/NHS-style presets. Local trust protocols and radiologist instructions take precedence.</p></div>
    {Array.from(new Set(CT_PROTOCOLS.map(p=>p.category))).map(category=><div key={category}><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{category}</h3><div className="grid gap-2 sm:grid-cols-2">{CT_PROTOCOLS.filter(p=>p.category===category).map(p=><Button key={p.id} variant={p.id===protocolId?"default":"outline"} className="h-auto min-h-20 justify-start gap-3 p-3 text-left" onClick={()=>choose(p.id)}><ScanLine className="size-4 shrink-0"/><span><span className="block font-medium">{p.name}</span><span className="mt-1 block text-[11px] opacity-70">{p.coverage}</span></span></Button>)}</div></div>)}
   </section>
   <aside className="space-y-4 rounded-xl border border-border bg-panel p-4 lg:sticky lg:top-20 lg:h-fit">
    <div><h2 className="font-semibold">{protocol.name}</h2><p className="mt-1 text-xs leading-5 text-muted">{protocol.summary}</p></div>
    <div><label className="text-xs font-semibold uppercase tracking-wide text-muted">Contrast / acquisition phase</label><div className="mt-2 grid gap-2">{protocol.availablePhases.map(id=><Button key={id} variant={phase===id?"default":"outline"} className="h-auto justify-start py-2 text-left" onClick={()=>setPhase(id)}><span><span className="block text-sm">{CT_PHASES[id].name}</span><span className="block text-[11px] opacity-70">{CT_PHASES[id].delay}</span></span></Button>)}</div></div>
    <div className="rounded-lg border border-border bg-surface p-3 text-xs leading-5"><div className="font-medium">Phase purpose</div><div className="text-muted">{CT_PHASES[phase].purpose}</div></div>
    <div className="rounded-lg border border-border bg-surface p-3 text-xs leading-5"><div className="font-medium">Contrast approach</div><div className="text-muted">{protocol.contrast}</div></div>
    <div><div className="text-xs font-medium">Reconstructions</div><div className="mt-2 flex flex-wrap gap-1.5">{protocol.reconstructions.map(r=><span key={r} className="rounded border border-border bg-surface px-2 py-1 text-[11px]">{r}</span>)}</div></div>
   </aside>
  </main>
 </div>;
}
