export const locales = ["zh-CN", "en", "ja"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "zh-CN";
export const localeNames: Record<Locale, string> = { "zh-CN": "简体中文", en: "English", ja: "日本語" };
export const LOCALE_STORAGE_KEY = "pokotype:locale:v1";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && locales.includes(value as Locale);
}

export function preferredLocale(saved: unknown, languages: readonly string[]): Locale {
  if (isLocale(saved)) return saved;
  for (const language of languages) {
    const base = language.toLowerCase().split("-")[0];
    if (base === "zh") return "zh-CN";
    if (base === "en" || base === "ja") return base;
  }
  return defaultLocale;
}

export function localizedPath(locale: Locale, path: string): string {
  const match = path.match(/^([^?#]*)(.*)$/)!;
  let pathname = match[1].replace(/^\/(zh-CN|en|ja)(?=\/|$)/, "") || "/";
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (!pathname.endsWith("/")) pathname += "/";
  return `/${locale}${pathname}${match[2]}`;
}
