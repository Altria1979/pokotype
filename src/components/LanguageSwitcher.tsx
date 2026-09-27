"use client";

import { useEffect, useId, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { isLocale, locales, localeNames, localizedPath, LOCALE_STORAGE_KEY } from "@/i18n/locales";
import { useLocaleGuard } from "./LocaleGuard";
import s from "./Shell.module.css";

export function LanguageSwitcher({ mobile = false }: { mobile?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("Locale");
  const { reasons } = useLocaleGuard();
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    try { localStorage.setItem(LOCALE_STORAGE_KEY, locale); } catch { /* Optional preference. */ }
  }, [locale]);
  const reason = reasons[0];
  return (
    <div className={mobile ? s.mobileLanguage : s.desktopLanguage}>
      <label className={s.languageControl}>
        <span aria-hidden="true">文</span>
        <span className="sr-only">{t("label")}</span>
        <select
          aria-label={t("label")}
          aria-describedby={reason ? id : undefined}
          value={locale}
          disabled={Boolean(reason) || pending}
          onChange={(event) => {
            const target = event.target.value;
            if (!isLocale(target) || reasons.length || pending) return;
            try { localStorage.setItem(LOCALE_STORAGE_KEY, target); } catch { /* Navigation still works. */ }
            const href = localizedPath(target, window.location.pathname + window.location.search + window.location.hash);
            startTransition(() => router.replace(href, { scroll: false }));
          }}
        >
          {locales.map((value) => <option key={value} value={value}>{localeNames[value]}</option>)}
        </select>
      </label>
      {reason && <span id={id} className={s.languageReason}>{t(`blocked.${reason}`)}</span>}
    </div>
  );
}
