import { Config } from "./config.js";

export class ApiClient {
  private baseUrl: string;
  private token: string | undefined;
  private originalToken: string | undefined;
  private username: string | undefined;
  private password: string | undefined;

  constructor(config: Config) {
    this.baseUrl = config.apiBaseUrl;
    this.token = config.jwtToken;
    this.originalToken = config.jwtToken;
    this.username = config.username;
    this.password = config.password;
  }

  setToken(token: string): void {
    this.token = token;
  }

  restoreOriginalToken(): void {
    this.token = this.originalToken;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  isImpersonating(): boolean {
    return this.token !== this.originalToken;
  }

  async ensureAuth(): Promise<void> {
    if (this.token) return;
    if (!this.username || !this.password) {
      throw new Error(
        "No JWT token and no username/password configured. Set SALESYS_JWT_TOKEN or SALESYS_USERNAME + SALESYS_PASSWORD."
      );
    }
    const res = await fetch(`${this.baseUrl}/api/users/login-v1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernameOrEmail: this.username,
        password: this.password,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Login failed (${res.status}): ${text}`);
    }
    const cookies = res.headers.getSetCookie?.() ?? [];
    for (const cookie of cookies) {
      const match = cookie.match(/s2_accesstoken=([^;]+)/);
      if (match) {
        this.token = match[1];
        return;
      }
    }
    throw new Error(
      "Login succeeded but no access token cookie was returned. Use SALESYS_JWT_TOKEN instead."
    );
  }

  async request(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string | undefined>;
      headers?: Record<string, string>;
    }
  ): Promise<unknown> {
    await this.ensureAuth();

    let url = `${this.baseUrl}${path}`;
    if (options?.query) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== "") params.set(k, v);
      }
      const qs = params.toString();
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...options?.headers,
    };

    let bodyStr: string | undefined;
    if (options?.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyStr = JSON.stringify(options.body);
    }

    const res = await fetch(url, { method, headers, body: bodyStr });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`API ${method} ${path} failed (${res.status}): ${text}`);
    }

    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { rawResponse: text };
    }
  }

  get(path: string, query?: Record<string, string | undefined>) {
    return this.request("GET", path, { query });
  }
  post(path: string, body?: unknown) {
    return this.request("POST", path, { body });
  }
  put(path: string, body?: unknown) {
    return this.request("PUT", path, { body });
  }
  del(path: string, query?: Record<string, string | undefined>) {
    return this.request("DELETE", path, { query });
  }
  delWithBody(path: string, body?: unknown) {
    return this.request("DELETE", path, { body });
  }
}
