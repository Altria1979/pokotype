import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, locales, localizedPath, type Locale } from "./locales";
import { getSiteUrl, languageAlternates, openGraphLocales, siteUrl } from "../lib/site";
import type { Article } from "../lib/articles";

export type LocalePageProps = { params: Promise<{ locale: string }> };
type Page = "home" | "articles" | "practice" | "history" | "settings" | "generate";

export function prepareLocale(value: string) {
  if (!isLocale(value)) notFound();
  setRequestLocale(value);
  return value;
}

export async function pageMetadata(value: string, page: Page): Promise<Metadata> {
  const locale = prepareLocale(value);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const path = page === "home" ? "/" : `/${page}/`;
  return metadataForPage(locale, path,
    page === "home" ? t("home") : `${t(page)} · Pokotype`,
    page === "home" ? t("description") : t(`${page}Description`),
    page === "home" || page === "articles",
  );
}

export async function sampleMetadata(value: string, article: Article): Promise<Metadata> {
  const locale = prepareLocale(value);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return metadataForPage(locale, `/articles/${article.id}/`,
    t("sampleTitle", { title: article.title, level: article.level }),
    t("sampleDescription", { title: article.title, level: article.level }),
    true,
  );
}

function metadataForPage(locale: Locale, path: string, title: string, description: string, index: boolean): Metadata {
  const url = siteUrl(localizedPath(locale, path));
  const image = { url: siteUrl("/social-preview.png"), width: 1200, height: 630, alt: "Pokotype — Japanese typing practice" };
  return {
    title,
    description,
    applicationName: "Pokotype",
    metadataBase: getSiteUrl(),
    icons: { icon: { url: "/icon.svg?v=folded-p", type: "image/svg+xml", sizes: "any" } },
    robots: { index, follow: true },
    alternates: { canonical: url, languages: languageAlternates(path) },
    openGraph: {
      type: "website", siteName: "Pokotype", title, description, url,
      locale: openGraphLocales[locale],
      alternateLocale: locales.filter((language) => language !== locale).map((language) => openGraphLocales[language]),
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
