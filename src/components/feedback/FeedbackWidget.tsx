import { useState } from "react";
import { useSim } from "@/lib/sim/store";
import {
  recordFeedback,
  type FeedbackCategory,
  type FeedbackRating,
} from "@/lib/feedback/feedback";

const categories: Array<{ id: FeedbackCategory; label: string }> = [
  { id: "bug", label: "Bug / broken" },
  { id: "positioning", label: "Positioning" },
  { id: "anatomy", label: "Anatomy" },
  { id: "radiograph", label: "Radiograph" },
  { id: "workflow", label: "Workflow" },
  { id: "performance", label: "Performance" },
  { id: "education", label: "Learning" },
  { id: "other", label: "Other" },
];

export function FeedbackWidget() {
  const sim = useSim();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("other");
  const [rating, setRating] = useState<FeedbackRating>(4);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  function submit() {
    if (!message.trim()) return;
    const saved = recordFeedback({
      category,
      rating,
      message,
      context: {
        screen: sim.screen,
        mode: sim.mode,
        projectionId: sim.projectionId,
        requestId: sim.requestId,
        appVersion: "architecture-feedback-v1",
      },
    });
    if (!saved) return;
    setMessage("");
    setSent(true);
    window.setTimeout(() => setSent(false), 2500);
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      {open ? (
        <section className="w-[min(92vw,380px)] rounded-xl border border-border bg-panel p-4 shadow-2xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-fg">Improve Bucky Lab</h2>
              <p className="mt-1 text-xs text-muted">Tell us what worked, failed or should behave differently.</p>
            </div>
            <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => setOpen(false)} aria-label="Close feedback">Close</button>
          </div>

          <label className="mb-3 block text-xs text-muted">
            Area
            <select value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)} className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-2 text-sm text-fg">
              {categories.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>

          <div className="mb-3">
            <p className="mb-1 text-xs text-muted">How well did it work?</p>
            <div className="flex gap-1" role="radiogroup" aria-label="Feedback rating">
              {([1, 2, 3, 4, 5] as FeedbackRating[]).map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)} className={`h-8 w-8 rounded-md border text-sm ${rating === value ? "border-accent bg-accent/15 text-fg" : "border-border text-muted"}`} aria-label={`${value} out of 5`} aria-pressed={rating === value}>{value}</button>
              ))}
            </div>
          </div>

          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What should we change?" maxLength={2000} rows={4} className="w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted" />
          <p className="mt-1 text-[11px] text-muted">Please do not enter patient-identifiable information.</p>

          <button type="button" disabled={!message.trim()} onClick={submit} className="mt-3 w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-40">
            {sent ? "Saved — thank you" : "Send feedback"}
          </button>
        </section>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="rounded-full border border-border bg-panel px-4 py-2 text-xs font-medium text-fg shadow-lg hover:bg-panel/90">
          Feedback
        </button>
      )}
    </div>
  );
}
