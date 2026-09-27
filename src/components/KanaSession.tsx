"use client";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useData } from "./DataProvider";
import { Practice } from "./Practice";
import s from "./KanaPractice.module.css";

export function KanaSession() {
  const t = useTranslations("Kana");
  const { kanaSession } = useData();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const region = useRef<HTMLElement>(null);
  const onPracticePage = pathname === "/practice" || pathname === "/practice/";
  const session = onPracticePage && kanaSession?.id === searchParams.get("session")
    ? kanaSession
    : null;

  useEffect(() => {
    if (!onPracticePage) return;
    if (!session) {
      router.replace("/");
      return;
    }
    region.current?.focus({ preventScroll: true });
    region.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [onPracticePage, session, router]);

  if (!session) {
    return <p role="status">{t("sessionExpired")}</p>;
  }
  return (
    <section ref={region} className={s.practiceRegion} tabIndex={-1} aria-label={t("sessionLabel")}>
      <h1 className={s.practiceHeading}>{t("title")}</h1>
      <Practice
        key={session.id}
        items={session.items}
        mode="kana"
        title={t(session.mode === "weak" ? "weakSessionTitle" : "normalSessionTitle")}
        kanaPracticeMode={session.mode}
        onExit={() => router.back()}
      />
    </section>
  );
}
