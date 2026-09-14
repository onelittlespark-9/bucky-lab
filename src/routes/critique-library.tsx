import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpenCheck, CheckCircle2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { PROJECTIONS } from "@/lib/sim/projections";
import type { Projection } from "@/lib/sim/types";

export const Route = createFileRoute("/critique-library")({ component: CritiqueLibrary });

type CritiqueGuide = {
  imageAppearance: string[];
  technicalQuality: string[];
  commonErrors: string[];
};

const GUIDES: Record<string, CritiqueGuide> = {
  "pa-chest": {
    imageAppearance: [
      "Entire lungs demonstrated from the apices to both costophrenic angles, with the lateral chest walls included.",
      "Sternal ends of the clavicles should be approximately equidistant from the spinous processes, indicating minimal rotation.",
      "Scapulae should be projected largely outside the lung fields and the chin should not obscure the apices.",
      "On adequate inspiration, approximately 10 posterior ribs should be visible above the diaphragm.",
      "The lungs should be radiolucent but retain vascular markings; the hila, heart borders and both hemidiaphragms should remain identifiable.",
      "The thoracic vertebrae should be faintly visible through the mediastinum without the mediastinum becoming excessively penetrated.",
    ],
    technicalQuality: [
      "Exposure should preserve pulmonary vascular detail while still penetrating the heart and mediastinum.",
      "Sharp diaphragmatic and cardiac borders indicate minimal respiratory or patient movement.",
      "Collimation should include the apices and costophrenic angles without extending unnecessarily into the mandible or abdomen.",
    ],
    commonErrors: [
      "Mandible over the apices: chin not elevated sufficiently or field centred too superiorly.",
      "Medial scapular borders over the lungs: shoulders not rolled forward enough.",
      "Asymmetric clavicles: patient rotation.",
      "High hemidiaphragms and crowded basal markings: inadequate inspiration.",
    ],
  },
  "lat-chest": {
    imageAppearance: [
      "Lung apices and posterior costophrenic angles should be included.",
      "Posterior ribs should be nearly superimposed, indicating a true lateral position.",
      "Arms and humeri should be elevated clear of the upper thorax.",
      "The sternum should be seen in profile and the thoracic vertebral bodies should become progressively more lucent inferiorly.",
      "Retrosternal and retrocardiac lung spaces should remain visible with the diaphragms distinguishable.",
    ],
    technicalQuality: [
      "Adequate penetration is required through the shoulders and mediastinum without losing lower-lung detail.",
      "The posterior lung bases should be sharply defined and free from motion.",
    ],
    commonErrors: [
      "Separated posterior ribs: patient rotation.",
      "Humeri projected over the apices: arms insufficiently raised.",
      "Costophrenic angles excluded: centring too high or collimation too tight inferiorly.",
    ],
  },
  "ap-abdomen": {
    imageAppearance: [
      "The abdominal field should include the pubic symphysis/pubic rami inferiorly and the upper abdomen required by the examination superiorly.",
      "Lumbar spinous processes should lie centrally between symmetric pedicles and iliac wings, with no significant patient rotation.",
      "Psoas margins, renal outlines where visible, properitoneal fat stripes and bowel gas should be represented as subtle soft-tissue differences rather than hard-edged shapes.",
      "Bowel gas should remain distinctly radiolucent while surrounding soft tissues occupy a broad diagnostic grey scale.",
    ],
    technicalQuality: [
      "Exposure should show lumbar vertebral detail through the abdomen while preserving soft-tissue differentiation.",
      "The image should not be so penetrated that psoas or renal soft-tissue interfaces disappear.",
    ],
    commonErrors: [
      "Pubic symphysis excluded: centring too high.",
      "Asymmetric iliac wings or obturator foramina: rotation.",
      "Uniform grey abdomen with no soft-tissue separation: unsuitable exposure or excessive post-processing.",
    ],
  },
  "ap-pelvis": {
    imageAppearance: [
      "Both iliac crests, acetabula, femoral heads and necks, greater trochanters and proximal femoral shafts should be included.",
      "Obturator foramina and iliac wings should be symmetrical and the sacrum should align with the pubic symphysis.",
      "With appropriate internal rotation, the femoral necks should be elongated and the lesser trochanters should be minimally profiled.",
      "Pelvic bones should show cortical margins with internal trabecular grey structure; they should not appear as empty white outlines.",
    ],
    technicalQuality: [
      "Trabecular detail should be visible through the femoral heads, acetabula and iliac bones.",
      "Soft tissue around the pelvis and proximal thighs should remain visible without overwhelming the osseous anatomy.",
    ],
    commonErrors: [
      "Prominent lesser trochanters and foreshortened necks: legs insufficiently internally rotated.",
      "Asymmetric obturator foramina: pelvic rotation.",
      "Iliac crests or proximal femora excluded: incorrect centring or collimation.",
    ],
  },
  "ap-lumbar": {
    imageAppearance: [
      "T12 through the sacrum should be included with the lumbar vertebral bodies centred to the image.",
      "Spinous processes should be midline and pedicles approximately symmetrical.",
      "Sacroiliac joints and psoas margins should be visible where anatomy and exposure permit.",
      "Vertebral bodies should demonstrate trabecular detail and cortical endplates rather than uniform block opacity.",
    ],
    technicalQuality: ["Disc spaces and vertebral detail should remain visible through abdominal soft tissue.", "Collimation should be tight enough to reduce scatter while retaining the required anatomy."],
    commonErrors: ["Rotation shown by asymmetric pedicles.", "T12 or sacrum excluded by poor centring.", "Excess abdominal density obscuring vertebral detail."],
  },
  "lat-lumbar": {
    imageAppearance: ["T12 to the sacrum should be demonstrated.", "Posterior vertebral body margins should be near-superimposed on a true lateral.", "Intervertebral foramina and disc spaces should be visible with the vertebral bodies in profile."],
    technicalQuality: ["Exposure must penetrate the abdominal soft tissues sufficiently to show vertebral detail.", "The lumbar spine should be parallel to the detector to avoid closing disc spaces."],
    commonErrors: ["Double posterior vertebral margins: rotation.", "Closed disc spaces: spine not parallel to the detector.", "Lumbosacral junction excluded by incorrect centring."],
  },
};

