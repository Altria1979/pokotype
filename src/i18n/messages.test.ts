import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { createTranslator, type AbstractIntlMessages } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchProviderModels } from "../lib/ai-connection";
import { generateArticle } from "../lib/deepseek";
import { AppError } from "./errors";
import { locales } from "./locales";
import { loadMessages } from "./messages";

type FlatMessages = Record<string, string>;
const directory = fileURLToPath(new URL("./messages/", import.meta.url));
const catalogs = await Promise.all(locales.map(async (locale) => ({
  locale,
  messages: await loadMessages(locale),
  files: readdirSync(`${directory}/${locale}`).filter((file) => file.endsWith(".json")).sort(),
})));

function flatten(messages: AbstractIntlMessages, prefix = ""): FlatMessages {
  const result: FlatMessages = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === "string") result[`${prefix}${key}`] = value;
    else Object.assign(result, flatten(value, `${prefix}${key}.`));
  }
  return result;
}

// Use the ICU parser already installed by next-intl. Traversing all branches
// catches arguments inside plural/select messages without treating branch text
// as placeholders, and respects ICU apostrophe escaping.
function elementsOf(message: string) {
  const elements: MessageFormatElement[] = [];
  function visit(nodes: MessageFormatElement[]) {
    for (const node of nodes) {
      elements.push(node);
      if (node.type === TYPE.tag) visit(node.children);
      if (node.type === TYPE.plural || node.type === TYPE.select) {
        Object.values(node.options).forEach((option) => visit(option.value));
      }
    }
  }
  visit(parse(message));
  return elements;
}

function contractOf(message: string) {
  const args = new Set<string>();
  const tags = new Set<string>();
  for (const node of elementsOf(message)) {
    if (node.type === TYPE.tag) tags.add(node.value);
    else if (node.type !== TYPE.literal && node.type !== TYPE.pound) args.add(node.value);
  }
  return { arguments: [...args].sort(), tags: [...tags].sort() };
}

function sampleValues(message: string, count: number) {
  const values: Record<string, string | number | Date | ((chunks: ReactNode) => ReactNode)> = {};
  for (const node of elementsOf(message)) {
    if (node.type === TYPE.literal || node.type === TYPE.pound) continue;
    if (node.type === TYPE.tag) values[node.value] = (chunks) => chunks;
    else if (node.type === TYPE.date || node.type === TYPE.time) values[node.value] = new Date("2026-09-27T12:00:00Z");
    else if (node.type === TYPE.select) values[node.value] = "other";
    else if (!(node.value in values)) values[node.value] = count;
  }
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("complete language catalogs", () => {
  const baseline = flatten(catalogs[0].messages);

  for (const { locale, messages, files } of catalogs) {
    it(`${locale} imports every namespace and has identical message keys`, () => {
      expect(files).toEqual(catalogs[0].files);
      expect(Object.keys(messages).sort()).toEqual(files.map((file) => file.replace(/\.json$/, "")).sort());
      expect(Object.keys(flatten(messages)).sort()).toEqual(Object.keys(baseline).sort());
    });

    it(`${locale} keeps interpolation arguments and rich tags consistent`, () => {
      for (const [key, message] of Object.entries(flatten(messages))) {
        expect(contractOf(message), `${locale}:${key} contract`).toEqual(contractOf(baseline[key]));
      }
    });

    it(`${locale} renders every message with the real ICU formatter`, () => {
      const errors: string[] = [];
      const t = createTranslator<Record<string, string>>({
        locale,
        messages: messages as Record<string, string>,
        timeZone: "UTC",
        onError: (error) => errors.push(error.message),
      });
      for (const [key, message] of Object.entries(flatten(messages))) {
        expect(message.trim(), `${locale}:${key} is empty`).not.toBe("");
        for (const count of [0, 1, 2]) {
          const rendered = t.rich(key, sampleValues(message, count));
          expect(rendered, `${locale}:${key} did not render`).toBeTruthy();
        }
      }
      expect(errors).toEqual([]);
    });

    it(`${locale} maps every literal domain error code`, () => {
      const t = createTranslator<Record<string, string>>({ locale, messages: messages as Record<string, string> });
      for (const filename of ["articles.ts", "deepseek.ts", "ai-connection.ts"]) {
        const source = readFileSync(new URL(`../lib/${filename}`, import.meta.url), "utf8");
        for (const match of source.matchAll(/["'`]((?:ArticleErrors|GenerationErrors|ConnectionErrors)\.[\w.]+)["'`]/g)) {
          expect(t.has(match[1]), `${filename}: ${locale}:${match[1]}`).toBe(true);
        }
      }
    });
  }
});

async function assertTranslatedError(operation: Promise<unknown>) {
  const error = await operation.catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(AppError);
  if (!(error instanceof AppError)) throw new Error("Expected a structured domain error");
  for (const { locale, messages } of catalogs) {
    const errors: string[] = [];
    const t = createTranslator<Record<string, string>>({ locale, messages: messages as Record<string, string>, onError: (cause) => errors.push(cause.message) });
    const values = { ...error.values };
    if (values.provider === "deepseek" || values.provider === "bailian") {
      values.provider = t(`Models.providers.${values.provider}`);
    }
    expect(t.has(error.code), `${locale}:${error.code}`).toBe(true);
    expect(t(error.code, values)).not.toBe(error.code);
    expect(errors, `${locale}:${error.code}`).toEqual([]);
  }
}

describe("dynamic domain error translation mappings", () => {
  const options = { topic: "日常", level: "N5", length: "short" } as const;

  for (const provider of ["deepseek", "bailian"] as const) {
    it.each([400, 401, 402, 403, 404, 429, 500])(`${provider} generation HTTP %i`, async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
      await assertTranslatedError(generateArticle({ ...options, provider }, "test-key"));
    });

    it.each([400, 401, 403, 404, 429, 500])(`${provider} connection HTTP %i`, async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
      await assertTranslatedError(fetchProviderModels(provider, "test-key"));
    });

    it(`${provider} response, empty response, and missing key errors`, async () => {
      await assertTranslatedError(generateArticle({ ...options, provider }, ""));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
      await assertTranslatedError(generateArticle({ ...options, provider }, "test-key"));
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: "" } }],
      }))));
      await assertTranslatedError(generateArticle({ ...options, provider }, "test-key"));
    });
  }
});
