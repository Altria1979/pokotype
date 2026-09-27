"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BrowserAudio } from "@/lib/audio";

export function useBrowserAudio() {
  const t = useTranslations("Sound");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [notice, setNotice] = useState("");
  const [keyNotice, setKeyNotice] = useState("");
  const [audio] = useState(() => new BrowserAudio({ onVoices: setVoices, onNotice: setNotice, onKeyNotice: setKeyNotice, translateNotice: (code) => code }));
  useEffect(() => {
    audio.initialize();
    return () => audio.dispose();
  }, [audio]);
  const clearNotice = useCallback(() => setNotice(""), []);
  return { audio, voices, notice: notice ? t(notice) : "", keyNotice: keyNotice ? t(keyNotice) : "", clearNotice };
}
