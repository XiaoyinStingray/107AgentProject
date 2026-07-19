import { useState, useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

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

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
type ApiStateSetter<T> = Dispatch<SetStateAction<UseApiState<T>>>;

interface ExecuteApiArgs<TResponse, TBody> {
  method: HttpMethod;
  url: string;
  body?: TBody;
  options?: UseApiOptions<TResponse>;
  mountedRef: MutableRefObject<boolean>;
  cancelRef: MutableRefObject<AbortController | null>;
  setState: ApiStateSetter<TResponse>;
}

async function requestJson<TResponse, TBody>(
  method: HttpMethod,
  url: string,
  body: TBody | undefined,
  controller: AbortController,
): Promise<TResponse> {
  const fetchOptions: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
  };
  if (method !== "GET" && method !== "DELETE" && body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) {
    const detail = await response.text().catch(() => "Unknown error");
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return response.json() as Promise<TResponse>;
}

async function executeApi<TResponse, TBody>({
  method,
  url,
  body,
  options,
  mountedRef,
  cancelRef,
  setState,
}: ExecuteApiArgs<TResponse, TBody>): Promise<TResponse | null> {
  setState((state) => ({ ...state, loading: true, error: null }));

  if (options?.mockData !== undefined) {
    await new Promise((resolve) => setTimeout(resolve, options.mockDelay ?? 1500));
    if (!mountedRef.current) return null;
    setState({ data: options.mockData, loading: false, error: null });
    return options.mockData;
  }

  const controller = new AbortController();
  cancelRef.current?.abort();
  cancelRef.current = controller;
  try {
    const data = await requestJson<TResponse, TBody>(method, url, body, controller);
    if (!mountedRef.current || controller.signal.aborted) return null;
    setState({ data, loading: false, error: null });
    return data;
  } catch (error: unknown) {
    if (!mountedRef.current || controller.signal.aborted) return null;
    const message = error instanceof Error ? error.message : "Unknown error";
    setState({ data: null, loading: false, error: message });
    return null;
  } finally {
    if (cancelRef.current === controller) cancelRef.current = null;
  }
}

function useRequestLifecycle() {
  const mountedRef = useRef(true);
  const cancelRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current?.abort();
      cancelRef.current = null;
    };
  }, []);

  return { mountedRef, cancelRef };
}

export function useApi<TResponse, TBody = void>(
  method: HttpMethod,
  url: string,
  options?: UseApiOptions<TResponse>,
): UseApiReturn<TResponse, TBody> {
  const [state, setState] = useState<UseApiState<TResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const { mountedRef, cancelRef } = useRequestLifecycle();

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  const execute = useCallback(
    (body?: TBody) => executeApi({
      method,
      url,
      body,
      options,
      mountedRef,
      cancelRef,
      setState,
    }),
    [method, url, options?.mockData, options?.mockDelay],
  );

  return { ...state, execute, reset };
}
