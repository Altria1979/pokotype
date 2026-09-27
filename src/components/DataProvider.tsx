"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useLocaleBlock } from "./LocaleGuard";
import type { Article } from "@/lib/articles";
import type { PracticeItem } from "@/lib/practice-run";
import {
  DEFAULT_PREFERENCES,
  loadData,
  loadPreferences,
  savePreferences,
  saveArticle,
  deleteArticle,
  savePractice,
  type KanaStats,
  type PracticeRecord,
  type Preferences,
} from "@/lib/storage";
type Data = {
  articles: Article[];
  records: PracticeRecord[];
  stats: KanaStats;
};
type KanaSession = {
  id: string;
  items: PracticeItem[];
  mode: "normal" | "weak";
  title: string;
};
type KanaNavigation = {
  session: KanaSession | null;
  entered: boolean;
  restoreFocus: boolean;
};
type Context = Data & {
  ready: boolean;
  error: string;
  clearError: () => void;
  preferences: Preferences;
  updatePreferences: (p: Partial<Preferences>) => void;
  putArticle: (a: Article) => Promise<boolean>;
  removeArticle: (id: string) => Promise<boolean>;
  addRecord: (r: PracticeRecord, stats: KanaStats) => Promise<void>;
  kanaSession: KanaSession | null;
  startKanaSession: (items: PracticeItem[], weak: boolean) => string;
  restoreKanaFocus: boolean;
  acknowledgeKanaReturn: () => void;
};
const DataContext = createContext<Context | null>(null);
export function DataProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("Data");
  const [kanaNavigation, setKanaNavigation] = useState<KanaNavigation>({
    session: null,
    entered: false,
    restoreFocus: false,
  });
  const onPracticePage = pathname === "/practice" || pathname === "/practice/";
  // Observe committed route changes, not unmount cleanup: push is asynchronous,
  // and StrictMode can replay effects without actually leaving the session.
  if (kanaNavigation.session && onPracticePage !== kanaNavigation.entered) {
    setKanaNavigation(onPracticePage
      ? { ...kanaNavigation, entered: true }
      : { session: null, entered: false, restoreFocus: true });
  }
  const acknowledgeKanaReturn = useCallback(() => {
    setKanaNavigation((current) => current.restoreFocus
      ? { ...current, restoreFocus: false }
      : current);
  }, []);
  function startKanaSession(items: PracticeItem[], weak: boolean) {
    const id = crypto.randomUUID();
    setKanaNavigation({
      session: {
        id,
        items,
        mode: weak ? "weak" : "normal",
        title: weak ? "五十音 · 错项强化" : "五十音 · 自由练习",
      },
      entered: false,
      restoreFocus: false,
    });
    return id;
  }
  const [data, setData] = useState<Data>({
    articles: [],
    records: [],
    stats: {},
  });
  const [ready, setReady] = useState(false);
  const [errorKey, setError] = useState("");
  const error = errorKey ? t(errorKey) : "";
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const writes = useRef(new Map<string, { run: () => Promise<void>; pending: boolean; errorKey: string }>());
  const [saveState, setSaveState] = useState({ pending: 0, failed: 0 });
  useLocaleBlock("saving", !ready || saveState.pending > 0 || saveState.failed > 0);
  useLocaleBlock("practice", Boolean(kanaNavigation.session));
  function updateSaveState() {
    const jobs = [...writes.current.values()];
    setSaveState({ pending: jobs.filter((job) => job.pending).length, failed: jobs.filter((job) => !job.pending).length });
  }
  async function persist(key: string, run: () => Promise<void>, failure: string, retainFailure = true): Promise<boolean> {
    const job = { run, pending: true, errorKey: failure };
    writes.current.set(key, job);
    updateSaveState();
    try {
      await run();
      if (writes.current.get(key) === job) writes.current.delete(key);
      return true;
    } catch {
      if (writes.current.get(key) === job) {
        if (retainFailure) job.pending = false;
        else writes.current.delete(key);
      }
      setError(failure);
      return false;
    } finally {
      updateSaveState();
    }
  }
  async function retryWrites() {
    const jobs = [...writes.current.entries()].filter(([, job]) => !job.pending);
    const results = await Promise.all(jobs.map(([key, job]) => persist(key, job.run, job.errorKey)));
    if (results.every(Boolean)) setError("");
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const p = loadPreferences();
        if (alive) setPreferences(p);
      } catch {
        if (alive) setError("preferencesRead");
      }
      try {
        const d = await loadData();
        if (alive) setData(d);
      } catch {
        if (alive)
          setError("dataRead");
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  async function putArticle(article: Article) {
    setData((d) => ({
      ...d,
      articles: [article, ...d.articles.filter((a) => a.id !== article.id)],
    }));
    return persist(`article:${article.id}`, () => saveArticle(article), "articleSave");
  }
  async function removeArticle(id: string) {
    const saved = await persist(`delete:${id}`, async () => {
      await deleteArticle(id);
      writes.current.delete(`article:${id}`);
      setData((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== id) }));
    }, "articleDelete", false);
    return saved;
  }

  async function addRecord(record: PracticeRecord, delta: KanaStats) {
    setData((d) => {
      if (d.records.some((r) => r.id === record.id)) return d;
      const stats = { ...d.stats };
      for (const [k, v] of Object.entries(delta)) {
        const old = stats[k] ?? { seen: 0, errors: 0, durationMs: 0 };
        stats[k] = {
          seen: old.seen + v.seen,
          errors: old.errors + v.errors,
          durationMs: old.durationMs + v.durationMs,
        };
      }
      return { ...d, stats, records: [record, ...d.records] };
    });
    await persist(`record:${record.id}`, () => savePractice(record, delta), "recordSave");
  }
  function updatePreferences(p: Partial<Preferences>) {
    const next = { ...preferences, ...p };
    setPreferences(next);
    void persist("preferences", async () => savePreferences(next), "preferencesSave");
  }
  return (
    <DataContext.Provider
      value={{
        ...data,
        ready,
        error,
        clearError: () => setError(""),
        preferences,
        updatePreferences,
        putArticle,
        removeArticle,
        addRecord,
        kanaSession: kanaNavigation.session,
        startKanaSession,
        restoreKanaFocus: kanaNavigation.restoreFocus,
        acknowledgeKanaReturn,
      }}
    >
      {error && (
        <div className="error" role="alert">
          <div className="spread">
            <span>{error}</span>
            <button onClick={() => setError("")} aria-label={t("close")}>
              ×
            </button>
          </div>
        </div>
      )}
      {saveState.failed > 0 && (
        <div className="notice spread" role="status" data-testid="pending-save">
          <span>{t("unsaved")}</span>
          <button type="button" disabled={saveState.pending > 0} onClick={() => void retryWrites()}>
            {t(saveState.pending > 0 ? "saving" : "retry")}
          </button>
        </div>
      )}
      {children}
    </DataContext.Provider>
  );
}
export function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("Missing DataProvider");
  return value;
}
