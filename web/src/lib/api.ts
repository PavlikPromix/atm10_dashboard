export type ApiResult<T> = Promise<T>;

async function request<T>(path: string, init: RequestInit = {}): ApiResult<T> {
  const token = localStorage.getItem("atm10_token");
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
    throw new Error(message || response.statusText);
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
  const token = encodeURIComponent(localStorage.getItem("atm10_token") ?? "");
  return `${protocol}//${window.location.host}/api/events?token=${token}`;
}
