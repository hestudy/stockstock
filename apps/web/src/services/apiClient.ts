export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/v1";

export class ApiClientError extends Error {
  code?: string;
  status: number;
  requestId?: string;

  constructor(init: { message?: string; code?: string; status: number; requestId?: string }) {
    super(init.message ?? `HTTP ${init.status}`);
    this.name = "ApiClientError";
    this.code = init.code;
    this.status = init.status;
    this.requestId = init.requestId;
  }
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {}
    const errorBody = (payload as any)?.error || payload || {};
    const message = typeof errorBody?.message === "string" ? errorBody.message : undefined;
    const code = typeof errorBody?.code === "string" ? errorBody.code : undefined;
    const requestId = typeof errorBody?.requestId === "string" ? errorBody.requestId : undefined;
    throw new ApiClientError({
      message: message ?? `HTTP ${res.status}`,
      code,
      status: res.status,
      requestId,
    });
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => http<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) => {
    const init: RequestInit = { method: "POST" };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    return http<T>(path, init);
  },
};