function guideFor(projection: Projection): CritiqueGuide {
  return GUIDES[projection.id] ?? {
    imageAppearance: projection.criteria,
    technicalQuality: [
      "The required anatomy should be completely included with appropriate collimation.",
      "Cortical and trabecular bone detail should remain visible without excessive edge enhancement.",
      "Soft-tissue outlines should be present where clinically relevant and motion should not reduce sharpness.",
    ],
    commonErrors: [
      "Rotation or obliquity altering the expected anatomical relationships.",
      "Incorrect centring or collimation excluding required anatomy.",
      "Exposure or processing that obscures either soft tissue or internal bone structure.",
    ],
  };
}

function PositioningIllustration({ projection }: { projection: Projection }) {
  const lateral = projection.anatomy.includes("lat") || projection.id.startsWith("lat-");
  const tabletop = projection.setup === "table" || projection.setup === "tabletop";
  const chest = projection.id === "pa-chest" || projection.id === "lat-chest";
  const pelvis = projection.id === "ap-pelvis" || projection.id === "ap-hip";
  const limb = projection.region === "Upper limb" || projection.region === "Lower limb";

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-[#101419]">
      <svg viewBox="0 0 640 360" role="img" aria-label={`Reference patient positioning for ${projection.name}`} className="block h-auto w-full">
        <defs>
          <linearGradient id={`panel-${projection.id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#182027" />
            <stop offset="1" stopColor="#0b1014" />
          </linearGradient>
          <filter id={`soft-${projection.id}`}><feGaussianBlur stdDeviation="2" /></filter>
        </defs>
        <rect width="640" height="360" fill={`url(#panel-${projection.id})`} />
        <rect x={tabletop ? 74 : 472} y={tabletop ? 272 : 42} width={tabletop ? 492 : 28} height={tabletop ? 24 : 274} rx="5" fill="#59636c" />
        {!tabletop && <rect x="500" y="88" width="16" height="190" rx="5" fill="#303a42" />}
        <g transform={lateral ? "translate(90 4)" : "translate(0 4)"}>
          <ellipse cx={lateral ? 306 : 320} cy="72" rx={lateral ? 28 : 34} ry="38" fill="#b7bec4" />
          <path d={lateral ? "M300 108 C280 126 282 200 300 240 C310 260 322 258 332 239 C350 200 348 130 330 108 Z" : "M285 108 C265 130 270 210 284 240 C297 259 343 259 356 240 C370 210 375 130 355 108 Z"} fill="#9ea7ae" />
          <path d={lateral ? "M300 132 C274 168 269 204 279 242" : "M284 129 C245 158 233 205 242 247"} fill="none" stroke="#9ea7ae" strokeWidth="16" strokeLinecap="round" />
          <path d={lateral ? "M329 131 C354 166 360 204 349 242" : "M356 129 C395 158 407 205 398 247"} fill="none" stroke="#9ea7ae" strokeWidth="16" strokeLinecap="round" />
          {!limb && <><path d="M300 245 L294 326" stroke="#9ea7ae" strokeWidth="18" strokeLinecap="round" /><path d="M340 245 L346 326" stroke="#9ea7ae" strokeWidth="18" strokeLinecap="round" /></>}
          {chest && <path d={lateral ? "M279 122 Q265 92 286 66 M350 124 Q365 92 344 66" : "M283 123 Q245 112 230 143 M357 123 Q395 112 410 143"} fill="none" stroke="#d4dade" strokeWidth="9" strokeLinecap="round" />}
          {pelvis && <path d="M294 246 Q320 260 346 246" fill="none" stroke="#e3e7ea" strokeWidth="4" />}
        </g>
        <line x1={tabletop ? 320 : 78} y1={tabletop ? 52 : 180} x2={tabletop ? 320 : 470} y2={tabletop ? 270 : 180} stroke="#f6b73c" strokeWidth="2" strokeDasharray="8 7" />
        <circle cx={tabletop ? 320 : 470} cy={tabletop ? 270 : 180} r="6" fill="#f6b73c" />
        <rect x="22" y="20" width="184" height="54" rx="10" fill="#0d1217" fillOpacity=".86" stroke="#36404a" />
        <text x="38" y="43" fill="#f2f5f7" fontSize="15" fontWeight="700">Reference position</text>
        <text x="38" y="63" fill="#aeb7bf" fontSize="12">{lateral ? "Lateral alignment" : "AP/PA alignment"} · {projection.setup}</text>
        <g filter={`url(#soft-${projection.id})`} opacity=".25"><circle cx="320" cy="178" r="44" fill="#f6b73c" /></g>
      </svg>
      <figcaption className="border-t border-border bg-surface px-4 py-3 text-xs leading-5 text-muted">
        Reference positioning illustration. Use the written positioning instructions below for the exact limb, rotation and centring requirements.
      </figcaption>
    </figure>
  );
}

function CritiqueLibrary() {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState("All");
  const [openId, setOpenId] = useState<string | null>("pa-chest");
  const regions = useMemo(() => ["All", ...Array.from(new Set(PROJECTIONS.map(p => p.region)))], []);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return PROJECTIONS.filter(p => (region === "All" || p.region === region) && (!needle || `${p.name} ${p.shortName} ${p.region} ${p.criteria.join(" ")}`.toLowerCase().includes(needle)));
  }, [query, region]);

  return (
    <main className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-5 py-4">
          <Link to="/" className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-bg hover:text-fg"><ArrowLeft className="size-4" /> Home</Link>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Learning reference</p><h1 className="mt-1 text-xl font-semibold">Radiograph critique library</h1></div>
          <BookOpenCheck className="size-5 text-accent" />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-lg font-semibold">Positioning and image-quality standards</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-muted">Each projection includes a reference positioning illustration, the acquisition setup, the anatomy and relationships expected on an ideal radiograph, technical image-quality features and common positioning errors.</p>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search chest, pelvis, hand, C-spine…" className="h-11 rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-accent" />
            <select value={region} onChange={e => setRegion(e.target.value)} className="h-11 rounded-lg border border-border bg-bg px-3 text-sm outline-none focus:border-accent">{regions.map(item => <option key={item} value={item}>{item}</option>)}</select>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {filtered.map(projection => {
            const guide = guideFor(projection); const open = openId === projection.id;
            return <article key={projection.id} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              <button type="button" onClick={() => setOpenId(open ? null : projection.id)} className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-bg/50">
                <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{projection.region}</p><h2 className="mt-1 text-lg font-semibold">{projection.name}</h2><p className="mt-1 text-xs text-muted">{projection.sidCm} cm SID · {projection.kvp} kVp · {projection.setup}</p></div>
                <span className="rounded-full border border-border bg-bg px-3 py-1 text-xs font-medium text-muted">{open ? "Close" : "Open guide"}</span>
              </button>
              {open ? <div className="border-t border-border p-5">
                <div className="grid gap-6 xl:grid-cols-[minmax(320px,.8fr)_minmax(0,1.2fr)]">
                  <div><PositioningIllustration projection={projection} /><div className="mt-4 rounded-xl border border-border bg-bg/60 p-4 text-sm"><p className="font-semibold">Acquisition setup</p><dl className="mt-3 space-y-3"><div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Position</dt><dd className="mt-1 leading-6">{projection.position}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Centring</dt><dd className="mt-1 leading-6">{projection.centring}</dd></div><div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Collimation</dt><dd className="mt-1 leading-6">{projection.collimation}</dd></div>{projection.respiration ? <div><dt className="text-xs font-semibold uppercase tracking-wider text-muted">Respiration</dt><dd className="mt-1 capitalize">Expose on {projection.respiration}.</dd></div> : null}</dl></div></div>
                  <div className="space-y-5">
                    <section className="rounded-xl border border-accent/25 bg-accent/5 p-5"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-accent" /><h3 className="font-semibold">What an ideal radiograph should demonstrate</h3></div><ul className="mt-3 space-y-2 text-sm leading-6">{guide.imageAppearance.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" /><span>{item}</span></li>)}</ul></section>
                    <section className="rounded-xl border border-border p-5"><h3 className="font-semibold">Technical image quality</h3><ul className="mt-3 space-y-2 text-sm leading-6">{guide.technicalQuality.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-fg/50" /><span>{item}</span></li>)}</ul></section>
                    <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5"><div className="flex items-center gap-2"><TriangleAlert className="size-4 text-amber-500" /><h3 className="font-semibold">Common errors and what they suggest</h3></div><ul className="mt-3 space-y-2 text-sm leading-6">{guide.commonErrors.map(item => <li key={item} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500" /><span>{item}</span></li>)}</ul></section>
                    <section className="border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-muted">Core projection criteria</p><ul className="mt-3 grid gap-2 text-sm leading-6 sm:grid-cols-2">{projection.criteria.map(criterion => <li key={criterion} className="rounded-lg bg-bg px-3 py-2">{criterion}</li>)}</ul></section>
                  </div>
                </div>
              </div> : null}
            </article>;
          })}
        </div>
        {!filtered.length ? <div className="mt-6 rounded-2xl border border-border bg-surface p-8 text-center text-sm text-muted">No critique standards match your search.</div> : null}
      </div>
    </main>
  );
}
