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
