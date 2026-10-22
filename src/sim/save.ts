export type Save = {
  v: 1;
  mute: boolean;
  train: boolean;
  test: string | null;
  bestGrid: number;
};

const KEY = "block4-save-v1";

const EMPTY: Save = { v: 1, mute: false, train: false, test: null, bestGrid: 0 };

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed.v !== 1) return { ...EMPTY };
    return {
      v: 1,
      mute: Boolean(parsed.mute),
      train: Boolean(parsed.train),
      test: typeof parsed.test === "string" ? parsed.test : null,
      bestGrid: typeof parsed.bestGrid === "number" ? parsed.bestGrid : 0,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeSave(next: Save): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
}
