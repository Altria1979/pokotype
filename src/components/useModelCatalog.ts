"use client";

import { useSyncExternalStore } from "react";
import { isAiProvider, type AiProvider } from "@/lib/ai-models";
import { API_KEY_EVENT, apiKeyStorageName } from "@/lib/storage";

// Only public model IDs live here. Credentials and verification results are never cached.
const catalogs: Record<AiProvider, readonly string[] | null> = { deepseek: null, bailian: null };
const listeners = new Set<() => void>();
let watchingCredentials = false;

export function publishModelCatalog(provider: AiProvider, models: readonly string[] | null) {
  if (models === null && catalogs[provider] === null) return;
  catalogs[provider] = models === null ? null : [...models];
  listeners.forEach((listener) => listener());
}

function onCredentialChange(event: Event) {
  if (event instanceof StorageEvent) {
    for (const provider of ["deepseek", "bailian"] as const) {
      if (event.key === null || event.key === apiKeyStorageName(provider)) publishModelCatalog(provider, null);
    }
  } else if (event instanceof CustomEvent && isAiProvider(event.detail?.provider)) {
    publishModelCatalog(event.detail.provider, null);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!watchingCredentials) {
    watchingCredentials = true;
    // One page-lifetime listener keeps the cache invalidated between route mounts.
    window.addEventListener("storage", onCredentialChange);
    window.addEventListener(API_KEY_EVENT, onCredentialChange);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function useModelCatalog(provider: AiProvider) {
  return useSyncExternalStore(subscribe, () => catalogs[provider], () => null);
}
