"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";

export type LocaleBlockReason = "practice" | "editing" | "generation" | "settings" | "checking" | "saving";
type Guard = { reasons: LocaleBlockReason[]; setBlock: (id: string, reason: LocaleBlockReason | null) => void };
const Context = createContext<Guard | null>(null);

export function LocaleGuard({ children }: { children: ReactNode }) {
  const [blocks, setBlocks] = useState<Record<string, LocaleBlockReason>>({});
  const setBlock = useCallback((id: string, reason: LocaleBlockReason | null) => {
    setBlocks((current) => {
      if ((current[id] ?? null) === reason) return current;
      const next = { ...current };
      if (reason) next[id] = reason;
      else delete next[id];
      return next;
    });
  }, []);
  const value = useMemo(() => ({ reasons: [...new Set(Object.values(blocks))], setBlock }), [blocks, setBlock]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocaleGuard() {
  const guard = useContext(Context);
  if (!guard) throw new Error("Missing LocaleGuard");
  return guard;
}

export function useLocaleBlock(reason: LocaleBlockReason, active: boolean) {
  const id = useId();
  const { setBlock } = useLocaleGuard();
  useEffect(() => {
    setBlock(id, active ? reason : null);
    return () => setBlock(id, null);
  }, [id, reason, active, setBlock]);
}
