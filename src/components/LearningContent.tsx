import { getTranslations } from "next-intl/server";
import { localizedPath, type Locale } from "@/i18n/locales";
import { SAMPLE_ARTICLES } from "@/lib/articles";
import s from "./LearningContent.module.css";

export async function LearningGuide({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Learning" });

  return (
    <section id="learning-guide" className={s.section} aria-labelledby="learning-title">
      <h2 id="learning-title">{t("guideTitle")}</h2>
      <p className={s.intro}>{t("guideIntro")}</p>
      <div className={s.guideGrid}>
        <div>
          <h3>{t("startTitle")}</h3>
          <ol className={s.steps}>
            <li>{t("stepRange")}</li>
            <li>{t("stepKeyboard")}</li>
            <li>{t("stepReview")}</li>
          </ol>
        </div>
        <div>
          <h3>{t("romajiTitle")}</h3>
          <p>{t("romajiIntro")}</p>
          <ul className={s.examples}>
            <li><span lang="ja">し</span><span><code>shi</code> / <code>si</code></span></li>
            <li><span lang="ja">ち</span><span><code>chi</code> / <code>ti</code></span></li>
            <li><span lang="ja">つ</span><span><code>tsu</code> / <code>tu</code></span></li>
          </ul>
          <p>{t("romajiNote")}</p>
        </div>
      </div>
      <div className={s.questions}>
        <div>
          <h3>{t("freeQuestion")}</h3>
          <p>{t("freeAnswer")}</p>
        </div>
        <div>
          <h3>{t("nextQuestion")}</h3>
          <p>{t("nextAnswer")}</p>
          <a className={s.textLink} href={localizedPath(locale, "/articles/sample-morning/")}>
            {t("firstSample")}
          </a>
        </div>
      </div>
    </section>
  );
}

export async function SampleArticleLinks({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Learning" });

  return (
    <section id="public-samples" className={`${s.section} ${s.sampleDiscovery}`} aria-labelledby="public-samples-title">
      <h2 id="public-samples-title">{t("samplesTitle")}</h2>
      <p className={s.intro}>{t("samplesIntro")}</p>
      <ul className={s.sampleList}>
        {SAMPLE_ARTICLES.map((article) => (
          <li key={article.id}>
            <div>
              <p className={s.level}>{t("sampleLevel", { level: article.level })}</p>
              <p className={s.sampleHeading}>
                <a className={s.sampleTitle} lang="ja" href={localizedPath(locale, `/articles/${article.id}/`)}>
                  {article.title}
                </a>
              </p>
              <p>{t(`samples.${article.id}`)}</p>
            </div>
            <a className={s.textLink} href={localizedPath(locale, `/articles/${article.id}/`)}>
              {t("readSample")}<span className="sr-only">: {article.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
