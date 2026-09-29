"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import { KANA_GROUPS, makeKanaQueue, toKatakana } from "@/lib/kana";
import { getKanaRomaji } from "@/lib/romaji";
import { useData } from "./DataProvider";
import { Icon } from "./Icon";
import { InputRulesHelp } from "./InputRulesHelp";
import { PaperArt } from "./PaperArt";
import { Generate } from "./Generate";
import s from "./KanaPractice.module.css";
export function KanaPractice() {
  const t = useTranslations("Kana");
  const format = useFormatter();
  const categoryKeys = { "清音": "categoryPlain", "浊音": "categoryVoiced", "半浊音": "categorySemiVoiced", "拗音": "categoryContracted" } as const;
  const categoryLabel = (name: keyof typeof categoryKeys) => t(categoryKeys[name]);
  const {
    ready, preferences, updatePreferences, stats, records,
    startKanaSession, restoreKanaFocus, acknowledgeKanaReturn,
  } = useData();
  const rowLabel = (group: (typeof KANA_GROUPS)[number]) => {
    const kana = preferences.script === "katakana" ? toKatakana(group.kana[0]) : group.kana[0];
    return group.id === "wa"
      ? t("waRow", { kana, n: preferences.script === "katakana" ? "ン" : "ん" })
      : t("row", { kana });
  };
  const router = useRouter();
  const startButton = useRef<HTMLButtonElement>(null);
  const rangeButton = useRef<HTMLButtonElement>(null);
  const rangeHeading = useRef<HTMLHeadingElement>(null);
  const [starting, startTransition] = useTransition();
  const [message, setMessage] = useState<"emptyRange" | "noWeakHistory" | "">("");
  const categories = [...new Set(KANA_GROUPS.map((g) => g.category))];
  const selected = preferences.groupIds;
  const pool = KANA_GROUPS.filter((g) => selected.includes(g.id))
    .flatMap((g) => g.kana)
    .map((k) => (preferences.script === "katakana" ? toKatakana(k) : k));
  const categorySummary = format.list(categories
    .flatMap((name) => {
      const categoryGroups = KANA_GROUPS.filter((g) => g.category === name);
      const count = categoryGroups.filter((g) =>
        selected.includes(g.id),
      ).length;
      return count
        ? [count === categoryGroups.length ? categoryLabel(name) : t("partialCategory", { category: categoryLabel(name) })]
        : [];
    }), { type: "conjunction" });
  useEffect(() => {
    if (!ready || !restoreKanaFocus) return;
    const frame = requestAnimationFrame(() => {
      const target =
        startButton.current &&
        !startButton.current.disabled
          ? startButton.current
          : rangeButton.current;
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "nearest", behavior: "instant" });
      acknowledgeKanaReturn();
    });
    return () => cancelAnimationFrame(frame);
  }, [ready, restoreKanaFocus, acknowledgeKanaReturn]);
  function returnToStart() {
    const target =
      startButton.current &&
      !startButton.current.disabled
        ? startButton.current
        : rangeButton.current;
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }
  function showRange() {
    rangeHeading.current?.focus({ preventScroll: true });
    rangeHeading.current?.scrollIntoView({
      block: "start",
      behavior: "instant",
    });
  }
  const seen = Object.values(stats).filter((v) => v.seen > 0).length;
  const totalMinutes = Math.round(
    records.reduce((n, r) => n + r.durationMs, 0) / 60000,
  );
  function toggle(id: string) {
    updatePreferences({
      groupIds: selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
    });
  }
  function start(weak: boolean) {
    setMessage("");
    if (!ready || starting) return;
    const queue = makeKanaQueue(
      pool,
      preferences.count,
      weak ? stats : undefined,
    );
    if (!queue.length) {
      setMessage(
        weak
          ? "noWeakHistory"
          : "emptyRange",
      );
      return;
    }
    startTransition(() => {
      const id = startKanaSession(
        queue.map((k) => ({ text: k, reading: k, statKey: k })), weak,
      );
      router.push(`/practice/?session=${id}`);
    });
  }
  return (
    <>
      <section className={s.launch} aria-labelledby="kana-title">
        <a
          className={s.productHuntBadge}
          href="https://www.producthunt.com/products/pokotype?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-pokotype"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1262500&theme=light&t=1790513535293"
            alt="Pokotype - Practice Japanese typing, from kana to full articles | Product Hunt"
            width={250}
            height={54}
            unoptimized
            loading="eager"
          />
        </a>
        <div className={s.launchIntro}>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1 id="kana-title">{t("title")}</h1>
          <p className="subtitle">{t("subtitle")}</p>
          <div className={s.previewCard}>
            <div className={s.bigKana} lang="ja">
              {preferences.script === "hiragana" ? "あ" : "ア"}
            </div>
            <span className={s.previewArrow} aria-hidden="true">
              →
            </span>
            <div>
              <span className={s.previewLabel}>
                {t(preferences.script)} · {t("romajiInput")}
              </span>
              <div className={s.exampleRomaji}>
                <span>a</span>
                <i />
              </div>
              <p>{t("previewSteps")}</p>
            </div>
          </div>
        </div>
        <div className={s.launchSetup}>
          <div
            role="region"
            className={s.summary}
            aria-label={t("currentRange")}
            aria-live="polite"
          >
            {ready
              ? t("rangeSummary", { script: t(preferences.script), categories: categorySummary || t("noRange"), count: pool.length })
              : t("loadingPreferences")}
          </div>
          <div className={s.quickSettings}>
            <div className={s.questionCount}>
              <span>{t("questionCount")}</span>
              <div className={s.countToggle}>
                {([20, 50] as const).map((n) => (
                  <button
                    key={n}
                    disabled={!ready}
                    aria-pressed={preferences.count === n}
                    className={preferences.count === n ? s.countActive : ""}
                    onClick={() => updatePreferences({ count: n })}
                  >
                    {t("questions", { count: n })}
                  </button>
                ))}
              </div>
            </div>
            <label className={s.hint}>
              <input
                type="checkbox"
                disabled={!ready}
                checked={preferences.showRomaji}
                onChange={(e) =>
                  updatePreferences({ showRomaji: e.target.checked })
                }
              />
              {t("showRomaji")}
            </label>
          </div>
          {ready && pool.length === 0 && (
            <p className={s.emptyRange} id="empty-range" role="status">
              {t("emptyRange")}
            </p>
          )}
          {message && (
            <div className="error" role="alert">
              {t(message)}
            </div>
          )}
          <div className={s.actions}>
            <button
              ref={startButton}
              className={`primary ${s.start}`}
              disabled={!ready || starting || pool.length === 0}
              aria-describedby={
                ready && pool.length === 0 ? "empty-range" : undefined
              }
              onClick={() => start(false)}
            >
              <Icon name="play" size={22} />
              {ready ? (
                <>
                  {t("start")}<span>{t("questions", { count: preferences.count })}</span>
                </>
              ) : (
                t("loadingSettings")
              )}
            </button>
          </div>
          <div className={s.helpRow}>
            <button
              className={s.weak}
              disabled={!ready || starting || pool.length === 0}
              onClick={() => start(true)}
            >
              <Icon name="target" size={16} />
              {t("weakPractice")}
            </button>
            <p className={s.helper}>{t("keyboardHint")}</p>
            <InputRulesHelp />
            <button ref={rangeButton} disabled={!ready} onClick={showRange}>
              {t("adjustRange")} <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
        <div className={s.art}>
          <PaperArt />
        </div>
      </section>
      <section className={`panel ${s.range}`} aria-label={t("rangeSettings")}>
        <div className={s.rangeHeader}>
          <h2 ref={rangeHeading} tabIndex={-1}>
            {t("selectRange")}
          </h2>
          <span className={s.step}>{t("setupStep")}</span>
        </div>
        <div
          className={`${s.segmented} ${s.rangeScript}`}
          aria-label={t("scriptType")}
        >
          {(
            [
              ["hiragana", t("hiragana"), "あ"],
              ["katakana", t("katakana"), "ア"],
            ] as const
          ).map(([value, label, k]) => (
            <button
              key={value}
              disabled={!ready}
              aria-pressed={preferences.script === value}
              className={preferences.script === value ? s.selected : ""}
              onClick={() => updatePreferences({ script: value })}
            >
              <b>{k}</b>
              {label}
            </button>
          ))}
        </div>

        <div className={s.selection}>
          <p className={s.selectionHint}>{t("selectRows")}</p>
          {categories.map((category) => {
            const groups = KANA_GROUPS.filter((g) => g.category === category);
            const ids = groups.map((g) => g.id);
            const allSelected = ids.every((id) => selected.includes(id));
            const headingId = `kana-${categoryKeys[category]}`;
            return (
              <section
                key={category}
                className={s.category}
                aria-labelledby={headingId}
              >
                <div className={s.selectHeader}>
                  <h3 id={headingId}>{categoryLabel(category)}</h3>
                  <button
                    className="text-button"
                    disabled={!ready}
                    onClick={() => updatePreferences({
                      groupIds: allSelected
                        ? selected.filter((id) => !ids.includes(id))
                        : [...new Set([...selected, ...ids])],
                    })}
                  >
                    {allSelected ? t("deselectCategory") : t("selectCategory")}
                  </button>
                </div>
                <div className={s.rows}>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      disabled={!ready}
                      aria-pressed={selected.includes(g.id)}
                      aria-label={rowLabel(g)}
                      className={`${s.row} ${selected.includes(g.id) ? s.rowSelected : ""}`}
                      onClick={() => toggle(g.id)}
                    >
                      <span className={s.checkbox}>
                        {selected.includes(g.id) && <Icon name="check" size={11} />}
                      </span>
                      <span className={s.rowLabel}>
                        {rowLabel(g)}
                      </span>
                      <span className={s.rowKana} lang="ja">
                        {g.kana.map((k) => (
                          <span key={k} className={s.kanaCell}>
                            <span>
                              {preferences.script === "katakana" ? toKatakana(k) : k}
                            </span>
                            <span className={s.kanaRomaji} lang="ja-Latn">
                              {getKanaRomaji(k)}
                            </span>
                          </span>
                        ))}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          <div className={s.selectionFooter}>
            <span>
              {t.rich("selectedKana", { count: pool.length, value: (chunks) => <b>{chunks}</b> })}
            </span>
            <button
              className="text-button"
              disabled={!ready}
              onClick={() =>
                updatePreferences({
                  groupIds: KANA_GROUPS.map((g) => g.id),
                })
              }
            >
              {t("selectAll")}
            </button>
          </div>
          <div className={s.selectionDone}>
            <span>{t("autosave")}</span>
            <button disabled={!ready} onClick={returnToStart}>
              {t("returnToStart")} <span aria-hidden="true">↑</span>
            </button>
          </div>
        </div>
      </section>
      <div className={s.metrics}>
        <div>
          <span className={s.metricIcon}>
            <Icon name="keyboard" />
          </span>
          <div>
            <strong>
              {format.number(records.filter((r) => r.mode === "kana").length)}
              <small>{t("sessionUnit", { count: records.filter((r) => r.mode === "kana").length })}</small>
            </strong>
            <span>{t("completedSessions")}</span>
          </div>
        </div>
        <div>
          <span className={`${s.metricIcon} ${s.green}`}>
            <Icon name="check" />
          </span>
          <div>
            <strong>
              {format.number(seen)}
              <small>{t("kanaUnit")}</small>
            </strong>
            <span>{t("practicedKana")}</span>
          </div>
        </div>
        <div>
          <span className={`${s.metricIcon} ${s.orange}`}>
            <Icon name="clock" />
          </span>
          <div>
            <strong>
              {format.number(totalMinutes)}
              <small>{t("minuteUnit")}</small>
            </strong>
            <span>{t("focusTime")}</span>
          </div>
        </div>
      </div>

      <div className={s.lowerLinks}>
        <Link href="/history/" className="secondary-link">
          <Icon name="chart" size={16} />
          {t("viewHistory")}
        </Link>
        <Generate className={s.aiCard}>
          <span className={s.aiIcon}>
            <Icon name="spark" size={23} />
          </span>
          <span>
            <strong>{t("articleChallenge")}</strong>
            <small>{t("aiDescription")}</small>
          </span>
          <Icon name="arrow" size={18} />
        </Generate>
      </div>
      <div className={s.bottomHint}>
        <Icon name="keyboard" size={17} />
        <span>
          {t.rich("typingTip", { first: (chunks) => <kbd>{chunks}</kbd>, second: (chunks) => <kbd>{chunks}</kbd> })}
        </span>
      </div>
    </>
  );
}
