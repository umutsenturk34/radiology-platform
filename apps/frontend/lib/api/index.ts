import { ApiClient, ApiClientError } from "./client";
import { ApiErrorCode } from "@radiology/shared";

function getApiBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new ApiClientError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      "Frontend API adresi yapılandırılmadı. Dev server'ı yeniden başlatın.",
    );
  }

  return baseUrl;
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
