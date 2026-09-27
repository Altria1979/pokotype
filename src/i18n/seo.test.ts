import { afterEach, describe, expect, it, vi } from "vitest";
import { pageMetadata } from "./seo";
import { locales } from "./locales";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("Not found"); } }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string) => key,
}));

afterEach(() => vi.unstubAllEnvs());

describe("search metadata", () => {
  it("keeps explicit site paths and reciprocal language URLs", async () => {
    vi.stubEnv("SITE_URL", "https://example.com/pokotype");
    for (const locale of locales) {
      const metadata = await pageMetadata(locale, "articles");
      expect(metadata.alternates).toEqual({
        canonical: `https://example.com/pokotype/${locale}/articles/`,
        languages: {
          "zh-CN": "https://example.com/pokotype/zh-CN/articles/",
          en: "https://example.com/pokotype/en/articles/",
          ja: "https://example.com/pokotype/ja/articles/",
          "x-default": "https://example.com/pokotype/ja/articles/",
        },
      });
      expect(metadata.robots).toMatchObject({ index: true, follow: true });
    }
  });

  it("allows crawlers to see noindex on personal and session pages", async () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    for (const page of ["practice", "history", "settings", "generate"] as const) {
      expect((await pageMetadata("ja", page)).robots).toMatchObject({ index: false, follow: true });
    }
  });

  it("rejects unsupported locales and non-HTTP origins", async () => {
    await expect(pageMetadata("xx", "home")).rejects.toThrow("Not found");
    vi.stubEnv("SITE_URL", "file:///tmp/site");
    await expect(pageMetadata("ja", "home")).rejects.toThrow("SITE_URL");
  });
});
