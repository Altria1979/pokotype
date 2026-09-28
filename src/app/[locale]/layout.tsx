import { NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales, isLocale } from "@/i18n/locales";
import { loadMessages } from "@/i18n/messages";
import { LocaleGuard } from "@/components/LocaleGuard";
import { Shell } from "@/components/Shell";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";

export const dynamicParams = false;
export function generateStaticParams() { return locales.map((locale) => ({ locale })); }
export default async function LocaleLayout({ children, params }: {
  children: React.ReactNode; params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await loadMessages(locale);
  return <html lang={locale}><body>
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <LocaleGuard><Shell>{children}</Shell></LocaleGuard>
    </NextIntlClientProvider>
    <Analytics />
    <SpeedInsights />
  </body></html>;
}
