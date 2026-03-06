export interface Config {
  apiBaseUrl: string;
  jwtToken?: string;
  username?: string;
  password?: string;
  adminBaseUrl: string;
  adminToken?: string;
}

export function loadConfig(): Config {
  const apiBaseUrl = process.env.SALESYS_API_BASE_URL;
  if (!apiBaseUrl) {
    throw new Error("SALESYS_API_BASE_URL environment variable is required");
  }

  return {
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ""),
    jwtToken: process.env.SALESYS_JWT_TOKEN,
    username: process.env.SALESYS_USERNAME,
    password: process.env.SALESYS_PASSWORD,
    adminBaseUrl: (process.env.SALESYS_ADMIN_API_BASE_URL || "https://admin.salesys.se").replace(/\/$/, ""),
    adminToken: process.env.SALESYS_ADMIN_TOKEN,
  };
}
