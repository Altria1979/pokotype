"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

export function LocalizedRedirect() {
  const router = useRouter();
  const t = useTranslations("Metadata");
  useEffect(() => {
    router.replace(`/articles/${window.location.search}${window.location.hash}`);
  }, [router]);
  return <p>{t("generateMoved")} <Link href="/articles/">{t("articles")}</Link></p>;
}
