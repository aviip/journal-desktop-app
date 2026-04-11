export type JournalEntry = {
  id: string;
  createdAt: number;
  updatedAt: number;
  text: string;
};

export type JournalState = {
  entries: JournalEntry[];
  activeId: string;
};

const STORAGE_KEY = "journal.state.v1";

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createEntry(now = Date.now()): JournalEntry {
  return { id: randomId(), createdAt: now, updatedAt: now, text: "" };
}

export function loadJournalState(): JournalState {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeJsonParse<JournalState>(raw) : null;
  console.log("🚀 ~ loadJournalState ~ parsed:", parsed)

  const nonEmptyEntries =
    parsed?.entries.filter((e) => e.text.trim() !== "") ?? [];
  console.log("🚀 ~ loadJournalState ~ nonEmptyEntries:", nonEmptyEntries);

  if (
    parsed &&
    Array.isArray(nonEmptyEntries) &&
    typeof parsed.activeId === "string"
  ) {
    const activeExists = nonEmptyEntries.some((e) => e.id === parsed.activeId);
    if (activeExists) return parsed;
  }

  const entry = createEntry();
  return { entries: [entry], activeId: entry.id };
}

export function saveJournalState(state: JournalState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getActiveEntry(state: JournalState): JournalEntry {
  const found = state.entries.find((e) => e.id === state.activeId);
  return found ?? state.entries[0] ?? createEntry();
}

export function upsertEntry(
  state: JournalState,
  entry: JournalEntry,
): JournalState {
  const without = state.entries.filter((e) => e.id !== entry.id);
  const nextEntries = [entry, ...without];

  return { ...state, entries: nextEntries, activeId: entry.id };
}
