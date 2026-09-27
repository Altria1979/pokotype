import { afterEach, describe, expect, it, vi } from "vitest";
import { AiConnectionError, fetchProviderModels } from "./ai-connection";
import { type AiProvider } from "./ai-models";

function mockResponse(body: unknown, status = 200) {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, response };
}

function mockPending() {
  const fetchMock = vi.fn((_url: string, init: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(new DOMException("private-network-detail", "AbortError"));
      }, { once: true });
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("provider model connection check", () => {
  it.each([
    ["deepseek", "deepseek-flash", "https://api.deepseek.com/models"],
    ["bailian", "qwen3.8-flash", "https://dashscope.aliyuncs.com/compatible-mode/v1/models"],
  ] as const)("checks %s once using only its official endpoint", async (provider, model, endpoint) => {
    const { fetchMock } = mockResponse({ data: [{ id: model }] });
    await expect(fetchProviderModels(provider, " test-only-credential ")).resolves.toEqual([model]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer test-only-credential",
      },
    });
    expect(init.body).toBeUndefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("filters invalid entries and duplicate IDs while preserving provider order", async () => {
    mockResponse({ data: [
      { id: "qwen3.8-flash", privateMetadata: "not-returned" },
      { id: "qwen3.7-flash" },
      { id: "qwen3.8-flash" },
      { id: "custom:model_1-2026.09" },
      { id: "" },
      { id: "https://untrusted.invalid/models" },
      { id: "sk-test-secret" },
      { id: "model\n" },
      { id: "x".repeat(129) },
      { id: 42 },
      { id: null },
      { model: "qwen3.7-flash" },
      "bare-model",
      [{ id: "array-model" }],
      null,
    ] });
    await expect(fetchProviderModels("bailian", "test-only-credential")).resolves.toEqual([
      "qwen3.8-flash", "qwen3.7-flash", "custom:model_1-2026.09",
    ]);
  });

  it.each([
    null,
    [],
    {},
    { data: null },
    { data: "invalid" },
    { data: {} },
  ])("rejects a malformed model list without echoing the payload: %j", async (payload) => {
    const { fetchMock } = mockResponse(payload);
    await expect(fetchProviderModels("bailian", "test-only-credential"))
      .rejects.toThrow("阿里百炼 返回了无效的模型列表");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { data: [] },
    { data: [{ id: "sk-test-secret" }, null, { id: "" }] },
  ])("rejects empty or fully unusable model lists: %j", async (payload) => {
    mockResponse(payload);
    await expect(fetchProviderModels("deepseek", "test-only-credential"))
      .rejects.toThrow("DeepSeek 未返回可用的模型");
  });

  it("rejects invalid JSON without exposing its content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-raw-body")));
    const error = await fetchProviderModels("deepseek", "test-only-credential").catch((cause) => cause);
    expect(error).toBeInstanceOf(AiConnectionError);
    expect(error.message).toContain("DeepSeek 返回了无效的模型列表");
    expect(error.message).not.toContain("private-raw-body");
  });

  it.each([
    [401, "密钥无效"],
    [403, "访问权限"],
    [404, "接口暂不可用"],
    [429, "过于频繁"],
    [500, "服务暂时异常"],
    [503, "服务暂时异常"],
    [400, "HTTP 400"],
    [402, "HTTP 402"],
    [302, "HTTP 302"],
  ] as const)("handles HTTP %i once without reading or echoing response details", async (status, expected) => {
    const { fetchMock, response } = mockResponse({ error: "test-only-credential private-body" }, status);
    const json = vi.spyOn(response, "json");
    const error = await fetchProviderModels("bailian", "test-only-credential").catch((cause) => cause);
    expect(error).toBeInstanceOf(AiConnectionError);
    expect(error.message).toContain("阿里百炼");
    expect(error.message).toContain(expected);
    expect(error.message).not.toMatch(/test-only-credential|private-body|DeepSeek/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(json).not.toHaveBeenCalled();
  });

  it.each(["deepseek", "bailian"] as const)("sanitizes network errors for %s", async (provider) => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("private-network-error test-only-credential"));
    vi.stubGlobal("fetch", fetchMock);
    const error = await fetchProviderModels(provider, "test-only-credential").catch((cause) => cause);
    expect(error.message).toContain(provider === "deepseek" ? "DeepSeek" : "阿里百炼");
    expect(error.message).toContain("网络连接失败");
    expect(error.message).not.toMatch(/private-network-error|test-only-credential/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["unknown", "https://untrusted.invalid", "__proto__", "constructor", "", null])(
    "rejects invalid provider %s before sending any credentials",
    async (provider) => {
      const { fetchMock } = mockResponse({ data: [{ id: "model" }] });
      await expect(fetchProviderModels(provider as AiProvider, "test-only-credential"))
        .rejects.toThrow("有效的 AI 服务");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["deepseek", "bailian"] as const)("rejects missing %s credentials before fetching", async (provider) => {
    const { fetchMock } = mockResponse({ data: [{ id: "model" }] });
    for (const key of ["", " \n ", null, undefined]) {
      await expect(fetchProviderModels(provider, key as string))
        .rejects.toThrow(provider === "deepseek" ? "DeepSeek" : "阿里百炼");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("connection check cancellation and cleanup", () => {
  it("rejects an already cancelled check without fetching or adding a listener", async () => {
    vi.useFakeTimers();
    const fetchMock = mockPending();
    const signal = AbortSignal.abort();
    const addListener = vi.spyOn(signal, "addEventListener");
    await expect(fetchProviderModels("bailian", "test-only-credential", signal))
      .rejects.toThrow("阿里百炼 连接检查已取消");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(addListener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("forwards cancellation without retrying and removes its listener and timer", async () => {
    vi.useFakeTimers();
    const fetchMock = mockPending();
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, "addEventListener");
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const assertion = expect(fetchProviderModels("deepseek", "test-only-credential", controller.signal))
      .rejects.toThrow("DeepSeek 连接检查已取消");
    controller.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", addListener.mock.calls[0][1]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts at 20 seconds and cleans up without retrying", async () => {
    vi.useFakeTimers();
    const fetchMock = mockPending();
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    const assertion = expect(fetchProviderModels("bailian", "test-only-credential", controller.signal))
      .rejects.toThrow("阿里百炼 连接检查超过 20 秒");
    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["success", "http-error", "invalid-json", "invalid-payload", "network-error"] as const)(
    "cleans up after %s without leaving a caller abort listener",
    async (outcome) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const addListener = vi.spyOn(controller.signal, "addEventListener");
      const removeListener = vi.spyOn(controller.signal, "removeEventListener");
      if (outcome === "success") mockResponse({ data: [{ id: "deepseek-flash" }] });
      else if (outcome === "http-error") mockResponse({}, 401);
      else if (outcome === "invalid-json") vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid")));
      else if (outcome === "invalid-payload") mockResponse({ data: [] });
      else vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-network-error")));
      const result = fetchProviderModels("deepseek", "test-only-credential", controller.signal);
      if (outcome === "success") await expect(result).resolves.toEqual(["deepseek-flash"]);
      else await expect(result).rejects.toBeInstanceOf(AiConnectionError);
      expect(removeListener).toHaveBeenCalledWith("abort", addListener.mock.calls[0][1]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("does not return a late model list after cancellation during JSON parsing", async () => {
    const controller = new AbortController();
    let resolvePayload: (payload: unknown) => void = () => {};
    const response = {
      ok: true,
      json: vi.fn(() => new Promise<unknown>((resolve) => { resolvePayload = resolve; })),
    };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(fetchProviderModels("bailian", "test-only-credential", controller.signal))
      .rejects.toThrow("阿里百炼 连接检查已取消");
    await Promise.resolve();
    expect(response.json).toHaveBeenCalledTimes(1);
    controller.abort();
    resolvePayload({ data: [{ id: "qwen3.8-flash" }] });
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
