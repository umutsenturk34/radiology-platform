import {
  ApiErrorCode,
  isApiErrorResponse,
  type ApiError,
  type ApiResponse,
  type PaginatedResponse,
} from "@radiology/shared";

const REFRESH_PATH = "/auth/refresh";

export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiError["code"],
    message: string,
    public readonly status?: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetchFn?: typeof fetch;
}

export interface ApiRequestOptions {
  body?: BodyInit;
  headers?: HeadersInit;
  retryAfterRefresh?: boolean;
  signal?: AbortSignal;
}

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function buildUrl(baseUrl: string, path: string) {
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return undefined;
  }

  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function errorFromResponse(response: Response, body: unknown) {
  if (isApiErrorResponse(body)) {
    return new ApiClientError(
      body.error.code,
      body.error.message,
      response.status,
      body.error.details,
    );
  }

  return new ApiClientError(
    response.status === 401 ? ApiErrorCode.UNAUTHORIZED : ApiErrorCode.SERVICE_UNAVAILABLE,
    "Sunucudan beklenmeyen bir hata yanıtı alındı.",
    response.status,
  );
}

function unwrapResponse<T>(body: unknown): T {
  if (typeof body !== "object" || body === null || !("data" in body)) {
    throw new ApiClientError(
      ApiErrorCode.INTERNAL_ERROR,
      "Sunucu yanıtı API sözleşmesindeki data zarfını içermiyor.",
    );
  }

  return (body as ApiResponse<T>).data;
}

function unwrapPaginatedResponse<T>(body: unknown): PaginatedResponse<T> {
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !("meta" in body) ||
    !Array.isArray((body as { data: unknown }).data)
  ) {
    throw new ApiClientError(ApiErrorCode.INTERNAL_ERROR, "Sunucu yanıtı liste API sözleşmesiyle uyumlu değil.");
  }

  return body as PaginatedResponse<T>;
}

export class ApiClient {
  private accessToken?: string;
  private refreshInFlight?: Promise<boolean>;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor({ baseUrl, fetchFn }: ApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    // `fetch` is a Web API method. Bind the native implementation before it is
    // invoked through this client instance so browsers receive the global
    // context they expect instead of the ApiClient instance as `this`.
    this.fetchFn = fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  setAccessToken(accessToken?: string) {
    this.accessToken = accessToken;
  }

  clearAccessToken() {
    this.accessToken = undefined;
  }

  getAccessToken() {
    return this.accessToken;
  }

  get<T>(path: string, options?: Omit<ApiRequestOptions, "body">) {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  getPaginated<T>(path: string, options?: Omit<ApiRequestOptions, "body">) {
    return this.performRequest<PaginatedResponse<T>>(
      path,
      { ...options, method: "GET" },
      options?.retryAfterRefresh ?? true,
      unwrapPaginatedResponse<T>,
    );
  }

  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "body">) {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? options?.headers : { "content-type": "application/json", ...options?.headers },
    });
  }

  put<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, "body">) {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: body === undefined ? options?.headers : { "content-type": "application/json", ...options?.headers },
    });
  }

  async request<T>(
    path: string,
    options: ApiRequestOptions & { method: string },
  ): Promise<T> {
    return this.performRequest<T>(path, options, options.retryAfterRefresh ?? true);
  }

  private async performRequest<T>(
    path: string,
    options: ApiRequestOptions & { method: string },
    retryAfterRefresh: boolean,
    unwrap: (body: unknown) => T = unwrapResponse<T>,
  ): Promise<T> {
    let response: Response;

    try {
      const headers = new Headers(options.headers);
      if (this.accessToken) {
        headers.set("authorization", `Bearer ${this.accessToken}`);
      }

      response = await this.fetchFn(buildUrl(this.baseUrl, path), {
        method: options.method,
        body: options.body,
        headers,
        signal: options.signal,
        credentials: "include",
      });
    } catch {
      throw new ApiClientError(
        ApiErrorCode.SERVICE_UNAVAILABLE,
        "API sunucusuna ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.",
      );
    }

    const body = await readBody(response);

    if (!response.ok) {
      if (response.status === 401 && retryAfterRefresh && path !== REFRESH_PATH) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.performRequest<T>(path, options, false, unwrap);
        }
      }

      throw errorFromResponse(response, body);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return unwrap(body);
  }

  private async refreshAccessToken() {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = undefined;
      });
    }

    return this.refreshInFlight;
  }

  private async performRefresh() {
    try {
      const response = await this.fetchFn(buildUrl(this.baseUrl, REFRESH_PATH), {
        method: "POST",
        credentials: "include",
      });
      const body = await readBody(response);

      if (!response.ok) {
        this.clearAccessToken();
        return false;
      }

      const refresh = unwrapResponse<RefreshResponse>(body);
      if (typeof refresh.accessToken !== "string" || refresh.accessToken.length === 0) {
        this.clearAccessToken();
        return false;
      }

      this.setAccessToken(refresh.accessToken);
      return true;
    } catch {
      this.clearAccessToken();
      return false;
    }
  }
}
