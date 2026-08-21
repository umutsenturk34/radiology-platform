import { ApiClient } from "./client";

function getApiBaseUrl() {
  // Browser requests stay same-origin. Next.js rewrites this path to the real
  // API URL, which is configured server-side with API_URL (or the existing
  // NEXT_PUBLIC_API_URL compatibility fallback).
  return "/api/v1";
}

/**
 * Uygulamadaki tek HTTP istemcisi. Access token yalnızca bellek içinde tutulur;
 * refresh token HttpOnly cookie olarak tarayıcı tarafından yönetilir.
 */
let apiClient: ApiClient | undefined;

export function getApiClient() {
  apiClient ??= new ApiClient({ baseUrl: getApiBaseUrl() });
  return apiClient;
}

export * from "./client";
