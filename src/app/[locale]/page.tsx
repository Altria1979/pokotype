import { KanaPractice } from "@/components/KanaPractice";
import { HomeStructuredData } from "@/components/HomeStructuredData";
import { LearningGuide } from "@/components/LearningContent";
import { prepareLocale, pageMetadata, type LocalePageProps } from "@/i18n/seo";
export async function generateMetadata({ params }: LocalePageProps) { return pageMetadata((await params).locale, "home"); }
export default async function Page({ params }: LocalePageProps) {
  const locale = prepareLocale((await params).locale);
  return <><HomeStructuredData locale={locale} /><KanaPractice /><LearningGuide locale={locale} /></>;
}
