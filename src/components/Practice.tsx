"use client";
import { Link } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useLocaleBlock } from "./LocaleGuard";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { summarize } from "@/lib/session";
import { PracticeRun, type PracticeItem } from "@/lib/practice-run";
import { PracticeTextInput } from "@/lib/practice-text-input";
import {
  getArticleWindow,
  type ArticleGroupSize,
  type ArticlePracticeMode,
} from "@/lib/article-practice";
import type { RomajiDisplayGroup } from "@/lib/romaji";
import { useBrowserAudio } from "./useBrowserAudio";
import { usePracticeViewport } from "./usePracticeViewport";
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
  const [autoPaused, setAutoPaused] = useState(false);
  const { compact, viewportRef } = usePracticeViewport(!run.complete);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [unsupportedInput, setUnsupportedInput] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [textAdapter] = useState(() => new PracticeTextInput());
  const inputRef = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const suppressInput = useRef(false);
  const inputHintId = useId();
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
    setAutoPaused(false);
    audio.stopAll();
    if (!run.complete) {
      run.pause();
      redraw();
    }
  }, [audio, run, redraw]);
  function togglePause() {
    if (!run.paused) return pause();
    setAutoPaused(false);
    if (preferences.keySoundEnabled && preferences.keySoundVolume > 0) void audio.unlock();
    run.resume();
    if (run.listening) listen();
    if (compact) inputRef.current?.focus({ preventScroll: true });
    redraw();
  }
  function focusInput() {
    if (preferences.keySoundEnabled && preferences.keySoundVolume > 0) void audio.unlock();
    const input = inputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    if (!composing.current) input.setSelectionRange(input.value.length, input.value.length);
  }
  function exit() {
    audio.stopAll();
    onExit();
  }
  // Both physical keys and native text input enter the same scoring/audio path.
  const submitText = useCallback((text: string) => {
    setUnsupportedInput(false);
    for (const key of text) {
      if (document.hidden || (run.paused && !autoPaused) || run.complete || run.listening) break;
      if (run.paused) {
        setAutoPaused(false);
        run.resume();
      }
      if (preferences.keySoundEnabled) audio.key(preferences.keySoundVolume, preferences.keySoundType);
      const result = run.input(key);
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
    }
    redraw();
  }, [run, autoPaused, preferences.keySoundEnabled, preferences.keySoundVolume, preferences.keySoundType,
    preferences.kanaSpeechEnabled, audio, mode, articleSpeechEnabled, articleSegmentSpeechEnabled,
    listen, speak, items, advance, redraw]);
  function readText(input: HTMLInputElement, inputType?: string, isComposing = false) {
    const result = textAdapter.read({
      value: input.value,
      inputType,
      isComposing,
      blocked: suppressInput.current || document.hidden || (run.paused && !autoPaused) || run.complete || run.listening,
    });
    if (result.invalid) setUnsupportedInput(true);
    if (result.text) submitText(result.text);
  }
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    // Native beforeinput exposes inputType; React's beforeinput also covers legacy textInput.
    const beforeInput = (event: InputEvent) => {
      if (suppressInput.current || /^(insertFromPaste|insertFromDrop|insertReplacementText|history)/.test(event.inputType)) {
        if (event.cancelable) event.preventDefault();
      }
    };
    input.addEventListener("beforeinput", beforeInput);
    return () => input.removeEventListener("beforeinput", beforeInput);
  }, []);
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
    function pauseOnLeave() {
      // A browser/window shortcut can leave without delivering its keyup here.
      suppressInput.current = false;
      // Repeated blur/hidden events must preserve an existing manual pause.
      if (run.paused || run.complete) return audio.stopAll();
      pause();
      setAutoPaused(true);
    }
    function visibility() {
      if (document.hidden) pauseOnLeave();
    }
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        event.defaultPrevented ||
        document.hidden ||
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
      if (!/^[a-zA-Z'-]$/.test(event.key)) return;
      event.preventDefault();
      submitText(event.key.toLowerCase());
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", pauseOnLeave);
    return () => {
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", pauseOnLeave);
    };
  }, [run, audio, pause, skipListening, submitText]);
  const elapsed = run.timer.elapsed();
  const stats = summarize(run.correct, run.errors, elapsed);
  const correct = run.correct;
  const index = run.index;
  useEffect(() => {
    if ((!continuous && !compact) || !hints.current) return;
    const container = hints.current;
    const follow = () => {
      const caret = container.querySelector<HTMLElement>("i");
      if (caret) revealWithin(container, caret);
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [continuous, compact, correct, index, preferences.showRomaji, preferences.showTranslation]);
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
    ? t(autoPaused && !run.listening ? "stageAutoPaused" : "stagePaused")
    : run.listening
      ? t("stageListening")
      : run.correct === 0
        ? t("stageStart")
        : mode === "kana"
          ? t("stageKana")
          : continuous ? t("stageContinuous") : t("stageSentence");
  return (
    <div
      ref={viewportRef}
      className={`stack ${s.viewport} ${continuous ? s.continuousLayout : ""}`}
      data-mobile-practice={compact ? "" : undefined}
      data-continuous-practice={continuous || undefined}
    >
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
        <div
          className={`${s.stage} ${continuous ? s.continuousStage : ""}`}
          data-practice-stage
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("a,button,input,select,textarea,summary")) return;
            const selection = window.getSelection();
            if (selection && !selection.isCollapsed && selection.anchorNode && event.currentTarget.contains(selection.anchorNode)) return;
            focusInput();
          }}
        >
          <input
            ref={inputRef}
            className={s.textInput}
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-label={t("inputLabel")}
            aria-describedby={inputHintId}
            onInput={(event) => {
              const native = event.nativeEvent as InputEvent;
              readText(event.currentTarget, native.inputType, native.isComposing || composing.current);
            }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionEnd={(event) => {
              composing.current = false;
              readText(event.currentTarget, "insertFromComposition");
            }}
            onPaste={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              suppressInput.current = event.defaultPrevented || event.repeat || event.ctrlKey || event.altKey || event.metaKey;
              if (suppressInput.current) {
                if (event.repeat) event.preventDefault();
                return;
              }
              if (event.nativeEvent.isComposing || composing.current) return;
              if (event.key === "Escape") {
                event.preventDefault();
                pause();
              } else if (event.key === " ") {
                event.preventDefault();
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (run.listening) skipListening();
              }
            }}
            onKeyUp={() => { suppressInput.current = false; }}
            onFocus={() => setInputFocused(true)}
            onBlur={() => {
              suppressInput.current = false;
              setInputFocused(false);
            }}
          />
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
              compact={compact}
            />
          )}
          <div className={continuous || (compact && mode === "article") ? s.continuousHints : undefined} ref={hints}>
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
          <div
            id={inputHintId}
            className={s.feedback}
            role="status"
            data-important={run.lastError || run.paused || run.listening || unsupportedInput || (compact && !inputFocused) || undefined}
          >
            {run.listening
              ? run.paused ? t("feedbackListeningPaused") : t("feedbackListening")
              : run.paused
                ? t(autoPaused ? "feedbackAutoPaused" : "feedbackPaused")
                : unsupportedInput
                  ? t("inputUnsupported")
                  : run.lastError
                    ? t("feedbackError")
                    : compact && !inputFocused
                      ? t("inputHint")
                      : mode === "article"
                        ? continuous ? t("feedbackContinuous") : t("feedbackSentence")
                        : t("feedbackKana")}
          </div>
          {run.listening && (
            <div className={s.listeningActions}>
              <button onClick={() => {
                skipListening();
                if (compact) inputRef.current?.focus({ preventScroll: true });
              }}>{t("skipSpeech")}</button>
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
                    onClick={() => audio.key(preferences.keySoundVolume, preferences.keySoundType)}
                  >
                    {t("retryKeys")}
                  </button>
                )}
                <Link href="/settings/#sound-settings-title" onClick={pause}>{t("soundSettings")}</Link>
              </div>
            </div>
          )}
        </div>
        <details className={s.optionsDisclosure} open={!compact || settingsOpen}>
          <summary onClick={(event) => {
            event.preventDefault();
            setSettingsOpen((open) => !open);
          }}>{t("practiceSettings")}</summary>
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
        </details>
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

