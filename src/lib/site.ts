import { defaultLocale, locales, localizedPath, type Locale } from "../i18n/locales";

// Keep preview builds canonicalized to the real site unless a deployment overrides it.
export function getSiteUrl(): URL {
  const value = process.env.SITE_URL?.trim() || "https://pokotype.vercel.app";
  const url = new URL(value.endsWith("/") ? value : `${value}/`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("SITE_URL must be an HTTP(S) site URL without credentials, query or fragment");
  }
  return url;
}

export function siteUrl(path: string): string {
  return new URL(path.replace(/^\//, ""), getSiteUrl()).href;
}

export function languageAlternates(path: string): Record<Locale | "x-default", string> {
  return {
    "zh-CN": siteUrl(localizedPath("zh-CN", path)),
    en: siteUrl(localizedPath("en", path)),
    ja: siteUrl(localizedPath("ja", path)),
    "x-default": siteUrl(localizedPath(defaultLocale, path)),
  };
}

export const openGraphLocales: Record<(typeof locales)[number], string> = {
  "zh-CN": "zh_CN",
  en: "en_US",
  ja: "ja_JP",
};
