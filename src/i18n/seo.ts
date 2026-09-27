import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, locales, localizedPath } from "./locales";

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
  const site = process.env.SITE_URL;
  const path = page === "home" ? "/" : `/${page}/`;
  const base = site ? new URL(site.endsWith("/") ? site : `${site}/`) : undefined;
  if (base && !["http:", "https:"].includes(base.protocol)) throw new Error("SITE_URL must be an HTTP(S) URL");
  const url = (language: typeof locale) => new URL(localizedPath(language, path).slice(1), base!).href;
  return {
    title: page === "home" ? t("home") : `${t(page)} · Pokotype`,
    description: t("description"),
    icons: { icon: { url: "/icon.svg?v=folded-p", type: "image/svg+xml", sizes: "any" } },
    robots: { index: page === "home" || page === "articles", follow: true },
    ...(base ? {
      metadataBase: base,
      alternates: {
        canonical: url(locale),
        languages: { ...Object.fromEntries(locales.map((language) => [language, url(language)])), "x-default": url("zh-CN") },
      },
    } : {}),
  };
}