function ArticlePassage({ items, index, groups, typedCount, showKana, practiceMode, groupSize, compact }: {
  items: PracticeItem[];
  index: number;
  groups: RomajiDisplayGroup[];
  typedCount: number;
  showKana: boolean;
  practiceMode: ArticlePracticeMode;
  groupSize: ArticleGroupSize;
  compact: boolean;
}) {
  const t = useTranslations("Practice");
  const passage = useRef<HTMLDivElement>(null);
  const continuous = practiceMode !== "sentence";
  const scrollable = continuous || compact;
  const { start, end } = getArticleWindow(items.length, index, practiceMode, groupSize);
  const activeGroup = groups.find((group) => group.remaining.length > 0);
  useEffect(() => {
    const container = passage.current;
    if (!scrollable || !container) return;
    const follow = () => {
      const active = container.querySelector<HTMLElement>('ruby[aria-current="step"]')
        ?? container.querySelector<HTMLElement>('[data-sentence-index][aria-current="step"]');
      if (active) revealWithin(container, active);
    };
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(container);
    return () => observer.disconnect();
  }, [scrollable, index, typedCount, showKana]);
  return (
    <div
      ref={passage}
      className={`${s.sentence} ${scrollable ? s.articlePassage : ""}`}
      lang="ja"
      data-testid="article-passage"
      aria-label={t("passage")}
      tabIndex={scrollable ? 0 : undefined}
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
