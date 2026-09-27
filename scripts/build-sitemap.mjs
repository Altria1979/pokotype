import { writeFile, rm } from "node:fs/promises";

const site = process.env.SITE_URL;
if (!site) {
  await rm("out/sitemap.xml", { force: true });
} else {
  const base = new URL(site.endsWith("/") ? site : `${site}/`);
  if (!["http:", "https:"].includes(base.protocol)) throw new Error("SITE_URL must be an HTTP(S) URL");
  const locales = ["zh-CN", "en", "ja"];
  const escape = (text) => text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const url = (locale, page) => escape(new URL(`${locale}/${page}`, base).href);
  const entries = ["", "articles/"].flatMap((page) => locales.map((locale) =>
    `<url><loc>${url(locale, page)}</loc>${[...locales, "x-default"].map((language) =>
      `<xhtml:link rel="alternate" hreflang="${language}" href="${url(language === "x-default" ? "zh-CN" : language, page)}"/>`
    ).join("")}</url>`
  ));
  await writeFile("out/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join("")}</urlset>\n`);
}
