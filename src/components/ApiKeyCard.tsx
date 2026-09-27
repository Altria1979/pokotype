"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useErrorMessage } from "@/i18n/errors";
import { useLocaleBlock } from "./LocaleGuard";
import { AI_PROVIDERS, type AiProvider } from "@/lib/ai-models";
import { fetchProviderModels } from "@/lib/ai-connection";
import {
  API_KEY_EVENT,
  apiKeyStorageName,
  clearApiKey,
  loadApiKey,
  saveApiKey,
} from "@/lib/storage";
import { publishModelCatalog } from "./useModelCatalog";
import { ModelListDialog } from "./ModelListDialog";
import s from "./ApiKeyCard.module.css";

export function ApiKeyCard({ provider }: { provider: AiProvider }) {
  const t = useTranslations("ApiKey");
  const modelT = useTranslations("Models");
  const errorMessage = useErrorMessage();
  const config = AI_PROVIDERS[provider];
  const providerName = modelT(`providers.${provider}`);
  const [draft, setDraft] = useState("");
  const [saved, setSaved] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<"saved" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [checkedModels, setCheckedModels] = useState<string[] | null>(null);
  const savedKey = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestVersion = useRef(0);
  const mounted = useRef(false);
  useLocaleBlock("settings", draft.length > 0);
  useLocaleBlock("checking", checking);

  const invalidateCheck = useCallback((clearCatalog = true) => {
    requestVersion.current += 1;
    request.current?.abort();
    request.current = null;
    setChecking(false);
    setVerified(null);
    setCheckedModels(null);
    if (clearCatalog) publishModelCatalog(provider, null);
  }, [provider]);

  useEffect(() => {
    mounted.current = true;
    function refreshSavedKey(forceReset = false) {
      try {
        const stored = loadApiKey(provider).trim();
        if (forceReset || (savedKey.current !== null && savedKey.current !== stored)) {
          invalidateCheck();
          setError("");
          setNotice("");
        }
        savedKey.current = stored;
        setSaved(Boolean(stored));
      } catch {
        savedKey.current = null;
        setSaved(false);
        invalidateCheck();
        setNotice("");
        setError(t("readError"));
      }
    }
    function onFocus() {
      refreshSavedKey();
    }
    function onStorage(event: StorageEvent) {
      if (event.key === apiKeyStorageName(provider) || event.key === null) {
        refreshSavedKey(true);
      }
    }
    function onKeyChange(event: Event) {
      if ((event as CustomEvent<{ provider: AiProvider }>).detail?.provider === provider) {
        refreshSavedKey(true);
      }
    }
    void Promise.resolve().then(() => {
      if (mounted.current) refreshSavedKey();
    });
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener(API_KEY_EVENT, onKeyChange);
    return () => {
      mounted.current = false;
      requestVersion.current += 1;
      request.current?.abort();
      request.current = null;
      savedKey.current = null;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(API_KEY_EVENT, onKeyChange);
    };
  }, [provider, invalidateCheck, t]);

  function editKey(value: string) {
    invalidateCheck();
    setDraft(value);
    setError("");
    setNotice("");
  }

  function save() {
    const key = draft.trim();
    const verifiedModels = verified && key ? checkedModels : null;
    invalidateCheck();
    setError("");
    setNotice("");
    if (!key) {
      setError(t("enterKey", { provider: providerName }));
      return;
    }
    try {
      saveApiKey(key, provider);
      savedKey.current = key;
      setSaved(true);
      setDraft("");
      if (verifiedModels) {
        setVerified("saved");
        setCheckedModels(verifiedModels);
        publishModelCatalog(provider, verifiedModels);
        setNotice(t("verifiedSaved", { count: verifiedModels.length }));
      } else {
        setNotice(t("savedUnchecked", { provider: providerName }));
      }
    } catch {
      setError(t("saveError"));
    }
  }

  function clear() {
    invalidateCheck();
    setError("");
    setNotice("");
    try {
      clearApiKey(provider);
      savedKey.current = "";
      setSaved(false);
      setDraft("");
      setNotice(t("cleared", { provider: providerName }));
    } catch {
      setError(t("clearError"));
    }
  }

  async function checkConnection() {
    if (request.current) return;
    invalidateCheck(false);
    setError("");
    setNotice("");
    let stored: string;
    try {
      stored = loadApiKey(provider).trim();
      if (savedKey.current !== null && savedKey.current !== stored) {
        publishModelCatalog(provider, null);
      }
      savedKey.current = stored;
      setSaved(Boolean(stored));
    } catch {
      savedKey.current = null;
      setSaved(false);
      publishModelCatalog(provider, null);
      setError(t("readError"));
      return;
    }
    const key = draft.trim() || stored;
    if (!key) {
      setError(t("enterKeyFirst", { provider: providerName }));
      return;
    }
    const controller = new AbortController();
    const version = ++requestVersion.current;
    request.current = controller;
    setChecking(true);
    try {
      const models = await fetchProviderModels(provider, key, controller.signal);
      if (!mounted.current || version !== requestVersion.current || controller.signal.aborted) return;
      let currentKey: string;
      try {
        currentKey = loadApiKey(provider).trim();
      } catch {
        savedKey.current = null;
        setSaved(false);
        invalidateCheck();
        setError(t("readError"));
        return;
      }
      if (currentKey !== savedKey.current) {
        savedKey.current = currentKey;
        setSaved(Boolean(currentKey));
        invalidateCheck();
        setNotice(t("keyChanged"));
        return;
      }
      const isSaved = key === currentKey;
      setVerified(isSaved ? "saved" : "draft");
      setCheckedModels(models);
      setNotice(
        t("verified", { count: models.length }) +
        (isSaved ? "" : ` ${t("notSaved", { action: t(currentKey ? "replace" : "save") })}`),
      );
      if (isSaved) publishModelCatalog(provider, models);
    } catch (cause) {
      if (mounted.current && version === requestVersion.current && !controller.signal.aborted) {
        publishModelCatalog(provider, null);
        setError(errorMessage(cause, "ApiKey.checkError"));
      }
    } finally {
      if (mounted.current && version === requestVersion.current) {
        request.current = null;
        setChecking(false);
      }
    }
  }

  const status = verified === "saved"
    ? t("statusVerified")
    : verified === "draft"
      ? t("statusDraft")
      : saved ? t("statusUnchecked") : t("statusEmpty");

  return (
    <section className={s.card} aria-label={t("keyLabel", { provider: providerName })} aria-busy={checking}>
      <div className={s.header}>
        <h3>{t("keyLabel", { provider: providerName })}</h3>
        <span className={`pill ${s.badge}`}>{status}</span>
      </div>
      <p className={s.intro}>
        {provider === "bailian"
          ? t("bailianIntro")
          : t("deepseekIntro")}
      </p>
      <form onSubmit={(event) => { event.preventDefault(); save(); }}>
        <div className="field">
          <label htmlFor={`api-key-${provider}`}>{t("keyLabel", { provider: providerName })}</label>
          <input
            id={`api-key-${provider}`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(event) => editKey(event.target.value)}
            placeholder={saved ? t("replacePlaceholder") : t("keyPlaceholder", { provider: providerName })}
            aria-describedby={`api-key-${provider}-help`}
          />
          <small id={`api-key-${provider}-help`}>
            {t("keyHelp")}
          </small>
        </div>
        <div className={s.actions}>
          <button className="primary" type="submit">{saved ? t("replace") : t("save")}</button>
          <button type="button" onClick={clear} disabled={!saved} className="danger-button">{t("clear")}</button>
          <button type="button" onClick={checkConnection} disabled={checking || (!draft.trim() && !saved)}>
            {checking ? t("checking") : t("check")}
          </button>
          {draft.length > 0 && (
            <button type="button" onClick={() => {
              invalidateCheck(false);
              setDraft("");
              setError("");
              setNotice("");
            }}>{t("cancelDraft")}</button>
          )}
          {checking && (
            <button type="button" onClick={() => {
              invalidateCheck(false);
              setError("");
              setNotice(t("checkCancelled"));
            }}>{t("cancelCheck")}</button>
          )}
        </div>
      </form>
      {error && <div className="error" role="alert">{error}</div>}
      {notice && <div className="success" role="status">{notice}</div>}
      {checkedModels && <ModelListDialog providerName={providerName} models={checkedModels} />}
      <p className={s.help}>{t("checkHelp")}</p>
      <a className={s.keyLink} href={config.keyUrl} target="_blank" rel="noreferrer">{t("getKey", { provider: providerName })}</a>
      <p className={s.help}>{t("privacy")}</p>
    </section>
  );
}
