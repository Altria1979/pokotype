import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale } from "./locales";
import { loadMessages } from "./messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : defaultLocale;
  return { locale, messages: await loadMessages(locale), timeZone: "UTC" };
});
