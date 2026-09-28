import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "../globals.css";
export const metadata: Metadata = { title: "Pokotype", robots: { index: false, follow: true } };
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}<Analytics /><SpeedInsights /></body></html>;
}
