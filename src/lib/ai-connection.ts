import { AppError } from "../i18n/errors";
import {
  AI_PROVIDERS,
  isAiProvider,
  isValidModelId,
  type AiProvider,
} from "./ai-models";

const MODEL_ENDPOINTS: Record<AiProvider, string> = {
  deepseek: "https://api.deepseek.com/models",
  bailian: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
};

export class AiConnectionError extends AppError {}

function statusCode(status: number): string {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "notFound";
  if (status === 429) return "rateLimited";
  if (status >= 500) return "service";
  return "http";
}

function statusMessage(status: number, provider: string): string {
  if (status === 401) return `${provider} 密钥无效或已失效，请检查密钥及所属地域。`;
  if (status === 403) return `${provider} 密钥没有访问权限，请检查账户权限。`;
  if (status === 404) return `${provider} 模型列表接口暂不可用，请稍后重试。`;
  if (status === 429) return `${provider} 请求过于频繁，请稍后手动重试。`;
  if (status >= 500) return `${provider} 服务暂时异常，请稍后手动重试。`;
  return `${provider} 连接检查未被接受（HTTP ${status}），请检查设置后重试。`;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function modelIds(payload: unknown, provider: AiProvider): string[] {
  const name = AI_PROVIDERS[provider].name;
  if (!object(payload) || !Array.isArray(payload.data)) {
    throw new AiConnectionError("ConnectionErrors.invalidList", `${name} 返回了无效的模型列表，请稍后重试。`, { provider });
  }
  const ids = [...new Set(payload.data.flatMap((entry: unknown) =>
    object(entry) && isValidModelId(entry.id) ? [entry.id] : [],
  ))];
  if (ids.length === 0) {
    throw new AiConnectionError("ConnectionErrors.emptyList", `${name} 未返回可用的模型，请检查账户及模型权限。`, { provider });
  }
  return ids;
}

/** One explicit connection check; never stores credentials or retries the request. */
export async function fetchProviderModels(
  provider: AiProvider,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (!isAiProvider(provider)) throw new AiConnectionError("ConnectionErrors.invalidProvider", "请选择有效的 AI 服务。");
  const name = AI_PROVIDERS[provider].name;
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new AiConnectionError("ConnectionErrors.missingKey", `请先填写自己的 ${name} API 密钥。`, { provider });
  }
  if (signal?.aborted) throw new AiConnectionError("ConnectionErrors.cancelled", `${name} 连接检查已取消。`, { provider });

  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 20_000);

  try {
    const response = await fetch(MODEL_ENDPOINTS[provider], {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });
    if (!response.ok) throw new AiConnectionError(`ConnectionErrors.${statusCode(response.status)}`, statusMessage(response.status, name), { provider, status: response.status });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new AiConnectionError("ConnectionErrors.invalidList", `${name} 返回了无效的模型列表，请稍后重试。`, { provider });
    }
    if (controller.signal.aborted) throw new AiConnectionError("ConnectionErrors.cancelled", `${name} 连接检查已取消。`, { provider });
    return modelIds(payload, provider);
  } catch (error) {
    if (timedOut) throw new AiConnectionError("ConnectionErrors.timeout", `${name} 连接检查超过 20 秒，已停止等待，请稍后重试。`, { provider });
    if (controller.signal.aborted) throw new AiConnectionError("ConnectionErrors.cancelled", `${name} 连接检查已取消。`, { provider });
    if (error instanceof AiConnectionError) throw error;
    throw new AiConnectionError("ConnectionErrors.network", `${name} 网络连接失败，请检查网络及浏览器跨域访问限制后重试。`, { provider });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
