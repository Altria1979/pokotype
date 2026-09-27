"use client";
import { Link, usePathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { useEffect, useRef, useState } from "react";
import s from "./Shell.module.css";
import { DataProvider } from "./DataProvider";
import { PaperFooter } from "./PaperFooter";

const links = [
  ["/", "kana"],
  ["/articles/", "articles"],
  ["/history/", "history"],
  ["/settings/", "settings"],
] as const;

function Navigation({ pathname }: { pathname: string }) {
  const t = useTranslations("Shell");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 901px)");
    const resize = () => setOpen(false);
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className={s.navigation}>
      <button
        ref={trigger}
        className={s.menuButton}
        type="button"
        aria-label={t("menuLabel")}
        aria-expanded={open}
        aria-controls="main-navigation"
        onClick={() => setOpen(!open)}
      >
        <span>{open ? t("closeMenu") : t("menu")}</span>
        <span
          className={`${s.menuIcon} ${open ? s.menuIconOpen : ""}`}
          aria-hidden="true"
        >
          <i />
          <i />
        </span>
      </button>
      <nav
        id="main-navigation"
        aria-label={t("navigation")}
        className={`${s.nav} ${open ? s.navOpen : ""}`}
      >
        {links.map(([href, title]) => {
          const current = pathname === href || pathname + "/" === href ||
            (href === "/articles/" && pathname.startsWith(href)) ||
            (href === "/" && (pathname === "/practice" || pathname === "/practice/"));
          return (
            <Link
              key={href}
              href={href}
              className={`${s.navItem} ${current ? s.active : ""}`}
              aria-current={current ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {t(title)}
            </Link>
          );
        })}
        <LanguageSwitcher mobile />
      </nav>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations("Shell");
  const [floating, setFloating] = useState(false);
  useEffect(() => {
    const update = () => setFloating(window.scrollY > 16);
    const frame = window.requestAnimationFrame(update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update);
    };
  }, []);
  return (
    <div className={s.app}>
      <a href="#main" className={s.skip}>
        {t("skip")}
      </a>
      <div className={s.headerSpace} aria-hidden="true" />
      <header
        className={`${s.header} ${floating ? s.floating : ""}`}
        data-floating={floating}
      >
        <Link href="/" className={s.brand} aria-label={t("brand")}>
          <span className={s.mark} aria-hidden="true" />
          <span>
            Pokotype<small>{t("subtitle")}</small>
          </span>
        </Link>
        <Navigation key={pathname} pathname={pathname} />
        <LanguageSwitcher />
      </header>
      <DataProvider>
        <main id="main" tabIndex={-1} className={s.main}>
          {children}
        </main>
        <footer className={s.footer}>
          <div className={s.footerScene}>
            <PaperFooter />
          </div>
          <div className={s.footerMeta}>
            <span className={s.footerBrand}>
              Pokotype <span>·</span> {t("tagline")}
            </span>
            <a
              className={s.repositoryLink}
              href="https://github.com/Altria1979/pokotype"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub <span aria-hidden="true">↗</span>
            </a>
            <span className={s.local}>
              <i /> {t("local")}
            </span>
          </div>
        </footer>
      </DataProvider>
    </div>
  );
}
