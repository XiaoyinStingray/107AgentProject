/**
 * 统一 HTTP 客户端。
 * 所有 API 调用走此模块——不直接写 fetch。
 * Vite proxy 将 /api/* 转发到 localhost:8000。
 */

const BASE = "/api";

class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, detail: string, code?: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

interface ParsedApiError {
  message: string;
  code?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 兼容新的结构化错误和 FastAPI 既有 detail 错误。 */
export function parseApiErrorBody(
  text: string,
  fallback: string,
): ParsedApiError {
  try {
    const payload: unknown = JSON.parse(text);
    if (!isRecord(payload)) {
      return { message: text || fallback };
    }

    const code =
      typeof payload.error === "string" ? payload.error : undefined;
    if (typeof payload.message === "string") {
      return { message: payload.message, code };
    }

    const detail = payload.detail;
    if (typeof detail === "string") {
      return { message: detail, code };
    }
    if (isRecord(detail) && typeof detail.message === "string") {
      return { message: detail.message, code };
    }
    return { message: text || fallback, code };
  } catch {
    return { message: text || fallback };
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      0,
      "无法连接后端服务，请确认后端已经启动",
      "backend_unavailable",
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const parsed = parseApiErrorBody(text, `请求失败 (${res.status})`);
    throw new ApiError(res.status, parsed.message, parsed.code);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const client = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export { ApiError };
