export type FeedbackCategory =
  | "bug"
  | "positioning"
  | "anatomy"
  | "radiograph"
  | "workflow"
  | "performance"
  | "education"
  | "other";

export type FeedbackRating = 1 | 2 | 3 | 4 | 5;

export interface FeedbackContext {
  screen?: string;
  mode?: string;
  projectionId?: string;
  requestId?: string | null;
  patientId?: string;
  appVersion?: string;
}

export interface FeedbackRecord {
  id: string;
  createdAt: string;
  category: FeedbackCategory;
  rating: FeedbackRating;
  message: string;
  context: FeedbackContext;
}

const STORAGE_KEY = "bucky-lab:feedback:v1";
const MAX_RECORDS = 100;

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function makeId() {
  return `fb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Store structured product feedback locally so feedback survives navigation and
 * can be exported without introducing a third-party analytics dependency.
 * Never store patient names, DOBs, hospital numbers or other identifiers.
 */
export function recordFeedback(
  input: Omit<FeedbackRecord, "id" | "createdAt">,
): FeedbackRecord | null {
  const storage = browserStorage();
  if (!storage) return null;

  const record: FeedbackRecord = {
    ...input,
    id: makeId(),
    createdAt: new Date().toISOString(),
    message: input.message.trim().slice(0, 2000),
    context: {
      ...input.context,
      patientId: undefined,
      requestId: input.context.requestId ?? null,
    },
  };

  try {
    const existing = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as FeedbackRecord[];
    const next = [record, ...existing].slice(0, MAX_RECORDS);
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return record;
  } catch {
    return null;
  }
}

export function readFeedback(): FeedbackRecord[] {
  const storage = browserStorage();
  if (!storage) return [];
  try {
    const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? (value as FeedbackRecord[]) : [];
  } catch {
    return [];
  }
}

export function exportFeedback(): string {
  return JSON.stringify(readFeedback(), null, 2);
}

export function clearFeedback() {
  browserStorage()?.removeItem(STORAGE_KEY);
}
