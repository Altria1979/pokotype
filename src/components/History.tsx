"use client";
import { Link } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { kanaTitleKey } from "@/i18n/history";
import { useData } from "./DataProvider";
import { summarize } from "@/lib/session";
import { Icon } from "./Icon";
import { PaperArt } from "./PaperArt";
import s from "./Preferences.module.css";
export function History() {
  const t = useTranslations("History");
  const format = useFormatter();
  const { records, ready, stats } = useData();
  const duration = records.reduce((n, r) => n + r.durationMs, 0);
  const total = summarize(
    records.reduce((n, r) => n + r.correct, 0),
    records.reduce((n, r) => n + r.errors, 0),
    duration,
  );
  const weak = Object.entries(stats)
    .filter(([, s]) => s.errors > 0)
    .sort((a, b) => b[1].errors / b[1].seen - a[1].errors / a[1].seen)
    .slice(0, 10);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">{t("eyebrow")}</div>
          <h1>{t("title")}</h1>
          <p className="subtitle">{t("subtitle")}</p>
        </div>
        <Link className="secondary-link" href="/">
          {t("continue")} <Icon name="arrow" size={16} />
        </Link>
      </div>
      {!ready ? (
        <div className="panel empty" role="status">
          {t("loading")}
        </div>
      ) : records.length === 0 ? (
        <section className="panel empty">
          <div className={s.emptyArt}>
            <PaperArt />
          </div>
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyDescription")}</p>
          <Link className="primary" href="/">
            {t("start")} <Icon name="arrow" size={16} />
          </Link>
        </section>
      ) : (
        <div className="stack">
          <div className={s.summary}>
            <div>
              <div className="big-number">{format.number(records.length)}</div>
              <span className="muted">{t("completed")}</span>
            </div>
            <div>
              <div className="big-number">
                {format.number(Math.round(duration / 60000))} <small>{t("minutes")}</small>
              </div>
              <span className="muted">{t("focus")}</span>
            </div>
            <div>
              <div className="big-number">
                {format.number(total.accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                <small>%</small>
              </div>
              <span className="muted">{t("accuracy")}</span>
            </div>
          </div>
          {weak.length > 0 && (
            <section className="panel pad">
              <h2>{t("weakTitle")}</h2>
              <div className="flex wrap">
                {weak.map(([kana, v]) => (
                  <span className={`pill ${s.weakKana}`} key={kana}>
                    {kana}
                    <small className="muted">{t("errors", { count: v.errors })}</small>
                  </span>
                ))}
              </div>
              <p className="tagline" style={{ margin: "15px 0 0" }}>
                {t("weakDescription")}
              </p>
            </section>
          )}
          <section className="panel table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("content")}</th>
                  <th>{t("date")}</th>
                  <th>{t("duration")}</th>
                  <th>{t("cpm")}</th>
                  <th>{t("accuracyColumn")}</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const m = summarize(r.correct, r.errors, r.durationMs);
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="pill" style={{ marginRight: 10 }}>
                          {t(r.mode)}
                        </span>
                        {kanaTitleKey(r) ? t(kanaTitleKey(r)!) : r.title}
                        {r.mode === "article" && (
                          <div className="muted">
                            {t(r.articlePracticeMode ?? "sentence")}
                            {r.articlePracticeMode === "group" && r.articleGroupSize && t("groupSize", { count: r.articleGroupSize })}
                          </div>
                        )}
                      </td>
                      <td>
                        {format.dateTime(new Date(r.completedAt), {
                          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td>{t("seconds", { count: Math.round(r.durationMs / 1000) })}</td>
                      <td>{format.number(Math.round(m.cpm))}</td>
                      <td>{format.number(m.accuracy, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </>
  );
}
