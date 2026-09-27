import { KanaSession } from "@/components/KanaSession";
import { prepareLocale, pageMetadata, type LocalePageProps } from "@/i18n/seo";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
export async function generateMetadata({ params }: LocalePageProps) { return pageMetadata((await params).locale, "practice"); }
export default async function Page({ params }: LocalePageProps) {
  const locale = prepareLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return <Suspense fallback={<p role="status">{t("openingPractice")}</p>}><KanaSession /></Suspense>;
}
