import { type UserRole, type UserStatus } from "@radiology/shared";

import { getApiClient } from "@/lib/api";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface CurrentUser extends AuthUser {
  username: string;
  hospitals: Array<{ id: string; code: string; name: string }>;
}

export async function login(credentials: LoginCredentials) {
  const client = getApiClient();
  const response = await client.post<LoginResponse>("/auth/login", credentials, {
    retryAfterRefresh: false,
  });
  client.setAccessToken(response.accessToken);
  return response.user;
}

export async function logout() {
  const client = getApiClient();
  await client.post<void>("/auth/logout", undefined, { retryAfterRefresh: false });
  client.clearAccessToken();
}

export async function restoreSession() {
  const client = getApiClient();
  const refresh = await client.post<{ accessToken: string; expiresIn: number }>("/auth/refresh", undefined, {
    retryAfterRefresh: false,
  });
  client.setAccessToken(refresh.accessToken);

  try {
    return await client.get<CurrentUser>("/auth/me", { retryAfterRefresh: false });
  } catch (error) {
    client.clearAccessToken();
    throw error;
  }
}
