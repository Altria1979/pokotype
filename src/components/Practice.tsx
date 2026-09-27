"use client";
import { Link } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLocaleBlock } from "./LocaleGuard";
import { useCallback, useEffect, useRef, useState } from "react";
import { summarize } from "@/lib/session";
import { PracticeRun, type PracticeItem } from "@/lib/practice-run";
import {
  getArticleWindow,
  type ArticleGroupSize,
  type ArticlePracticeMode,
} from "@/lib/article-practice";
import type { RomajiDisplayGroup } from "@/lib/romaji";
import { useBrowserAudio } from "./useBrowserAudio";
import { useData } from "./DataProvider";
import { Icon } from "./Icon";
import { InputRulesHelp } from "./InputRulesHelp";
import s from "./Practice.module.css";
export type { PracticeItem } from "@/lib/practice-run";
export function Practice({
  items,
  mode,
  title,
  onExit,
  articlePracticeMode = "sentence",
  articleGroupSize = 3,
  kanaPracticeMode,
}: {
  items: PracticeItem[];
  mode: "kana" | "article";
  title: string;
  onExit: () => void;
  articlePracticeMode?: ArticlePracticeMode;
  articleGroupSize?: ArticleGroupSize;
  kanaPracticeMode?: "normal" | "weak";
}) {
  const t = useTranslations("Practice");
  const format = useFormatter();
  useLocaleBlock("practice", true);
  const { preferences, updatePreferences, addRecord } = useData();
  const [config] = useState(() => ({ articlePracticeMode, articleGroupSize }));
  const [run] = useState(() => new PracticeRun(items, mode, config.articlePracticeMode));
  const continuous = mode === "article" && config.articlePracticeMode !== "sentence";
  const [sessionSpeech, setSessionSpeech] = useState(() => ({
    sentence: false,
    segment: preferences.articleSegmentSpeechEnabled,
  }));
  const articleSpeechEnabled = continuous ? sessionSpeech.sentence : preferences.articleSpeechEnabled;
  const articleSegmentSpeechEnabled = continuous ? sessionSpeech.segment : preferences.articleSegmentSpeechEnabled;
  const modeLabel = t(({ sentence: "modeSentence", group: "modeGroup", full: "modeFull" } as const)[config.articlePracticeMode]);
  const hints = useRef<HTMLDivElement>(null);
  const { audio, notice, keyNotice, clearNotice } = useBrowserAudio();
  const [, refresh] = useState(0);
  const redraw = useCallback(() => refresh((v) => v + 1), []);
  const advance = useCallback((expectedIndex: number) => {
    if (!run.advance(expectedIndex)) return;
    if (run.complete) {
      void addRecord({
        id: crypto.randomUUID(),
        mode,
        title,
        ...(mode === "kana" && kanaPracticeMode ? { kanaPracticeMode } : {}),
        ...(mode === "article" ? {
          articlePracticeMode: config.articlePracticeMode,
          ...(config.articlePracticeMode === "group" ? { articleGroupSize: config.articleGroupSize } : {}),
        } : {}),
        completedAt: new Date().toISOString(),
        correct: run.correct,
        errors: run.errors,
        durationMs: run.timer.elapsed(),
        weakItems: [...run.weak],
      }, run.deltas);
    }
    redraw();
  }, [run, mode, title, kanaPracticeMode, config, addRecord, redraw]);
  const speak = useCallback((text: string, done?: () => void) => {
    clearNotice();
    audio.speak(text, {
      voiceURI: preferences.speechVoiceURI,
      rate: preferences.speechRate,
      pitch: preferences.speechPitch,
      volume: preferences.speechVolume,
    }, done);
  }, [audio, clearNotice, preferences.speechVoiceURI, preferences.speechRate, preferences.speechPitch, preferences.speechVolume]);
  const listen = useCallback(() => {
    const index = run.index;
    run.beginListening();
    speak(items[index].text, () => {
      if (!run.paused && run.listening) advance(index);
    });
  }, [run, speak, items, advance]);
  const skipListening = useCallback(() => {
    if (!run.listening || run.complete) return;
    audio.stopSpeech();
    advance(run.index);
  }, [run, audio, advance]);
  const pause = useCallback(() => {
    audio.stopAll();
    if (!run.complete) {
      run.pause();
      redraw();
    }
  }, [audio, run, redraw]);
  function togglePause() {
    if (!run.paused) return pause();
    if (preferences.keySoundEnabled && preferences.keySoundVolume > 0) void audio.unlock();
    run.resume();
    if (run.listening) listen();
    redraw();
  }
  function exit() {
    audio.stopAll();
    onExit();
  }
  useEffect(() => {
    if (continuous) window.scrollTo({ top: 0, behavior: "instant" });
  }, [continuous]);
  useEffect(() => {
    const interval = setInterval(() => {
      if (!run.paused && !run.complete && !run.listening) redraw();
    }, 250);
    return () => {
      clearInterval(interval);
      run.timer.pause();
    };
  }, [run, redraw]);
  useEffect(() => {
    if (!preferences.keySoundEnabled || preferences.keySoundVolume === 0) audio.stopKeys();
    const speechEnabled = mode === "kana"
      ? preferences.kanaSpeechEnabled
      : run.listening ? articleSpeechEnabled : articleSegmentSpeechEnabled;
    if (!speechEnabled) {
      audio.stopSpeech();
      if (run.listening) {
        // Schedule outside the effect body; a cleanup cancels stale transitions.
        const pending = setTimeout(() => advance(run.index), 0);
        return () => clearTimeout(pending);
      }
    }
  }, [audio, mode, preferences.keySoundEnabled, preferences.keySoundVolume, preferences.kanaSpeechEnabled,
    articleSpeechEnabled, articleSegmentSpeechEnabled, run, advance]);
  useEffect(() => {
    function visibility() {
      if (document.hidden) pause();
    }
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.repeat ||
        target.closest(
          'input:not([type="checkbox"]):not([type="radio"]),textarea,select,dialog,[contenteditable="true"]',
        )
      ) return;
      if (event.key === "Escape") {
        pause();
        return;
      }
      if (run.listening && event.key === "Enter") {
        event.preventDefault();
        skipListening();
        return;
      }
      if (
        run.paused || run.complete || run.listening ||
        window.matchMedia("(max-width: 700px)").matches ||
        !/^[a-zA-Z'-]$/.test(event.key)
      ) return;
      event.preventDefault();
      if (preferences.keySoundEnabled) audio.key(preferences.keySoundVolume);
      const result = run.input(event.key.toLowerCase());
      if (result === "completed") {
        if (mode === "article" && articleSpeechEnabled) {
          listen();
        } else {
          if (mode === "kana" && preferences.kanaSpeechEnabled)
            speak(items[run.index].text);
          else if (mode === "article" && articleSegmentSpeechEnabled && run.completedGroupText)
            speak(run.completedGroupText);
          advance(run.index);
        }
      } else if (result === "progress" && articleSegmentSpeechEnabled && run.completedGroupText) {
        speak(run.completedGroupText);
      }
      redraw();
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pause);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pause);
    };
  }, [run, items, mode, audio, preferences.keySoundEnabled, preferences.keySoundVolume,
    articleSpeechEnabled, articleSegmentSpeechEnabled, preferences.kanaSpeechEnabled,
    advance, listen, pause, redraw, skipListening, speak]);
  const elapsed = run.timer.elapsed();
  const stats = summarize(run.correct, run.errors, elapsed);
  const correct = run.correct;
  const index = run.index;
  useEffect(() => {
    if (!continuous || !hints.current) return;
    const container = hints.current;
    const follow = () => {
      const caret = container.querySelector<HTMLElement>("i");
      if (caret) revealWithin(container, caret);
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [continuous, correct, index, preferences.showRomaji, preferences.showTranslation]);
  if (run.complete)
    return (
      <section className={`panel ${s.result}`}>
        <div className={s.resultIcon}>
          <Icon name="check" size={34} />
        </div>
        <div className="eyebrow">{t("completeEyebrow")}</div>
        <h1>{t("completeTitle")}</h1>
        <p className="subtitle">
          {t(mode === "kana" ? "completeKana" : "completeArticle", { title, count: items.length })}
        </p>
        {mode === "article" && <p className="pill">{modeLabel}{config.articlePracticeMode === "group" && ` · ${t("groupSize", { count: config.articleGroupSize })}`}</p>}
        <div className={s.resultStats}>
          <div>
            <strong>{format.number(Math.round(stats.cpm))}</strong>
            <span>{t("cpm")}</span>
          </div>
          <div>
            <strong>
              {format.number(stats.accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              <small>%</small>
            </strong>
            <span>{t("accuracy")}</span>
          </div>
          <div>
            <strong>
              {format.number(Math.round(elapsed / 1000))}
              <small>{t("secondAbbreviation")}</small>
            </strong>
            <span>{t("duration")}</span>
          </div>
        </div>
        {run.weak.size > 0 && (
          <p className="notice">
            {t("weakItems", { items: format.list([...run.weak].slice(0, 8), { type: "conjunction" }) })}
          </p>
        )}
        <button className="primary" onClick={exit}>
          {t("returnSettings")} <Icon name="arrow" />
        </button>
      </section>
    );
  const item = items[run.index];
  const fraction = (run.index + run.matcher.progress) / items.length;
  const groups = item.sentence
    ? run.matcher.getDisplayGroups(
        item.sentence.segments.map((seg) => seg.reading),
      )
    : [];
  const activeGroup = groups.find((group) => group.remaining.length > 0);
  const keySoundMuted = preferences.keySoundEnabled && preferences.keySoundVolume === 0;
  const stageLabel = run.paused
    ? t("stagePaused")
    : run.listening
      ? t("stageListening")
      : run.correct === 0
        ? t("stageStart")
        : mode === "kana"
          ? t("stageKana")
          : continuous ? t("stageContinuous") : t("stageSentence");
  return (
    <div
      className={`stack ${continuous ? s.continuousLayout : ""}`}
      data-continuous-practice={continuous || undefined}
    >
      <div className="mobile-notice">
        {t("mobileNotice")}
      </div>
      <section className={`panel ${s.practice}`}>
        <div className={s.toolbar}>
          <span>
            <span className="pill">
              {mode === "kana" ? t("kanaPractice") : modeLabel}
            </span>{" "}
            <span className="muted">
              {t("progress", { current: run.index + 1, total: items.length })}
              {config.articlePracticeMode === "group" && mode === "article" && t("groupProgress", { current: Math.floor(run.index / config.articleGroupSize) + 1, total: Math.ceil(items.length / config.articleGroupSize) })}
            </span>
          </span>
          {continuous && <div className={s.toolbarStatus}>{stageLabel}</div>}
          <div className="flex">
            <InputRulesHelp
              onOpen={pause}
            />
            <button onClick={togglePause}>
              {run.paused ? t("resume") : t("pause")}
            </button>
            <button onClick={exit}>{t("exit")}</button>
          </div>
        </div>
        <div className={s.progress}>
          <span style={{ width: `${fraction * 100}%` }} />
        </div>
        <div className={`${s.stage} ${continuous ? s.continuousStage : ""}`}>
          {!continuous && <div className={s.stageLabel}>{stageLabel}</div>}
          {mode === "kana" ? (
            <div className={s.kana} lang="ja">
              {item.text}
            </div>
          ) : (
            <ArticlePassage
              items={items}
              index={run.index}
              groups={groups}
              typedCount={run.correct}
              showKana={preferences.showKana}
              practiceMode={config.articlePracticeMode}
              groupSize={config.articleGroupSize}
            />
          )}
          <div className={continuous ? s.continuousHints : undefined} ref={hints}>
          {preferences.showTranslation && item.sentence && (
            <p className={s.translation}>{item.sentence.translation}</p>
          )}
          <div
            className={`${s.romaji} ${item.sentence ? s.groupedRomaji : ""} ${run.lastError ? s.wrong : ""}`}
            aria-label={t("inputProgress")}
            data-practice-input
          >
            {item.sentence ? (
              groups
                .filter((group) => group.typed || group.remaining)
                .map((group) => (
                  <span
                    key={group.startSegment}
                    className={s.romajiGroup}
                    data-romaji-group={group.startSegment}
                    aria-current={group === activeGroup ? "step" : undefined}
                  >
                    <span className={s.typed} data-romaji-typed>
                      {group.typed}
                    </span>
                    {group === activeGroup && <i aria-hidden="true" />}
                    {group.remaining && (
                      <span className={s.pending} data-romaji-pending>
                        {preferences.showRomaji ? group.remaining : "···"}
                      </span>
                    )}
                  </span>
                ))
            ) : (
              <>
                <span className={s.typed} data-romaji-typed>
                  {run.matcher.typed}
                </span>
                <i aria-hidden="true" />
                <span className={s.pending} data-romaji-pending>
                  {preferences.showRomaji ? run.matcher.remaining : "···"}
                </span>
              </>
            )}
          </div>
          </div>
          <div className={s.feedback} role="status">
            {run.listening
              ? run.paused ? t("feedbackListeningPaused") : t("feedbackListening")
              : run.lastError
              ? t("feedbackError")
              : run.paused
                ? t("feedbackPaused")
                : mode === "article"
                  ? continuous ? t("feedbackContinuous") : t("feedbackSentence")
                  : t("feedbackKana")}
          </div>
          {run.listening && (
            <div className={s.listeningActions}>
              <button onClick={skipListening}>{t("skipSpeech")}</button>
              <span>{t("listeningTime")}</span>
            </div>
          )}
          {notice && <p className={s.audioNotice} aria-live="polite">{notice}</p>}
          {(keyNotice || keySoundMuted) && (
            <div className={s.audioNotice}>
              {keySoundMuted && <p role="status">{t("mutedKeys")}</p>}
              {keyNotice && <p role="status">{keyNotice}</p>}
              <div className={s.listeningActions}>
                {keyNotice && (
                  <button
                    type="button"
                    disabled={!preferences.keySoundEnabled || preferences.keySoundVolume === 0}
                    onClick={() => audio.key(preferences.keySoundVolume)}
                  >
                    {t("retryKeys")}
                  </button>
                )}
                <Link href="/settings/#sound-settings-title" onClick={pause}>{t("soundSettings")}</Link>
              </div>
            </div>
          )}
        </div>
        <div className={s.options}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={preferences.showRomaji}
              onChange={(e) =>
                updatePreferences({ showRomaji: e.target.checked })
              }
            />
            {t("romajiHints")}
          </label>
          {mode === "article" && (
            <>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={preferences.showKana}
                  onChange={(e) =>
                    updatePreferences({ showKana: e.target.checked })
                  }
                />
                {t("kanaReadings")}
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={preferences.showTranslation}
                  onChange={(e) =>
                    updatePreferences({ showTranslation: e.target.checked })
                  }
                />
                {t("chineseTranslation")}
              </label>
            </>
          )}
          <label className="check-label">
            <input type="checkbox" checked={preferences.keySoundEnabled}
              onChange={(event) => {
                if (!event.target.checked) audio.stopKeys();
                else if (preferences.keySoundVolume > 0) void audio.unlock();
                updatePreferences({ keySoundEnabled: event.target.checked });
              }} />
            {t("keySounds")}
          </label>
          {mode === "article" && (
            <label className="check-label">
              <input type="checkbox" checked={articleSegmentSpeechEnabled}
                onChange={(event) => {
                  if (!event.target.checked && !run.listening) audio.stopSpeech();
                  if (continuous) setSessionSpeech((current) => ({ ...current, segment: event.target.checked }));
                  else updatePreferences({ articleSegmentSpeechEnabled: event.target.checked });
                }} />
              {t("segmentSpeech")}
            </label>
          )}
          <label className="check-label">
            <input type="checkbox"
              checked={mode === "kana" ? preferences.kanaSpeechEnabled : articleSpeechEnabled}
              onChange={(event) => {
                if (!event.target.checked && (mode === "kana" || run.listening)) {
                  audio.stopSpeech();
                  if (run.listening) skipListening();
                }
                if (mode === "kana") updatePreferences({ kanaSpeechEnabled: event.target.checked });
                else if (continuous) setSessionSpeech((current) => ({ ...current, sentence: event.target.checked }));
                else updatePreferences({ articleSpeechEnabled: event.target.checked });
              }} />
            {mode === "kana" ? t("kanaSpeech") : t("sentenceSpeech")}
          </label>
          <span className="muted">{t("escapePause")}</span>
        </div>
      </section>
      <div className={s.liveStats} aria-label={t("statistics")}>
        <span>
          <Icon name="clock" />
          {format.number(Math.floor(elapsed / 1000))} <small>{t("secondsUnit", { count: Math.floor(elapsed / 1000) })}</small>
        </span>
        <span>
          <Icon name="target" />
          {format.number(stats.accuracy, { maximumFractionDigits: 0 })}
          <small>{t("accuracySuffix")}</small>
        </span>
        <span>
          <Icon name="keyboard" />
          {format.number(Math.round(stats.cpm))}
          <small>{t("cpm")}</small>
        </span>
      </div>
      {mode === "kana" && (
        <Keyboard
          nextKeys={
            preferences.showRomaji && !run.paused ? run.matcher.nextKeys : []
          }
        />
      )}
    </div>
  );
}

/** Move only this scroll area, and only when the target has left its viewport. */
function revealWithin(container: HTMLElement, target: HTMLElement) {
  const viewport = container.getBoundingClientRect();
  const rect = target.getClientRects()[0];
  if (!rect) return;
  const inset = 12;
  if (rect.top < viewport.top + inset) {
    container.scrollTop += rect.top - viewport.top - inset;
  } else if (rect.bottom > viewport.bottom - inset) {
    const offset = rect.height > container.clientHeight - inset * 2
      ? rect.top - viewport.top - inset
      : rect.bottom - viewport.bottom + inset;
    container.scrollTop += offset;
  }
}

function ArticlePassage({ items, index, groups, typedCount, showKana, practiceMode, groupSize }: {
  items: PracticeItem[];
  index: number;
  groups: RomajiDisplayGroup[];
  typedCount: number;
  showKana: boolean;
  practiceMode: ArticlePracticeMode;
  groupSize: ArticleGroupSize;
}) {
  const t = useTranslations("Practice");
  const passage = useRef<HTMLDivElement>(null);
  const continuous = practiceMode !== "sentence";
  const { start, end } = getArticleWindow(items.length, index, practiceMode, groupSize);
  const activeGroup = groups.find((group) => group.remaining.length > 0);
  useEffect(() => {
    const container = passage.current;
    if (!continuous || !container) return;
    const follow = () => {
      const active = container.querySelector<HTMLElement>('ruby[aria-current="step"]')
        ?? container.querySelector<HTMLElement>('[data-sentence-index][aria-current="step"]');
      if (active) revealWithin(container, active);
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [continuous, index, typedCount, showKana]);
  return (
    <div
      ref={passage}
      className={`${s.sentence} ${continuous ? s.articlePassage : ""}`}
      lang="ja"
      data-testid="article-passage"
      aria-label={t("passage")}
      tabIndex={continuous ? 0 : undefined}
    >
      {items.slice(start, end).map((item, offset) => {
        const sentenceIndex = start + offset;
        const current = sentenceIndex === index;
        const completed = sentenceIndex < index;
        return (
          <span
            key={sentenceIndex}
            data-sentence-index={sentenceIndex}
            data-state={completed ? "completed" : current ? "current" : "pending"}
            aria-current={current ? "step" : undefined}
            className={completed ? s.completedSentence : current ? s.currentSentence : s.pendingSentence}
          >
            {item.sentence?.segments.map((segment, segmentIndex) => (
              <ruby
                key={segmentIndex}
                className={current && groups.some((group) =>
                  segmentIndex >= group.startSegment && segmentIndex < group.endSegment &&
                  group.typed && !group.remaining) ? s.completedSegment : undefined}
                aria-current={current && activeGroup && segmentIndex >= activeGroup.startSegment &&
                  segmentIndex < activeGroup.endSegment ? "step" : undefined}
              >
                {segment.text}
                {showKana && <rt>{segment.reading}</rt>}
              </ruby>
            )) ?? item.text}
          </span>
        );
      })}
    </div>
  );
}

export function Keyboard({ nextKeys }: { nextKeys: string[] }) {
  const t = useTranslations("Practice");
  return (
    <div className={s.keyboard} aria-label={t("keyboardHints")}>
      {["qwertyuiop", "asdfghjkl", "zxcvbnm"].map((row) => (
        <div key={row}>
          {[...row].map((key) => (
            <span key={key} className={nextKeys.includes(key) ? s.nextKey : ""}>
              {key.toUpperCase()}
            </span>
          ))}
        </div>
      ))}
      <div>
        <span className={s.space}>{t("spaceKey")}</span>
      </div>
    </div>
  );
}
