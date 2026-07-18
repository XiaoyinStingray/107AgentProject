import { useState, useCallback, useRef } from "react";

/* ================================================================
   useApi — 通用 fetch 封装 + Mock 拦截

   设计目标：
   - 手动触发（execute），不做自动请求
   - Mock 模式：传入 mockData → 模拟延迟后返回，不调真 API
   - API 模式：不传 mockData → 走 fetch → Vite proxy → FastAPI
   - 所有后续前端 Step 共用此 hook
   ================================================================ */

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<TResponse, TBody = void> {
  data: TResponse | null;
  loading: boolean;
  error: string | null;
  /** 手动触发请求。GET 不传 body，POST/PUT 传 body */
  execute: (body?: TBody) => Promise<TResponse | null>;
  /** 重置状态（清空 data/error，保留 loading=false） */
  reset: () => void;
}

interface UseApiOptions<TResponse> {
  /** Mock 模式下返回的预设数据 */
  mockData?: TResponse;
  /** Mock 模式模拟延迟（ms），默认 1500 */
  mockDelay?: number;
}

export function useApi<TResponse, TBody = void>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  options?: UseApiOptions<TResponse>,
): UseApiReturn<TResponse, TBody> {
  const [state, setState] = useState<UseApiState<TResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  // 防止组件卸载后 setState（React 18 StrictMode 下无实际风险，但好习惯）
  const mountedRef = useRef(true);
  const cancelRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const execute = useCallback(
    async (body?: TBody): Promise<TResponse | null> => {
      // 取消上一次请求（防竞态）
      cancelRef.current?.abort();
      const controller = new AbortController();
      cancelRef.current = controller;

      setState((s) => ({ ...s, loading: true, error: null }));

      // === Mock 模式 ===
      if (options?.mockData !== undefined) {
        const delay = options.mockDelay ?? 1500;
        await new Promise((r) => setTimeout(r, delay));

        if (!mountedRef.current || controller.signal.aborted) return null;

        setState({ data: options.mockData, loading: false, error: null });
        return options.mockData;
      }

      // === 真 API 模式 ===
      try {
        const fetchOptions: RequestInit = {
          method,
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
        };
        if (method !== "GET" && method !== "DELETE" && body !== undefined) {
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(url, fetchOptions);

        if (!res.ok) {
          const errorText = await res.text().catch(() => "Unknown error");
          throw new Error(`${res.status} ${res.statusText}: ${errorText}`);
        }

        const json: TResponse = await res.json();

        if (!mountedRef.current || controller.signal.aborted) return null;

        setState({ data: json, loading: false, error: null });
        return json;
      } catch (err: unknown) {
        if (!mountedRef.current || controller.signal.aborted) return null;

        const message =
          err instanceof Error ? err.message : "Unknown error";
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    [method, url, options?.mockData, options?.mockDelay],
  );

  return { ...state, execute, reset };
}
