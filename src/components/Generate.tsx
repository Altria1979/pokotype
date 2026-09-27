"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/i18n/errors";
import { useLocaleBlock } from "./LocaleGuard";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { generateArticle, type GenerateOptions } from "@/lib/deepseek";
import { sentenceText, type Article } from "@/lib/articles";
import { API_KEY_EVENT, AI_SETTINGS_EVENT, AI_SETTINGS_KEY, loadAiSettings, loadApiKey, saveAiSettings } from "@/lib/storage";
import { defaultAiSettings, isValidModelId, type AiSettings } from "@/lib/ai-models";
import { AiModelFields } from "./AiModelFields";
import { useData } from "./DataProvider";
import { Icon } from "./Icon";
import s from "./Generate.module.css";

const THEMES = [
  { value: "日常", key: "daily" },
  { value: "旅行", key: "travel" },
  { value: "校园", key: "school" },
  { value: "工作", key: "work" },
  { value: "文化", key: "culture" },
  { value: "自定义", key: "custom" },
] as const;
const LENGTHS = ["short", "medium", "long"] as const;

export function Generate({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const t = useTranslations("Generate");
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useLocaleBlock("generation", open);

  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnHistoryChange = () => dialog.current?.close();
    window.addEventListener("popstate", closeOnHistoryChange);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("popstate", closeOnHistoryChange);
    };
  }, [open]);

  function close() {
    dialog.current?.close();
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          dialog.current?.showModal();
          closeButton.current?.focus({ preventScroll: true });
        }}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        className={s.dialog}
        aria-labelledby={titleId}
        onClose={close}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey)
            return;
          const selectedRadios = new Set(
            [...event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')]
              .map((input) => input.name),
          );
          const focusable = [...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          )].filter((element) => {
            if (!element.getClientRects().length) return false;
            // A radio group is one Tab stop, including when submit is disabled.
            return !(element instanceof HTMLInputElement &&
              element.type === "radio" && !element.checked &&
              selectedRadios.has(element.name));
          });
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className={s.header}>
          <div>
            <div className="eyebrow">{t("eyebrow")}</div>
            <h2 id={titleId}>{t("title")}</h2>
          </div>
          <button
            ref={closeButton}
            type="button"
            className={s.closeButton}
            aria-label={t("closeLabel")}
            onClick={close}
          >
            {t("close")} <span aria-hidden="true">×</span>
          </button>
        </div>
        {open && <GenerateForm onClose={close} />}
      </dialog>
    </>
  );
}

function GenerateForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Generate");
  const errorMessage = useErrorMessage();
  const { putArticle, ready, clearError } = useData();
  const fieldId = useId();
  const [result, setResult] = useState<{
    article: Article;
    saved: boolean;
  } | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const saving = useRef(false);
  useEffect(() => {
    resultHeading.current?.focus();
  }, [result]);
  const [topic, setTopic] = useState("日常");
  const [customTopic, setCustomTopic] = useState("");
  const [level, setLevel] = useState("N5");
  const [length, setLength] = useState<GenerateOptions["length"]>("short");
  const [aiSettings, setAiSettings] = useState(defaultAiSettings);
  const currentAiSettings = useRef(aiSettings);
  const [aiReady, setAiReady] = useState(false);
  const provider = aiSettings.provider;
  const providerName = t(`providers.${provider}`);
  const model = aiSettings.models[provider];
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    function refreshAiSettings(event?: Event) {
      if (!mounted.current || request.current) return;
      if (event instanceof StorageEvent && event.key !== null && event.key !== AI_SETTINGS_KEY) return;
      try {
        const settings = loadAiSettings();
        if (currentAiSettings.current.provider !== settings.provider) setHasKey(null);
        currentAiSettings.current = settings;
        setAiSettings(settings);
      } catch {
        setError(t("readSettingsError"));
      }
    }
    void Promise.resolve().then(() => {
      if (!mounted.current) return;
      refreshAiSettings();
      setAiReady(true);
    });
    window.addEventListener(AI_SETTINGS_EVENT, refreshAiSettings);
    window.addEventListener("storage", refreshAiSettings);
    return () => {
      mounted.current = false;
      request.current?.abort();
      window.removeEventListener(AI_SETTINGS_EVENT, refreshAiSettings);
      window.removeEventListener("storage", refreshAiSettings);
    };
  }, [t]);

  useEffect(() => {
    if (!aiReady) return;
    let active = true;
    function refreshKey() {
      if (!active) return;
      try {
        setHasKey(Boolean(loadApiKey(provider).trim()));
      } catch {
        setHasKey(false);
        setError(t("readLocalKeyError"));
      }
    }
    void Promise.resolve().then(() => {
      refreshKey();
    });
    window.addEventListener("focus", refreshKey);
    window.addEventListener("storage", refreshKey);
    window.addEventListener(API_KEY_EVENT, refreshKey);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshKey);
      window.removeEventListener("storage", refreshKey);
      window.removeEventListener(API_KEY_EVENT, refreshKey);
    };
  }, [provider, aiReady, t]);

  function changeAiSettings(value: AiSettings) {
    if (request.current) return;
    if (value.provider !== provider) setHasKey(null);
    currentAiSettings.current = value;
    setAiSettings(value);
    setError("");
    if (!Object.values(value.models).every(isValidModelId)) return;
    try {
      saveAiSettings(value);
    } catch {
      setError(t("saveSettingsError"));
    }
  }

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    let apiKey: string;
    try {
      apiKey = loadApiKey(provider);
    } catch {
      setError(t("readKeyError"));
      return;
    }
    if (!apiKey.trim()) {
      setHasKey(false);
      setError(t("keyRequired", { provider: providerName }));
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    try {
      const article = await generateArticle(
        {
          topic: topic === "自定义" ? customTopic.trim() : topic,
          level,
          length,
          provider,
          model,
        },
        apiKey,
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      const saved = await putArticle(article);
      if (mounted.current && !controller.signal.aborted)
        setResult({ article, saved });
    } catch (cause) {
      if (mounted.current)
        setError(
          errorMessage(cause, "GenerationErrors.failed"),
        );
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) setPending(false);
    }
  }

  async function retrySave() {
    if (!result || saving.current) return;
    saving.current = true;
    setPending(true);
    clearError();
    try {
      const saved = await putArticle(result.article);
      if (mounted.current) setResult({ ...result, saved });
    } finally {
      saving.current = false;
      if (mounted.current) setPending(false);
    }
  }

  if (result) return (
    <div className={s.content}>
      <p className={s.resultStatus} role="status">
        <Icon name="book" size={18} />
        {result.saved ? t("saved") : t("generated")}
      </p>
      <h3
        className={s.resultTitle}
        ref={resultHeading}
        tabIndex={-1}
        lang="ja"
      >
        {result.article.title}
      </h3>
      <p className={s.resultExcerpt} lang="ja">
        {sentenceText(result.article.sentences[0])}
      </p>
      {!result.saved && (
        <div className="error" role="alert">
          {t("saveError")}
        </div>
      )}
      <p className="subtitle">{t("reviewHelp")}</p>
      <div className={s.generateActions}>
        {!result.saved && (
          <button type="button" disabled={pending} onClick={retrySave}>
            {pending ? t("saving") : t("retrySave")}
          </button>
        )}
        <button type="button" onClick={onClose}>{t("stay")}</button>
        <Link
          className="primary"
          href={`/articles/?id=${encodeURIComponent(result.article.id)}`}
          onClick={onClose}
        >
          {t("viewArticle")} <Icon name="arrow" size={16} />
        </Link>
      </div>
    </div>
  );

  return (
    <form
      className={s.content}
      onSubmit={generate}
      aria-busy={pending}
    >
      <p className={s.intro}>{t("intro")}</p>
      <fieldset disabled={pending} className={s.formFields}>
        <AiModelFields value={aiSettings} onChange={changeAiSettings} idPrefix={fieldId} />
        <div className="field">
          <label htmlFor={`${fieldId}-topic`}>{t("topic")}</label>
          <select
            id={`${fieldId}-topic`}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
          >
            {THEMES.map((theme) => (
              <option key={theme.value} value={theme.value}>{t(`topics.${theme.key}`)}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-level`}>{t("level")}</label>
          <select
            id={`${fieldId}-level`}
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            <option value="N5">{t("levels.N5")}</option>
            <option value="N4">{t("levels.N4")}</option>
            <option value="N3">{t("levels.N3")}</option>
            <option value="N2">{t("levels.N2")}</option>
            <option value="N1">{t("levels.N1")}</option>
          </select>
          <small>{t("levelHelp")}</small>
        </div>
        {topic === "自定义" && (
          <div className={`field ${s.fullWidth}`}>
            <label htmlFor={`${fieldId}-custom-topic`}>{t("customTopic")}</label>
            <textarea
              id={`${fieldId}-custom-topic`}
              required
              value={customTopic}
              maxLength={200}
              rows={3}
              placeholder={t("customPlaceholder")}
              onChange={(event) => setCustomTopic(event.target.value)}
            />
            <small>{t("customCount", { count: customTopic.length })}</small>
          </div>
        )}
        <fieldset className={s.lengthField}>
          <legend>{t("length")}</legend>
          <div className={s.lengthOptions}>
            {LENGTHS.map((item) => (
              <label
                className={length === item ? s.lengthSelected : ""}
                key={item}
              >
                <input
                  type="radio"
                  name={`${fieldId}-length`}
                  value={item}
                  checked={length === item}
                  onChange={() => setLength(item)}
                />
                <strong>{t(`lengths.${item}.title`)}</strong>
                <small>{t(`lengths.${item}.description`)}</small>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      {hasKey === false && (
        <div className="notice">
          <div className="flex">
            <Icon name="key" size={18} />
            <span>
              {t("ownKey", { provider: providerName })}
              <Link href="/settings/" onClick={onClose}>{t("settings")} →</Link>
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className={s.generateActions}>
        <button
          className="primary"
          type="submit"
          disabled={
            pending ||
            !hasKey ||
            !ready ||
            !aiReady ||
            !isValidModelId(model) ||
            (topic === "自定义" && !customTopic.trim())
          }
        >
          <Icon name="spark" size={18} />
          {pending ? t("generating") : t("submit")}
        </button>
        {pending && (
          <button type="button" onClick={() => request.current?.abort()}>
            {t("cancel")}
          </button>
        )}
      </div>
      <p className={s.costNote} role={pending ? "status" : undefined}>
        {pending
          ? t("waiting")
          : t("cost", { provider: providerName })}
      </p>
    </form>
  );
}
