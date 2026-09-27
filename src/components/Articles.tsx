"use client";

import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useErrorMessage } from "@/i18n/errors";
import { useLocaleBlock } from "./LocaleGuard";
import { useEffect, useRef, useState } from "react";
import {
  SAMPLE_ARTICLES,
  sentenceReading,
  sentenceText,
  validateArticleContent,
  type Article,
} from "@/lib/articles";
import { useData } from "./DataProvider";
import { Icon } from "./Icon";
import { InputRulesHelp } from "./InputRulesHelp";
import { Generate } from "./Generate";
import { Practice } from "./Practice";
import {
  type ArticlePracticeMode,
  type ArticleGroupSize,
} from "@/lib/article-practice";
import s from "./Articles.module.css";

const TOPIC_KEYS: Record<string, string> = { 日常: "daily", 旅行: "travel", 校园: "school", 工作: "work", 文化: "culture" };

const isTemplate = (article: Article) =>
  SAMPLE_ARTICLES.some((sample) => sample.id === article.id);
const lengthOf = (article: Article) =>
  article.sentences.reduce(
    (total, sentence) => total + [...sentenceText(sentence)].length,
    0,
  );

export function Articles() {
  const t = useTranslations("Articles");
  const format = useFormatter();
  const { articles, ready } = useData();
  const params = useSearchParams();
  const id = params.get("id");
  const library = [
    ...articles,
    ...SAMPLE_ARTICLES.filter(
      (sample) => !articles.some((article) => article.id === sample.id),
    ),
  ];
  if (!ready)
    return (
      <div className="panel empty" role="status">
        {t("loading")}
      </div>
    );
  if (id) {
    const article = library.find((item) => item.id === id);
    if (!article)
      return (
        <div className="panel empty">
          <Icon name="book" size={36} />
          <h1>{t("notFound")}</h1>
          <p>{t("notFoundHelp")}</p>
          <Link href="/articles/">{t("back")}</Link>
        </div>
      );
    return <ArticleDetail key={article.id} article={article} />;
  }
  return (
    <div className="stack">
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1>{t("title")}</h1>
          <p className="subtitle">{t("subtitle")}</p>
        </div>
        <Generate className="primary">
          <Icon name="spark" />
          {t("generate")}
        </Generate>
      </div>
      <div className={s.libraryBanner}>
        <div>
          <span className={s.bannerIcon}>
            <Icon name="book" size={25} />
          </span>
          <div>
            <h2>{t("bannerTitle")}</h2>
            <p>{t("bannerHelp")}</p>
          </div>
        </div>
        <span className={s.libraryCount}>
          {format.number(library.length)}
          <small>{t("articleUnit")}</small>
        </span>
      </div>
      <div className="spread">
        <h2 className={s.sectionTitle}>
          {t("shelf")} <span>{t("shelfCount", { saved: articles.length, samples: SAMPLE_ARTICLES.length })}</span>
        </h2>
        <span className="muted">{t("localOnly")}</span>
      </div>
      <div className={s.articleGrid}>
        {library.map((article, index) => (
          <Link
            className={`panel ${s.articleCard}`}
            key={article.id}
            href={`/articles/?id=${encodeURIComponent(article.id)}`}
          >
            <div className="spread">
              <span className="pill">
                {article.level} · {TOPIC_KEYS[article.topic] ? t(`topics.${TOPIC_KEYS[article.topic]}`) : article.topic}
              </span>
              <span className={s.source}>
                {isTemplate(article)
                  ? t("sample")
                  : article.source === "ai"
                    ? t("aiArticle")
                    : t("copy")}
              </span>
            </div>
            <div
              className={`${s.cover} ${s[`cover${index % 3}`]}`}
              aria-hidden="true"
            >
              <span>
                {article.topic === "旅行"
                  ? "旅"
                  : article.topic === "校园"
                    ? "読"
                    : "文"}
              </span>
              <small>{t("coverLabel")}</small>
            </div>
            <h2 lang="ja">{article.title}</h2>
            <p className={s.excerpt} lang="ja">
              {article.sentences.map(sentenceText).join("")}
            </p>
            <div className={s.cardFooter}>
              <span>
                {t("articleCount", { characters: lengthOf(article), sentences: article.sentences.length })}
              </span>
              <span>
                {t("readAndPractice")} <Icon name="arrow" size={16} />
              </span>
            </div>
          </Link>
        ))}
      </div>
      <p className="tagline">
        {t("aiDisclaimer")}
      </p>
    </div>
  );
}

