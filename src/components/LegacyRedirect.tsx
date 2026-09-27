"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { locales, localeNames, localizedPath, LOCALE_STORAGE_KEY, preferredLocale } from "@/i18n/locales";

export function LegacyRedirect({ path = "/" }: { path?: string }) {
  const router = useRouter();
  useEffect(() => {
    let saved: unknown;
    try { saved = localStorage.getItem(LOCALE_STORAGE_KEY); } catch { /* Use browser language. */ }
    const locale = preferredLocale(saved, navigator.languages);
    router.replace(localizedPath(locale, path + window.location.search + window.location.hash));
  }, [path, router]);
  return <main className="panel pad" style={{ maxWidth: 640, margin: "10vh auto" }}>
    <h1>Pokotype</h1>
    <p>正在打开 · Opening · ページを開いています</p>
    <nav aria-label="Language / 语言 / 言語" className="flex wrap">
      {locales.map((locale) => <a key={locale} href={localizedPath(locale, path)} lang={locale}>{localeNames[locale]}</a>)}
    </nav>
  </main>;
}
