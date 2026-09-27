import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_ARTICLES, sentenceReading, sentenceText } from "../src/lib/articles";
import { getSiteUrl, siteUrl } from "../src/lib/site";

const locales = ["ja", "en", "zh-CN"] as const;
const publicRoutes = ["", "articles/", ...SAMPLE_ARTICLES.map((article) => `articles/${article.id}/`)];

async function readMetadata(page: Page, html: string) {
  return page.evaluate((markup) => {
    const document = new DOMParser().parseFromString(markup, "text/html");
    const content = (selector: string) => document.querySelector(selector)?.getAttribute("content") ?? "";
    return {
      lang: document.documentElement.lang,
      title: document.title,
      description: content('meta[name="description"]'),
      canonical: Array.from(document.querySelectorAll('link[rel="canonical"]'), (link) => link.getAttribute("href")),
      alternates: Object.fromEntries(Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'), (link) => [
        link.getAttribute("hreflang"), link.getAttribute("href"),
      ])),
      robots: Array.from(document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]'), (meta) => meta.getAttribute("content") ?? ""),
      openGraphTitle: content('meta[property="og:title"]'),
      openGraphDescription: content('meta[property="og:description"]'),
      openGraphUrl: content('meta[property="og:url"]'),
      openGraphImage: content('meta[property="og:image"]'),
      twitterCard: content('meta[name="twitter:card"]'),
      twitterTitle: content('meta[name="twitter:title"]'),
      twitterDescription: content('meta[name="twitter:description"]'),
      twitterImage: content('meta[name="twitter:image"]'),
    };
  }, html);
}

function languageAlternates(route: string) {
  return Object.fromEntries([
    ...locales.map((locale) => [locale, siteUrl(`/${locale}/${route}`)]),
    ["x-default", siteUrl(`/ja/${route}`)],
  ]);
}

