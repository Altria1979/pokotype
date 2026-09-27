import type { Metadata } from "next";
import "../globals.css";
export const metadata: Metadata = { title: "Pokotype", robots: { index: false, follow: true } };
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
