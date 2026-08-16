import { ApiClient } from "./client";

function getApiBaseUrl() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_API_URL yapılandırılmadı.");
  }

  return baseUrl;
}

/**
 * Uygulamadaki tek HTTP istemcisi. Access token yalnızca bellek içinde tutulur;
 * refresh token HttpOnly cookie olarak tarayıcı tarafından yönetilir.
 */
export const apiClient = new ApiClient({
  baseUrl: getApiBaseUrl(),
});

export * from "./client";
