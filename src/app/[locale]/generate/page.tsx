import { LocalizedRedirect } from "@/components/LocalizedRedirect";
import { prepareLocale, pageMetadata, type LocalePageProps } from "@/i18n/seo";
export async function generateMetadata({ params }: LocalePageProps) { return pageMetadata((await params).locale, "generate"); }
export default async function Page({ params }: LocalePageProps) {
  prepareLocale((await params).locale);
  return <LocalizedRedirect />;
}
