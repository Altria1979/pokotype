"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useLocaleBlock } from "./LocaleGuard";
import {
  loadAiSettings,
  saveAiSettings,
  AI_SETTINGS_KEY,
  AI_SETTINGS_EVENT,
} from "@/lib/storage";
import {
  defaultAiSettings,
  isValidModelId,
  type AiSettings,
} from "@/lib/ai-models";
import { AiModelFields } from "./AiModelFields";
import { ApiKeyCard } from "./ApiKeyCard";
import ai from "./AiSettings.module.css";
import { useData } from "./DataProvider";
import { Icon } from "./Icon";
import { PaperArt } from "./PaperArt";
import { SoundSettings } from "./SoundSettings";
import s from "./Preferences.module.css";
export function Settings() {
  const t = useTranslations("Settings");
  const { preferences, updatePreferences } = useData();
  const [aiSettings, setAiSettings] = useState(defaultAiSettings);
  const [modelError, setModelError] = useState("");
  const [modelDirty, setModelDirty] = useState(false);
  const modelDraft = useRef(false);
  const savedSettings = useRef(defaultAiSettings());
  useLocaleBlock("settings", modelDirty);
  useEffect(() => {
    let active = true;
    function refreshSettings() {
      try {
        const settings = loadAiSettings();
        savedSettings.current = settings;
        if (!modelDraft.current) {
          setAiSettings(settings);
          setModelError("");
        }
      } catch {
        setModelError("readError");
      }
    }
    function onStorage(event: StorageEvent) {
      if (event.key === AI_SETTINGS_KEY || event.key === null) refreshSettings();
    }
    void Promise.resolve().then(() => {
      if (active) refreshSettings();
    });
    window.addEventListener("storage", onStorage);
    window.addEventListener(AI_SETTINGS_EVENT, refreshSettings);
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(AI_SETTINGS_EVENT, refreshSettings);
    };
  }, []);
  function changeAiSettings(next: AiSettings) {
    setAiSettings(next);
    setModelError("");
    modelDraft.current = true;
    setModelDirty(true);
    if (!Object.values(next.models).every(isValidModelId)) {
      setModelError("invalidModel");
      return;
    }
    try {
      saveAiSettings(next);
      savedSettings.current = next;
      modelDraft.current = false;
      setModelDirty(false);
    } catch {
      setModelError("saveError");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1>{t("title")}</h1>
          <p className="subtitle">{t("subtitle")}</p>
        </div>
        <div className={s.art}>
          <PaperArt />
        </div>
      </div>
      <div className={s.grid}>
        <section className={`panel pad ${ai.panel}`}>
          <h2 className="flex"><Icon name="key" />{t("aiTitle")}</h2>
          <p className={`subtitle ${s.intro}`}>
            {t("aiIntro")}
          </p>
          <p className="notice">
            {t.rich("help", { contact: (chunks) => <strong>{chunks}</strong> })}
          </p>
          <div className={ai.credentials}>
            <ApiKeyCard provider="deepseek" />
            <ApiKeyCard provider="bailian" />
          </div>
          <div className={ai.selection}>
            <AiModelFields value={aiSettings} onChange={changeAiSettings} idPrefix="settings-ai" />
          </div>
          {modelError && <div className="error" role="alert">{t(modelError)}</div>}
          {modelDirty && (
            <div className="flex wrap">
              <button type="button" onClick={() => changeAiSettings(aiSettings)}>{t("retrySave")}</button>
              <button type="button" onClick={() => {
                setAiSettings(savedSettings.current);
                modelDraft.current = false;
                setModelDirty(false);
                setModelError("");
              }}>{t("cancelDraft")}</button>
            </div>
          )}
        </section>
        <section className="panel pad">
          <h2>{t("preferences")}</h2>
          <div className={s.preferences}>
            {(["showRomaji", "showKana", "showTranslation"] as const).map((field) => (
              <label key={field} className={s.preference}>
                <span>
                  <strong>{t(field)}</strong>
                  <small>{t(`${field}Help`)}</small>
                </span>
                <input
                  type="checkbox"
                  checked={preferences[field]}
                  onChange={(e) =>
                    updatePreferences({ [field]: e.target.checked })
                  }
                />
              </label>
            ))}
          </div>
        </section>
        <SoundSettings />
        <section className="notice">
          <strong>{t("dataTitle")}</strong>
          <br />
          {t("dataHelp")}
        </section>
      </div>
    </>
  );
}
