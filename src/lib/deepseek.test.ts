import { afterEach, describe, expect, it, vi } from "vitest";
import { generateArticle, type GenerateOptions } from "./deepseek";

const options: GenerateOptions = {
  topic: "日常",
  level: "N5",
  length: "short",
};
const article = {
  title: "朝",
  sentences: [
    {
      translation: "早上好。",
      segments: [{ text: "おはよう。", reading: "おはよう。" }],
    },
  ],
};
const responseBody = (
  content = JSON.stringify(article),
  finish_reason = "stop",
) => ({ choices: [{ finish_reason, message: { content } }] });

function mockResponse(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockPending() {
  const fetchMock = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
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

describe("DeepSeek generation", () => {
  it.each([
    ["deepseek", "deepseek-flash", "https://api.deepseek.com/chat/completions"],
    ["deepseek", "deepseek-v4-flash", "https://api.deepseek.com/chat/completions"],
    ["deepseek", "custom-deepseek-model", "https://api.deepseek.com/chat/completions"],
    ["bailian", "qwen3.7-flash", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"],
    ["bailian", "qwen3.8-flash", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"],
    ["bailian", "custom-qwen-model", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"],
  ] as const)("routes %s / %s only to its official endpoint", async (provider, model, endpoint) => {
    const fetchMock = mockResponse(responseBody());
    await generateArticle({ ...options, provider, model }, "test-provider-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({
      redirect: "error",
      credentials: "omit",
      headers: { Authorization: "Bearer test-provider-key" },
    });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model, stream: false, response_format: { type: "json_object" } });
    if (provider === "bailian") {
      expect(body.enable_thinking).toBe(false);
      expect(body).not.toHaveProperty("thinking");
    } else {
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body).not.toHaveProperty("enable_thinking");
    }
  });

  it("uses the selected provider default when no model is given", async () => {
    const fetchMock = mockResponse(responseBody());
    await generateArticle({ ...options, provider: "bailian" }, "test-provider-key");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe("qwen3.8-flash");
  });

  it.each([
    { provider: "__proto__" },
    { provider: "https://untrusted.example" },
    { provider: null },
    { model: "" },
    { model: null },
    { model: "qwen3.8-flash\n" },
    { model: "https://untrusted.example" },
    { model: "sk-test-secret" },
    { model: "x".repeat(129) },
  ])("rejects invalid AI selection before sending credentials: %j", async (invalid) => {
    const fetchMock = mockResponse(responseBody());
    await expect(generateArticle({ ...options, ...invalid } as GenerateOptions, "test-provider-key"))
      .rejects.toThrow(/AI 服务|模型 ID/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([401, 402, 403, 404, 500])("reports Bailian HTTP %i safely without falling back or retrying", async (status) => {
    const fetchMock = mockResponse({ error: { message: "test-provider-key" } }, status);
    const error = await generateArticle({ ...options, provider: "bailian" }, "test-provider-key").catch((cause) => cause);
    expect(error.message).toContain("阿里百炼");
    expect(error.message).not.toContain("test-provider-key");
    expect(error.message).not.toContain("DeepSeek");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send missing Bailian credentials", async () => {
    const fetchMock = mockResponse(responseBody());
    await expect(generateArticle({ ...options, provider: "bailian" }, " "))
      .rejects.toThrow("阿里百炼");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("makes one direct JSON request and validates the returned article", async () => {
    const fetchMock = mockResponse(responseBody());
    const result = await generateArticle(options, "test-placeholder");
    expect(result).toMatchObject({
      ...article,
      level: "N5",
      topic: "日常",
      source: "ai",
    });
    expect(result.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(result.createdAt))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init).toMatchObject({
      method: "POST",
      redirect: "error",
      credentials: "omit",
      headers: { Authorization: "Bearer test-placeholder" },
    });
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "deepseek-flash",
      stream: false,
      response_format: { type: "json_object" },
    });
    expect(body.messages[0].content).toContain("JSON");
    expect(body.messages[1].content).toContain("100–200");
    expect(JSON.stringify(result)).not.toContain("test-placeholder");
  });

  it.each([
    [401, "密钥无效"],
    [402, "余额不足"],
    [403, "访问权限"],
    [429, "过于频繁"],
    [500, "服务暂时异常"],
    [503, "服务暂时异常"],
    [400, "HTTP 400"],
  ])(
    "handles HTTP %i without retries or echoing response details",
    async (status, expected) => {
      const fetchMock = mockResponse(
        { error: "sensitive-detail" },
        Number(status),
      );
      await expect(
        generateArticle(options, "test-placeholder"),
      ).rejects.toThrow(String(expected));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [responseBody("", "stop"), "空内容"],
    [responseBody("{}", "length"), "截断"],
    [responseBody("{}", "content_filter"), "未正常"],
    [responseBody("not-json"), "JSON 格式"],
    [responseBody("{}"), "校验失败"],
    [{ choices: [] }, "无效响应"],
  ])("rejects unusable API responses", async (body, message) => {
    mockResponse(body);
    await expect(generateArticle(options, "test-placeholder")).rejects.toThrow(
      String(message),
    );
  });

  it("reports invalid outer JSON separately", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    await expect(generateArticle(options, "test-placeholder")).rejects.toThrow(
      "无效响应",
    );
  });

  it("does not echo raw fetch exceptions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("test-placeholder")),
    );
    await expect(generateArticle(options, "test-placeholder")).rejects.toThrow(
      "网络连接失败",
    );
  });

  it("rejects missing credentials and invalid options without a request", async () => {
    const fetchMock = mockResponse(responseBody());
    await expect(generateArticle(options, " ")).rejects.toThrow("填写自己的");
    await expect(
      generateArticle({ ...options, level: "N6" }, "test-placeholder"),
    ).rejects.toThrow("有效的");
    await expect(
      generateArticle({ ...options, topic: " " }, "test-placeholder"),
    ).rejects.toThrow("有效的");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles cancellation before sending and during a request", async () => {
    const fetchMock = mockPending();
    const alreadyCancelled = AbortSignal.abort();
    await expect(
      generateArticle(options, "test-placeholder", alreadyCancelled),
    ).rejects.toThrow("取消");
    expect(fetchMock).not.toHaveBeenCalled();
    const controller = new AbortController();
    const promise = generateArticle(
      options,
      "test-placeholder",
      controller.signal,
    );
    const assertion = expect(promise).rejects.toThrow("取消");
    controller.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops the request after 90 seconds and clears its timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = mockPending();
    const assertion = expect(
      generateArticle(options, "test-placeholder"),
    ).rejects.toThrow("90 秒");
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up abort listeners and timers after success", async () => {
    vi.useFakeTimers();
    mockResponse(responseBody());
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, "removeEventListener");
    await generateArticle(options, "test-placeholder", controller.signal);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
