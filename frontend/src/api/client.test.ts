import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, client, parseApiErrorBody } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseApiErrorBody", () => {
  it("reads the structured LLM error response", () => {
    expect(
      parseApiErrorBody(
        JSON.stringify({
          error: "invalid_api_key",
          message: "LLM API Key 无效，请检查 .env 配置并重启后端",
        }),
        "请求失败",
      ),
    ).toEqual({
      code: "invalid_api_key",
      message: "LLM API Key 无效，请检查 .env 配置并重启后端",
    });
  });

  it("keeps compatibility with FastAPI detail errors", () => {
    expect(
      parseApiErrorBody(
        JSON.stringify({ detail: "Team 名称不能为空" }),
        "请求失败",
      ),
    ).toEqual({ message: "Team 名称不能为空" });
  });
});

describe("API client", () => {
  it("returns JSON for a successful request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: "ok" }),
      }),
    );

    await expect(client.get<{ status: string }>("/health")).resolves.toEqual({
      status: "ok",
    });
  });

  it("exposes a structured invalid-key message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () =>
          JSON.stringify({
            error: "invalid_api_key",
            message: "LLM API Key 无效，请检查 .env 配置并重启后端",
          }),
      }),
    );

    const error = await client.post("/agents", {
      description: "测试角色",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 401,
      code: "invalid_api_key",
      message: "LLM API Key 无效，请检查 .env 配置并重启后端",
    });
  });

  it("distinguishes a backend connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    const error = await client.get("/agents").catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      status: 0,
      code: "backend_unavailable",
      message: "无法连接后端服务，请确认后端已经启动",
    });
  });
});
