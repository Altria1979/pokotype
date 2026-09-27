"use client";

import { useEffect } from "react";
import { defaultLocale, localizedPath } from "@/i18n/locales";

export default function Page() {
  const destination = localizedPath(defaultLocale, "/");
  useEffect(() => {
    // Static hosts without the Vercel redirect still open the Japanese home.
    window.location.replace(destination + window.location.search + window.location.hash);
  }, [destination]);
  return <noscript>
    <meta httpEquiv="refresh" content={`0;url=${destination}`} />
    <a href={destination} lang="ja">日本語</a>
  </noscript>;
}
