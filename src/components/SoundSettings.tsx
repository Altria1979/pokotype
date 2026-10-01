"use client";

import { useEffect } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { Preferences } from "@/lib/storage";
import { useData } from "./DataProvider";
import { useBrowserAudio } from "./useBrowserAudio";
import s from "./Preferences.module.css";

export function SoundSettings() {
  const t = useTranslations("Sound");
  const format = useFormatter();
  const { preferences, updatePreferences, ready } = useData();
  const { audio, voices, notice, keyNotice, clearNotice } = useBrowserAudio();
  const japaneseVoices = voices.filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang));
  const missingVoice = !!preferences.speechVoiceURI && !japaneseVoices.some(
    (voice) => voice.voiceURI === preferences.speechVoiceURI,
  );

  useEffect(() => {
    const stop = () => audio.stopAll();
    const onVisibility = () => {
      if (document.hidden) stop();
    };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [audio]);

  return (
    <section className={`panel pad ${s.sound}`} aria-labelledby="sound-settings-title">
      <h2 id="sound-settings-title">{t("title")}</h2>
      <p className={`subtitle ${s.intro}`}>
        {t("intro")}
      </p>
      <div className={s.soundGrid}>
        <div className={s.preferences}>
          {(["keySoundEnabled", "kanaSpeechEnabled", "articleSegmentSpeechEnabled", "articleSpeechEnabled"] as const).map((field) => (
            <label key={field} className={s.preference}>
              <span>
                <strong>{t(field)}</strong>
                <small>{t(`${field}Help`)}</small>
              </span>
              <input
                type="checkbox"
                aria-label={t(field)}
                checked={preferences[field]}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  if (!enabled) {
                    if (field === "keySoundEnabled") {
                      audio.stopKeys();
                    }
                    else audio.stopSpeech();
                  } else if (field === "keySoundEnabled" && preferences.keySoundVolume > 0) {
                    void audio.unlock();
                  }
                  updatePreferences({ [field]: enabled });
                }}
              />
            </label>
          ))}
        </div>
        <div>
          <div className="field">
            <label htmlFor="keySoundType">{t("keySoundType")}</label>
            <select
              id="keySoundType"
              value={preferences.keySoundType}
              disabled={!ready}
              aria-describedby="key-sound-type-help"
              onChange={(event) => {
                audio.stopKeys();
                updatePreferences({ keySoundType: event.target.value as Preferences["keySoundType"] });
              }}
            >
              <option value="percussive">{t("keySoundTypes.percussive")}</option>
              <option value="electronic">{t("keySoundTypes.electronic")}</option>
            </select>
            <small id="key-sound-type-help">{t("keySoundTypeHelp")}</small>
          </div>
          {(["keySoundVolume", "speechVolume"] as const).map((field) => (
            <div className="field" key={field}>
              <label htmlFor={field}>{t(field)}</label>
              <div className={s.volume}>
                <input
                  id={field}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={preferences[field]}
                  aria-valuetext={format.number(preferences[field], { style: "percent" })}
                  onChange={(event) => {
                    const volume = Number(event.target.value);
                    if (field === "keySoundVolume" && volume === 0) audio.stopKeys();
                    updatePreferences({ [field]: volume });
                  }}
                />
                <output htmlFor={field}>{format.number(preferences[field], { style: "percent" })}</output>
              </div>
              {field === "keySoundVolume" && preferences.keySoundVolume === 0 && (
                <small role="status">{t("mutedHelp")}</small>
              )}
            </div>
          ))}
          <div className="field">
            <label htmlFor="speechVoiceURI">{t("voice")}</label>
            <select
              id="speechVoiceURI"
              value={preferences.speechVoiceURI}
              aria-describedby="voice-help"
              onChange={(event) => {
                audio.stopSpeech();
                clearNotice();
                updatePreferences({ speechVoiceURI: event.target.value });
              }}
            >
              <option value="">{t("automaticVoice")}</option>
              {missingVoice && <option value={preferences.speechVoiceURI}>{t("savedVoice")}</option>}
              {japaneseVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} · {voice.localService ? t("localVoice") : t("onlineVoice")}
                </option>
              ))}
            </select>
            <small id="voice-help">
              {missingVoice
                ? t("missingVoiceHelp")
                : t("voiceHelp")}
            </small>
          </div>
          <div className="field">
            <label htmlFor="speechRate">{t("rate")}</label>
            <select
              id="speechRate"
              value={preferences.speechRate}
              onChange={(event) => {
                audio.stopSpeech();
                updatePreferences({ speechRate: Number(event.target.value) as Preferences["speechRate"] });
              }}
            >
              <option value="0.8">{t("slow")}</option>
              <option value="1">{t("normal")}</option>
              <option value="1.2">{t("fast")}</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="speechPitch">{t("pitch")}</label>
            <select
              id="speechPitch"
              value={preferences.speechPitch}
              onChange={(event) => {
                audio.stopSpeech();
                updatePreferences({ speechPitch: Number(event.target.value) as Preferences["speechPitch"] });
              }}
            >
              <option value="1">{t("natural")}</option>
              <option value="1.15">{t("bright")}</option>
            </select>
            <small>{t("pitchHelp")}</small>
          </div>
          <div className="flex wrap">
            <button type="button" onClick={() => audio.key(preferences.keySoundVolume, preferences.keySoundType)}>{t("previewKey")}</button>
            <button type="button" onClick={() => {
              clearNotice();
              audio.speak("こんにちは。日本語の練習を始めましょう。", {
                voiceURI: preferences.speechVoiceURI,
                rate: preferences.speechRate,
                pitch: preferences.speechPitch,
                volume: preferences.speechVolume,
              });
            }}>{t("previewSpeech")}</button>
            <button type="button" onClick={() => audio.stopAll()}>{t("stop")}</button>
          </div>
          <p className={s.previewHelp}>{t("previewHelp")}</p>
          {notice && <div className="notice" role="status">{notice}</div>}
          {keyNotice && (
            <div className="notice">
              <p role="status">{keyNotice}</p>
              <button
                type="button"
                disabled={preferences.keySoundVolume === 0}
                onClick={() => audio.key(preferences.keySoundVolume, preferences.keySoundType)}
              >
                {t("retryKey")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
