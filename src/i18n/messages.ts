import type { AbstractIntlMessages } from "next-intl";
import type { Locale } from "./locales";

const loaders = {
  "zh-CN": () => import("./messages/zh-CN"),
  en: () => import("./messages/en"),
  ja: () => import("./messages/ja"),
};

export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  return (await loaders[locale]()).default;
}
