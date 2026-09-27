import { useCallback } from "react";
import { useTranslations } from "next-intl";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    fallbackMessage: string,
    public readonly values: Record<string, string | number> = {},
  ) {
    super(fallbackMessage);
    this.name = "AppError";
  }
}

export function useErrorMessage() {
  const t = useTranslations();
  return useCallback((error: unknown, fallbackKey: string): string => {
    if (error instanceof AppError && t.has(error.code)) {
      const values = { ...error.values };
      if (values.provider === "deepseek" || values.provider === "bailian") {
        values.provider = t(`Models.providers.${values.provider}`);
      }
      return t(error.code, values);
    }
    return t(fallbackKey);
  }, [t]);
}
