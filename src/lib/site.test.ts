import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl, languageAlternates, siteUrl } from "./site";
import sitemap from "../app/sitemap";
import robots from "../app/robots";
import { SAMPLE_ARTICLES } from "./articles";

afterEach(() => vi.unstubAllEnvs());

describe("static search discovery", () => {
  it("uses the verified production origin when the build has no override", () => {
    vi.stubEnv("SITE_URL", "");
    expect(getSiteUrl().href).toBe("https://www.pokotype.tech/");
    expect(siteUrl("/en/")).toBe("https://www.pokotype.tech/en/");
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/" },
      sitemap: "https://www.pokotype.tech/sitemap.xml",
    });
  });

  it("keeps custom site prefixes consistent across all discovery metadata", () => {
    vi.stubEnv("SITE_URL", "https://example.com/pokotype");
    expect(siteUrl("/robots.txt")).toBe("https://example.com/pokotype/robots.txt");
    expect(languageAlternates("/articles/")["x-default"]).toBe("https://example.com/pokotype/ja/articles/");
    expect(robots().sitemap).toBe("https://example.com/pokotype/sitemap.xml");
    expect(sitemap().every((entry) => entry.url.startsWith("https://example.com/pokotype/"))).toBe(true);
  });

  it.each(["file:///tmp/site", "https://user:secret@example.com", "https://example.com?test=1", "https://example.com#test"])("rejects unsafe canonical origins: %s", (value) => {
    vi.stubEnv("SITE_URL", value);
    expect(getSiteUrl).toThrow("SITE_URL");
  });

  it("lists exactly the public homes, libraries and original samples with matching alternates", () => {
    vi.stubEnv("SITE_URL", "https://example.com");
    const paths = ["", "articles/", ...SAMPLE_ARTICLES.map((sample) => `articles/${sample.id}/`)];
    const expected = paths.flatMap((path) => ["zh-CN", "en", "ja"].map((locale) => `https://example.com/${locale}/${path}`));
    const entries = sitemap();
    expect(entries.map((entry) => entry.url).sort()).toEqual(expected.sort());
    for (const entry of entries) {
      expect(entry.url).not.toMatch(/[?#]/);
      const alternateUrls = Object.values(entry.alternates!.languages!);
      expect(alternateUrls).toContain(entry.url);
      expect(alternateUrls.every((url) => expected.includes(String(url)))).toBe(true);
      expect(entry).not.toHaveProperty("lastModified");
    }
  });
});
