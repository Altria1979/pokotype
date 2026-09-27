import type { MetadataRoute } from "next";
import { locales, localizedPath } from "../i18n/locales";
import { SAMPLE_ARTICLES } from "../lib/articles";
import { languageAlternates, siteUrl } from "../lib/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/articles/", ...SAMPLE_ARTICLES.map((article) => `/articles/${article.id}/`)];
  return paths.flatMap((path) => locales.map((locale) => ({
    url: siteUrl(localizedPath(locale, path)),
    alternates: { languages: languageAlternates(path) },
  })));
}
