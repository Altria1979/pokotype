import { getTranslations } from "next-intl/server";
import { locales, localizedPath, type Locale } from "@/i18n/locales";
import { siteUrl } from "@/lib/site";

export async function HomeStructuredData({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const url = siteUrl(localizedPath(locale, "/"));
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": siteUrl("/#website"),
        name: "Pokotype",
        url: siteUrl("/"),
        inLanguage: locales,
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#application`,
        name: "Pokotype",
        url,
        description: t("description"),
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web",
        inLanguage: locale,
        image: siteUrl("/social-preview.png"),
        isPartOf: { "@id": siteUrl("/#website") },
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{
    __html: JSON.stringify(data).replace(/</g, "\\u003c"),
  }} />;
}
