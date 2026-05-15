export type ApiResult<T> = Promise<T>;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function clearAuthToken() {
  localStorage.removeItem("atm10_token");
}

function isExpiredJwt(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return true;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded));
    return typeof decoded.exp === "number" && decoded.exp <= Date.now() / 1000;
  } catch {
    return true;
  }
}

function currentAuthToken() {
  const token = localStorage.getItem("atm10_token");
  if (!token) return null;
  if (isExpiredJwt(token)) {
    clearAuthToken();
    return null;
  }
  return token;
}

export function hasAuthToken() {
  return Boolean(currentAuthToken());
}

export function authToken() {
  return currentAuthToken();
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

async function request<T>(path: string, init: RequestInit = {}): ApiResult<T> {
  const token = authToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 401) clearAuthToken();
    throw new ApiError(response.status, message || response.statusText);
  }

  return response.json();
}

export async function login(username: string, password: string) {
  const data = await request<{ token: string; user: { username: string } }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  localStorage.setItem("atm10_token", data.token);
  return data;
}

export function getLatest() {
  return request<any>("/api/dashboard/latest");
}

export function getHistory(metric: string, category: string | undefined, range: string) {
  const params = new URLSearchParams({ metric, range });
  if (category) params.set("category", category);
  return request<{ points: Array<{ createdAt: string; value: number }> }>(`/api/history?${params}`);
}

export type ResourceCategory = "Item" | "Fluid" | "Chemical";

export type ResourceRow = {
  id: string;
  category: ResourceCategory;
  key: string;
  name?: string | null;
  displayName?: string | null;
  amount: number;
  unit?: string | null;
  fingerprint?: string | null;
  nbtHash?: string | null;
  craftable: boolean;
  lastRate?: number | null;
  lastChangedAt?: string;
  lastSeenAt?: string;
  pattern?: { outputAmount?: number; ingredients?: unknown } | null;
};

export function getResources(params: { category: ResourceCategory; q?: string; sort?: "amount" | "rate" | "name"; order?: "asc" | "desc"; limit?: number }) {
  const query = new URLSearchParams({
    category: params.category,
    sort: params.sort ?? "amount",
    order: params.order ?? "desc",
    limit: String(params.limit ?? 500),
  });
  if (params.q) query.set("q", params.q);
  return request<{ resources: ResourceRow[] }>(`/api/resources?${query}`);
}

export function getResourceTop(category: ResourceCategory, kind: "amount" | "growth" | "decline", limit = 8) {
  const query = new URLSearchParams({ category, kind, limit: String(limit) });
  return request<{ resources: ResourceRow[] }>(`/api/resources/top?${query}`);
}

export function getResourceHistory(category: ResourceCategory, key: string, range: string) {
  const query = new URLSearchParams({ category, key, range });
  return request<{ points: Array<{ createdAt: string; value: number }>; resource: ResourceRow | null }>(`/api/resources/history?${query}`);
}

export type CraftPreview = {
  resource: ResourceRow;
  mode: "rule" | "pattern" | "direct";
  craftable: boolean;
  maxAmount: number | null;
  requestedAmount: number;
  ingredients: Array<{
    category: ResourceCategory;
    key: string;
    name?: string | null;
    displayName?: string | null;
    amount: number;
    available?: number;
    reserve?: number;
    unit?: string | null;
  }> | null;
  patternAvailable: boolean;
  warnings: string[];
};

export function getCraftPreview(category: ResourceCategory, key: string, amount: number) {
  const query = new URLSearchParams({ category, key, amount: String(amount) });
  return request<CraftPreview>(`/api/resources/craft-preview?${query}`);
}

export function requestCraft(category: ResourceCategory, key: string, amount: number, deviceId = "atm10-main") {
  return request<any>("/api/resources/craft", {
    method: "POST",
    body: JSON.stringify({ deviceId, category, key, amount }),
  });
}

export function saveConfig(config: any) {
  return request<any>("/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function sendCommand(action: string, payload: Record<string, unknown> = {}, deviceId = "atm10-main") {
  return request<any>("/api/commands", {
    method: "POST",
    body: JSON.stringify({ deviceId, action, payload }),
  });
}

export function eventsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const token = encodeURIComponent(authToken() ?? "");
  return `${protocol}//${window.location.host}/api/events?token=${token}`;
}
