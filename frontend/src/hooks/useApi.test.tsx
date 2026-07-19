import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useApi } from "./useApi";

interface TestPayload {
  value: string;
}

function okResponse(data: TestPayload): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: vi.fn().mockResolvedValue(data),
  } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Step 28 useApi Mock mode", () => {
  it("returns Mock data and updates state", async () => {
    const mockData = { value: "mock-result" };
    const { result } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test", { mockData, mockDelay: 0 }),
    );

    let returned: TestPayload | null = null;
    await act(async () => {
      returned = await result.current.execute();
    });

    expect(returned).toEqual(mockData);
    expect(result.current.data).toEqual(mockData);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("keeps loading true until the Mock delay completes", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test", {
        mockData: { value: "delayed" },
        mockDelay: 100,
      }),
    );

    let request!: Promise<TestPayload | null>;
    act(() => {
      request = result.current.execute();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(await request).toEqual({ value: "delayed" });
    expect(result.current.loading).toBe(false);
  });

  it("allows consecutive Mock calls to complete without aborting either", async () => {
    vi.useFakeTimers();
    const mockData = { value: "repeatable" };
    const { result } = renderHook(() =>
      useApi<TestPayload>("POST", "/api/test", { mockData, mockDelay: 50 }),
    );

    let first!: Promise<TestPayload | null>;
    let second!: Promise<TestPayload | null>;
    act(() => {
      first = result.current.execute();
      second = result.current.execute();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    await expect(first).resolves.toEqual(mockData);
    await expect(second).resolves.toEqual(mockData);
  });

  it("returns null without updating state after unmount", async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test", {
        mockData: { value: "late" },
        mockDelay: 100,
      }),
    );

    let request!: Promise<TestPayload | null>;
    act(() => {
      request = result.current.execute();
    });
    unmount();
    await vi.advanceTimersByTimeAsync(100);

    await expect(request).resolves.toBeNull();
  });

  it("resets data and error state", async () => {
    const { result } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test", {
        mockData: { value: "reset-me" },
        mockDelay: 0,
      }),
    );
    await act(async () => {
      await result.current.execute();
    });
    act(() => result.current.reset());

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

describe("Step 28 useApi real request mode", () => {
  it("returns a successful GET response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ value: "api" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test"),
    );

    let returned: TestPayload | null = null;
    await act(async () => {
      returned = await result.current.execute();
    });

    expect(returned).toEqual({ value: "api" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("serializes a POST body as JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ value: "saved" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useApi<TestPayload, { description: string }>("POST", "/api/test"),
    );

    await act(async () => {
      await result.current.execute({ description: "测试 Agent" });
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ description: "测试 Agent" }),
      }),
    );
  });

  it("exposes non-2xx responses as errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Unavailable",
      text: vi.fn().mockResolvedValue("backend down"),
    }));
    const { result } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test"),
    );

    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toContain("503 Unavailable");
    expect(result.current.error).toContain("backend down");
  });

  it("aborts the previous real request when a new one starts", async () => {
    const firstFetch = vi.fn((_url: string, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      }),
    );
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(firstFetch)
      .mockResolvedValueOnce(okResponse({ value: "latest" }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useApi<TestPayload>("GET", "/api/test"),
    );

    let first!: Promise<TestPayload | null>;
    act(() => {
      first = result.current.execute();
    });
    let second: TestPayload | null = null;
    await act(async () => {
      second = await result.current.execute();
    });

    await expect(first).resolves.toBeNull();
    expect(second).toEqual({ value: "latest" });
    expect(result.current.data).toEqual({ value: "latest" });
  });
});