function ArticleDetail({ article }: { article: Article }) {
  const t = useTranslations("Articles");
  const errorMessage = useErrorMessage();
  const { putArticle, removeArticle, clearError, preferences, updatePreferences } = useData();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => ({
    title: article.title,
    sentences: structuredClone(article.sentences),
  }));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [practiceConfig, setPracticeConfig] = useState<{
    mode: ArticlePracticeMode;
    groupSize: ArticleGroupSize;
  } | null>(null);
  useLocaleBlock("editing", editing);
  useLocaleBlock("saving", saving);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const template = isTemplate(article);

  async function save() {
    if (saving) return;
    let content;
    try {
      content = validateArticleContent(draft);
    } catch (cause) {
      setError(errorMessage(cause, "Articles.checkContent"));
      return;
    }
    setSaving(true);
    setError("");
    clearError();
    const updated: Article = {
      ...article,
      ...content,
      id: template ? crypto.randomUUID() : article.id,
      createdAt: template ? new Date().toISOString() : article.createdAt,
    };
    await putArticle(updated);
    if (!mounted.current) return;
    setSaving(false);
    setEditing(false);
    setDraft(content);
    if (template)
      router.replace(`/articles/?id=${encodeURIComponent(updated.id)}`);
  }

  function editReading(
    sentenceIndex: number,
    segmentIndex: number,
    reading: string,
  ) {
    setDraft((previous) => ({
      ...previous,
      sentences: previous.sentences.map((sentence, i) =>
        i !== sentenceIndex
          ? sentence
          : {
              ...sentence,
              segments: sentence.segments.map((segment, j) =>
                j !== segmentIndex ? segment : { ...segment, reading },
              ),
            },
      ),
    }));
  }

  function start() {
    try {
      validateArticleContent(article);
      setError("");
      setPracticeConfig({
        mode: preferences.articlePracticeMode,
        groupSize: preferences.articleGroupSize,
      });
    } catch (cause) {
      setError(errorMessage(cause, "Articles.correctReadings"));
    }
  }

  async function remove() {
    if (!window.confirm(t("confirmDelete", { title: article.title }))) return;
    const removed = await removeArticle(article.id);
    if (removed && mounted.current) router.push("/articles/");
  }

  if (practiceConfig)
    return (
      <Practice
        items={article.sentences.map((sentence) => ({
          text: sentenceText(sentence),
          reading: sentenceReading(sentence),
          sentence,
        }))}
        mode="article"
        articlePracticeMode={practiceConfig.mode}
        articleGroupSize={practiceConfig.groupSize}
        title={article.title}
        onExit={() => setPracticeConfig(null)}
      />
    );

  return (
    <div className="stack" data-article-view>
      <Link href="/articles/" className={s.backLink}>
        ← {t("back")}
      </Link>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("detailEyebrow")}</div>
          <h1 lang="ja">{article.title}</h1>
          <p className="subtitle">
            {article.level} · {TOPIC_KEYS[article.topic] ? t(`topics.${TOPIC_KEYS[article.topic]}`) : article.topic} · {t("articleCount", { characters: lengthOf(article), sentences: article.sentences.length })}
          </p>
        </div>
      </div>
      <div className="mobile-notice">
        {t("desktopNotice")}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className={`panel ${s.readingPanel}`}>
        <div className={s.readingToolbar}>
          <div className="flex">
            <Icon name="book" />
            <strong>{editing ? t("edit") : t("preview")}</strong>
            <span className="pill">
              {template ? t("sample") : t("inLibrary")}
            </span>
          </div>
          <div className="flex wrap">
            <InputRulesHelp />
            {editing ? (
              <>
                <button
                  disabled={saving}
                  onClick={() => {
                    setEditing(false);
                    setDraft({
                      title: article.title,
                      sentences: structuredClone(article.sentences),
                    });
                    setError("");
                  }}
                >
                  {t("cancelEdit")}
                </button>
                <button className="primary" disabled={saving} onClick={save}>
                  {saving ? t("saving") : template ? t("saveCopy") : t("saveChanges")}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setEditing(true)}>{t("editTitleAndReadings")}</button>
                {!template && (
                  <button disabled={saving} onClick={save}>
                    {saving ? t("saving") : t("saveAgain")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {editing && (
          <div className={s.editorIntro}>
            <div className="field">
              <label htmlFor="article-title">{t("articleTitle")}</label>
              <input
                id="article-title"
                lang="ja"
                value={draft.title}
                maxLength={120}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </div>
            <p className="notice">
              {t("readingInstructions")} {template
                ? t("sampleEditHelp")
                : t("savedReadingHelp")}
            </p>
          </div>
        )}
        {editing ? <div className={s.sentences}>
          {draft.sentences.map(
            (sentence, sentenceIndex) => (
              <div className={s.sentenceRow} key={sentenceIndex}>
                <span className={s.sentenceNumber}>
                  {String(sentenceIndex + 1).padStart(2, "0")}
                </span>
                <div className={s.sentenceContent}>
                  <p className={s.japanese} lang="ja">
                    {sentence.segments.map((segment, segmentIndex) => (
                      <ruby key={segmentIndex}>
                        {segment.text}
                      </ruby>
                    ))}
                  </p>
                  <p className={s.translation} lang="zh-CN">{sentence.translation}</p>
                    <div className={s.segmentEditor}>
                      {sentence.segments.map((segment, segmentIndex) => (
                        <label key={segmentIndex}>
                          <span lang="ja">{segment.text}</span>
                          <input
                            lang="ja"
                            aria-label={t("readingLabel", { sentence: sentenceIndex + 1, segment: segmentIndex + 1 })}
                            value={segment.reading}
                            maxLength={2000}
                            onChange={(event) =>
                              editReading(
                                sentenceIndex,
                                segmentIndex,
                                event.target.value,
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>
                </div>
              </div>
            ),
          )}
        </div> : (
          <div className={s.articleReading}>
            <p className={s.articlePassage} lang="ja" data-testid="article-preview-passage">
              {article.sentences.map((sentence, sentenceIndex) => (
                <span key={sentenceIndex}>
                  {sentence.segments.map((segment, segmentIndex) => (
                    <ruby key={segmentIndex}>
                      {segment.text}
                      {preferences.showKana && <rt>{segment.reading}</rt>}
                    </ruby>
                  ))}
                </span>
              ))}
            </p>
            {preferences.showTranslation && (
              <div className={s.articleTranslation}>
                <h2>{t("chineseTranslation")}</h2>
                <p lang="zh-CN" data-testid="article-preview-translation">
                  {article.sentences.map((sentence) => sentence.translation).join("")}
                </p>
              </div>
            )}
          </div>
        )}
        <div className={s.readingFooter}>
          <span>{t("practiceFeatures")}</span>
          {!template && (
            <button
              className="text-button danger-button"
              onClick={remove}
              disabled={saving}
            >
              {t("delete")}
            </button>
          )}
        </div>
      </section>
      <p className="tagline">
        {t("readingDisclaimer")}
      </p>
      <fieldset className={s.practiceModes} disabled={editing || saving}>
        <legend>{t("selectMode")}</legend>
        <div className={s.modeChoices}>
          {(["full", "group", "sentence"] as const).map((value) => (
            <label key={value} className={s.modeChoice}>
              <input
                type="radio"
                name="article-practice-mode"
                value={value}
                aria-label={t(`modes.${value}`)}
                checked={preferences.articlePracticeMode === value}
                onChange={() => updatePreferences({ articlePracticeMode: value })}
              />
              <span>
                <strong>{t(`modes.${value}`)}</strong>
                <small>{t(`modeDescriptions.${value}`)}</small>
              </span>
            </label>
          ))}
        </div>
        <div className={s.modeHelp}>
          {preferences.articlePracticeMode === "group" ? (
            <>
              <label htmlFor="article-group-size">{t("groupSize")}</label>
              <select
                id="article-group-size"
                value={preferences.articleGroupSize}
                onChange={(event) => updatePreferences({ articleGroupSize: Number(event.target.value) as ArticleGroupSize })}
              >
                {[3, 5, 10].map((size) => <option key={size} value={size}>{t("sentenceCount", { count: size })}</option>)}
              </select>
              <span>{t("groupHelp")}</span>
            </>
          ) : (
            <span>{preferences.articlePracticeMode === "full" ? t("fullHelp") : t("sentenceHelp")}</span>
          )}
        </div>
        <div className={`${s.practiceAction} desktop-practice`}>
          <button className={`primary ${s.startButton}`} onClick={start}>
            <Icon name="play" size={20} />
            {t("start")}
            <Icon name="arrow" size={18} />
          </button>
          <p>{t("selectedMode", { mode: t(`modes.${preferences.articlePracticeMode}`), count: article.sentences.length })}</p>
        </div>
      </fieldset>
    </div>
  );
}
