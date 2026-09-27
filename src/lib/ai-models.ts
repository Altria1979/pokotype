export const AI_PROVIDERS = {
  deepseek: {
    name: "DeepSeek",
    endpoint: "https://api.deepseek.com/chat/completions",
    keyUrl: "https://platform.deepseek.com/api_keys",
    defaultModel: "deepseek-flash",
    models: [
      { id: "deepseek-flash", name: "DeepSeek V4.1 Flash" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash（兼容别名）" },
    ],
  },
  bailian: {
    name: "阿里百炼",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    keyUrl: "https://bailian.console.aliyun.com/cn-beijing/?tab=app#/api-key",
    defaultModel: "qwen3.8-flash",
    models: [
      { id: "qwen3.8-flash", name: "Qwen3.8 Flash" },
      { id: "qwen3.7-flash", name: "Qwen3.7 Flash" },
    ],
  },
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;
export type AiSettings = {
  provider: AiProvider;
  models: Record<AiProvider, string>;
};

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === "string" && Object.hasOwn(AI_PROVIDERS, value);
}

export function isValidModelId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value) &&
    !/^sk-/i.test(value);
}

export function defaultAiSettings(): AiSettings {
  return {
    provider: "deepseek",
    models: {
      deepseek: AI_PROVIDERS.deepseek.defaultModel,
      bailian: AI_PROVIDERS.bailian.defaultModel,
    },
  };
}