test.describe("静态搜索引擎入口", () => {
  test.use({ javaScriptEnabled: false });

  test("robots 和 sitemap 只发布可访问的公开页面，并提供互相对应的语言版本", async ({ page, request }) => {
    const robotsResponse = await request.get("/robots.txt");
    expect(robotsResponse.ok()).toBe(true);
    const robots = await robotsResponse.text();
    expect(robots).toMatch(/^User-Agent:\s*\*\s*$/im);
    expect(robots).toMatch(/^Allow:\s*\/\s*$/im);
    expect(robots).toContain(`Sitemap: ${siteUrl("/sitemap.xml")}`);
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/im);

    const sitemapResponse = await request.get("/sitemap.xml");
    expect(sitemapResponse.ok()).toBe(true);
    const entries = await page.evaluate((xml) => {
      const document = new DOMParser().parseFromString(xml, "application/xml");
      if (document.querySelector("parsererror")) throw new Error("Invalid sitemap XML");
      return Array.from(document.getElementsByTagName("url"), (entry) => ({
        url: entry.getElementsByTagName("loc")[0]?.textContent ?? "",
        alternates: Object.fromEntries(Array.from(entry.getElementsByTagNameNS("http://www.w3.org/1999/xhtml", "link"), (link) => [
          link.getAttribute("hreflang"), link.getAttribute("href"),
        ])),
      }));
    }, await sitemapResponse.text());

    const expectedUrls = locales.flatMap((locale) => publicRoutes.map((route) => siteUrl(`/${locale}/${route}`)));
    expect(entries.map((entry) => entry.url).sort()).toEqual(expectedUrls.sort());
    const titles: string[] = [];
    const descriptions: string[] = [];
    for (const entry of entries) {
      const url = new URL(entry.url);
      expect(url.origin).toBe(getSiteUrl().origin);
      expect(url.search).toBe("");
      expect(url.hash).toBe("");
      const path = `/${url.pathname.slice(getSiteUrl().pathname.length)}`;
      const [, locale, ...segments] = path.split("/");
      const route = segments.join("/");
      expect(entry.alternates).toEqual(languageAlternates(route));

      // Fetch the generated HTML directly so hydration cannot manufacture SEO tags.
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      const metadata = await readMetadata(page, await response.text());
      expect(metadata.lang).toBe(locale);
      expect(metadata.canonical).toEqual([entry.url]);
      expect(metadata.alternates).toEqual(entry.alternates);
      expect(metadata.robots.join(",")).not.toMatch(/noindex/i);
      expect(metadata.title.trim()).not.toBe("");
      expect(metadata.description.trim()).not.toBe("");
      expect(metadata.openGraphTitle).not.toBe("");
      expect(metadata.openGraphDescription).toBe(metadata.description);
      expect(metadata.openGraphUrl).toBe(entry.url);
      expect(metadata.openGraphImage).toBe(siteUrl("/social-preview.png"));
      expect(metadata.twitterCard).toBe("summary_large_image");
      expect(metadata.twitterTitle).not.toBe("");
      expect(metadata.twitterDescription).toBe(metadata.description);
      expect(metadata.twitterImage).toBe(siteUrl("/social-preview.png"));
      titles.push(metadata.title);
      descriptions.push(metadata.description);
    }
    expect(new Set(titles).size).toBe(expectedUrls.length);
    expect(new Set(descriptions).size).toBe(expectedUrls.length);

    const preview = await request.get("/social-preview.png");
    expect(preview.ok()).toBe(true);
    expect(preview.headers()["content-type"]).toContain("image/png");
    expect((await preview.body()).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });

  test("个人页面、临时练习和旧入口在原始 HTML 中禁止索引", async ({ page, request }) => {
    const privateRoutes = ["history/", "settings/", "practice/", "generate/"];
    const paths = [
      ...locales.flatMap((locale) => privateRoutes.map((route) => `/${locale}/${route}`)),
      "/index.html",
      "/articles/",
      ...privateRoutes.map((route) => `/${route}`),
    ];
    for (const path of paths) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(200);
      const metadata = await readMetadata(page, await response.text());
      expect(metadata.robots.join(","), path).toMatch(/\bnoindex\b/i);
    }
  });

  for (const locale of locales) {
    test(`${locale} 首页学习说明、文章入口和全文无需 JavaScript 即可阅读`, async ({ page }) => {
      await page.goto(`/${locale}/`);
      const guide = page.locator("#learning-guide");
      await expect(guide).toBeVisible();
      await expect(guide.getByRole("heading").first()).toBeVisible();
      expect((await guide.innerText()).length).toBeGreaterThan(100);

      const structuredData = await page.locator('script[type="application/ld+json"]').allTextContents();
      const schemas = structuredData.flatMap((content) => {
        const value = JSON.parse(content) as { "@context": string; "@graph"?: { "@type"?: string }[]; "@type"?: string };
        expect(value["@context"]).toBe("https://schema.org");
        return value["@graph"] ?? [value];
      });
      expect(schemas.map((schema) => schema["@type"])).toEqual(expect.arrayContaining(["WebSite", "WebApplication"]));

      await page.goto(`/${locale}/articles/`);
      for (const article of SAMPLE_ARTICLES) {
        const link = page.getByRole("main").locator(`a[href="/${locale}/articles/${article.id}/"]`).first();
        await expect(link).toBeVisible();
        await expect(link).toContainText(article.title);
      }
      for (const article of SAMPLE_ARTICLES) {
        const response = await page.goto(`/${locale}/articles/${article.id}/`);
        expect(response?.ok()).toBe(true);
        const main = page.getByRole("main");
        await expect(main.getByRole("heading", { level: 1, name: article.title, exact: true })).toBeVisible();
        for (const sentence of article.sentences) {
          await expect(main.getByText(sentenceText(sentence), { exact: true })).toBeVisible();
          await expect(main.getByText(sentenceReading(sentence), { exact: true })).toBeVisible();
          await expect(main.getByText(sentence.translation, { exact: true })).toBeVisible();
        }
      }
    });
  }
});

test("公开阅读入口进入原有练习流程，练习时隐藏额外文章导航", async ({ page }) => {
  await page.goto("/zh-CN/articles/sample-morning/");
  await expect(page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "我的文章库" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "打开文章练习", exact: true }).click();
  await expect(page).toHaveURL(/\/zh-CN\/articles\/\?id=sample-morning$/);
  await expect(page.getByRole("heading", { level: 1, name: SAMPLE_ARTICLES[0].title, exact: true })).toBeVisible();
  await expect(page.locator("#public-samples")).toBeHidden();
  await page.getByRole("button", { name: "开始文章练习", exact: true }).click();
  await expect(page.locator("[data-practice-input]")).toBeVisible();
  await expect(page.locator("#public-samples")).toBeHidden();
});
