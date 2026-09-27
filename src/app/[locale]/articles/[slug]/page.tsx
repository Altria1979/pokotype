import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { localizedPath } from "@/i18n/locales";
import { prepareLocale, sampleMetadata } from "@/i18n/seo";
import { SAMPLE_ARTICLES, sentenceReading, sentenceText } from "@/lib/articles";
import s from "@/components/LearningContent.module.css";

type SamplePageProps = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return SAMPLE_ARTICLES.map((article) => ({ slug: article.id }));
}

function findSample(slug: string) {
  const article = SAMPLE_ARTICLES.find((sample) => sample.id === slug);
  if (!article) notFound();
  return article;
}

export async function generateMetadata({ params }: SamplePageProps) {
  const { locale, slug } = await params;
  return sampleMetadata(locale, findSample(slug));
}

export default async function Page({ params }: SamplePageProps) {
  const { locale: value, slug } = await params;
  const locale = prepareLocale(value);
  const article = findSample(slug);
  const t = await getTranslations({ locale, namespace: "Learning" });

  return (
    <article className={s.readingPage}>
      <nav className={s.breadcrumbs} aria-label={t("backToArticles")}>
        <a className={s.textLink} href={localizedPath(locale, "/articles/")}>{t("backToArticles")}</a>
        <a className={s.textLink} href={localizedPath(locale, "/")}>{t("backToKana")}</a>
      </nav>
      <header>
        <p className="eyebrow">{t("sampleLabel")}</p>
        <h1 className={s.readingTitle} lang="ja">{article.title}</h1>
        <p className={s.level}>{t("sampleLevel", { level: article.level })}</p>
        <p className={s.intro}>{t(`samples.${article.id}`)}</p>
        <div className={s.actions}>
          <a className="primary" href={localizedPath(locale, `/articles/?id=${article.id}`)}>
            {t("practiceSample")}
          </a>
        </div>
        <p className={s.readingHelp}>{t("practiceHelp")}</p>
      </header>
      <section className={s.section} aria-labelledby="reading-title">
        <h2 id="reading-title">{t("readingTitle")}</h2>
        <ol className={s.sentences}>
          {article.sentences.map((sentence, index) => (
            <li key={index} aria-label={t("sentenceLabel", { number: index + 1 })}>
              <p className={s.sentenceText} lang="ja">{sentenceText(sentence)}</p>
              <dl>
                <dt>{t("readingLabel")}</dt>
                <dd lang="ja">{sentenceReading(sentence)}</dd>
                <dt>{t("translationLabel")}</dt>
                <dd lang="zh-CN">{sentence.translation}</dd>
              </dl>
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
