import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../api-client.js";
import { Config } from "../config.js";

export function registerImpersonationTools(server: McpServer, api: ApiClient, config: Config) {
  server.tool(
    "salesys_admin_set_token",
    "Set or update the SaleSys admin token (for admin.salesys.se). Required before using organization listing or impersonation. The token expires, so the user may need to provide a new one periodically.",
    {
      token: z.string().describe("The admin bearer token"),
    },
    async ({ token }) => {
      config.adminToken = token;
      return {
        content: [{
          type: "text",
          text: "Admin token set. You can now use salesys_organizations_list and salesys_auth_impersonate.",
        }],
      };
    }
  );

  server.tool(
    "salesys_auth_impersonate",
    "Impersonate a customer account. After this, all SaleSys tools will operate as that customer. Takes a username (e.g. 'acme-corp') and performs the admin support-code flow to get a customer token.",
    {
      username: z.string().describe("The organization/user username to impersonate"),
    },
    async ({ username }) => {
      if (!config.adminToken) {
        return {
          content: [{
            type: "text",
            text: "No admin token set. Ask the user to provide their SaleSys admin token, then call salesys_admin_set_token first.",
          }],
        };
      }

      if (api.isImpersonating()) {
        return {
          content: [{
            type: "text",
            text: "Already impersonating a user. Call salesys_auth_stop_impersonation first.",
          }],
        };
      }

      // Step 1: POST to admin support endpoint to get support token cookie
      const supportRes = await fetch(`${config.adminBaseUrl}/api/users/support-v1`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username }),
        redirect: "manual",
      });

      if (!supportRes.ok && supportRes.status !== 302) {
        const text = await supportRes.text();
        throw new Error(`Admin support request failed (${supportRes.status}): ${text}`);
      }

      // Extract support token cookie
      const cookies = supportRes.headers.getSetCookie?.() ?? [];
      let supportCookie: string | undefined;
      for (const cookie of cookies) {
        const match = cookie.match(/(s2_supportToken_[^=]+=[^;]+)/);
        if (match) {
          supportCookie = match[1];
          break;
        }
      }

      if (!supportCookie) {
        throw new Error(
          "Support request succeeded but no support token cookie was returned. " +
          `Cookies received: ${cookies.length > 0 ? cookies.join('; ') : 'none'}`
        );
      }

      // Extract userId from cookie name (s2_supportToken_{userId})
      const userIdMatch = supportCookie.match(/s2_supportToken_([^=]+)/);
      const userId = userIdMatch?.[1];
      if (!userId) {
        throw new Error("Could not extract userId from support token cookie");
      }

      // Step 2: GET app support endpoint with support cookie to get customer token
      const appSupportRes = await fetch(
        `${api.getBaseUrl()}/api/users/support-v1?userId=${userId}`,
        {
          headers: {
            Cookie: supportCookie,
          },
          redirect: "manual",
        }
      );

      if (!appSupportRes.ok && appSupportRes.status !== 302) {
        const text = await appSupportRes.text();
        throw new Error(`App support request failed (${appSupportRes.status}): ${text}`);
      }

      // Extract customer access token
      const appCookies = appSupportRes.headers.getSetCookie?.() ?? [];
      let customerToken: string | undefined;
      for (const cookie of appCookies) {
        const match = cookie.match(/s2_utoken=([^;]+)/);
        if (match) {
          customerToken = match[1];
          break;
        }
      }

      // Also check s2_accesstoken
      if (!customerToken) {
        for (const cookie of appCookies) {
          const match = cookie.match(/s2_accesstoken=([^;]+)/);
          if (match) {
            customerToken = match[1];
            break;
          }
        }
      }

      if (!customerToken) {
        throw new Error(
          "Support flow succeeded but no customer token was returned. " +
          `Cookies received: ${appCookies.length > 0 ? appCookies.join('; ') : 'none'}`
        );
      }

      // Step 3: Swap the token
      api.setToken(customerToken);

      // Verify by fetching whoami
      let whoami: string;
      try {
        const me = await api.get("/api/users/me-v1/extended");
        whoami = JSON.stringify(me, null, 2);
      } catch (err) {
        // Restore on failure
        api.restoreOriginalToken();
        throw new Error(
          `Token swap succeeded but whoami failed: ${err instanceof Error ? err.message : String(err)}. Token restored.`
        );
      }

      return {
        content: [{
          type: "text",
          text: `Now impersonating '${username}' (userId: ${userId}). All SaleSys tools now operate as this customer.\n\nCustomer info:\n${whoami}`,
        }],
      };
    }
  );

  server.tool(
    "salesys_auth_stop_impersonation",
    "Stop impersonating a customer and restore the original admin token.",
    {},
    async () => {
      if (!api.isImpersonating()) {
        return {
          content: [{
            type: "text",
            text: "Not currently impersonating anyone.",
          }],
        };
      }

      api.restoreOriginalToken();

      return {
        content: [{
          type: "text",
          text: "Impersonation stopped. Restored original admin token. All SaleSys tools now operate as the admin user again.",
        }],
      };
    }
  );
}
