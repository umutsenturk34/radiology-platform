import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated without threading it through every call.
 *
 * Used to correlate logs and audit entries with a single HTTP request
 * (docs/API_CONTRACT.md section 115).
 */
export interface RequestContext {
  requestId: string;
  userId?: string;
  role?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  return storage.run(context, callback);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/**
 * Attaches the authenticated principal to the active context so later log
 * lines and audit records can reference it.
 */
export function setRequestPrincipal(userId: string, role: string): void {
  const store = storage.getStore();
  if (store) {
    store.userId = userId;
    store.role = role;
  }
}
