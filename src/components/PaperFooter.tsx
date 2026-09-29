"use client";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Generate } from "./Generate";
import s from "./PaperFooter.module.css";

export function PaperFooter() {
  const t = useTranslations("Shell");
  return (
    <section className={s.scene} aria-labelledby="next-practice-title">
      <div className={s.landscape} aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <div className={s.content}>
        <div className="eyebrow">{t("footerEyebrow")}</div>
        <h2 id="next-practice-title">
          {t("footerTitleFirst")}
          <br className={s.mobileBreak} />
          {t("footerTitleLast")}
        </h2>
        <p>{t("footerDescription")}</p>
        <div className={s.actions}>
          <Generate className="primary">
            {t("generate")} <span aria-hidden="true">↗</span>
          </Generate>
          <Link className="secondary-link" href="/articles/?id=sample-morning">
            {t("sample")} <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <a
          className={s.desktopDownload}
          href="https://github.com/Altria1979/pokotype/releases"
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("desktopDownload")} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
