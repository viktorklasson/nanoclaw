import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ApiClient } from "../api-client.js";
import { Config } from "../config.js";

export function registerOrganizationTools(server: McpServer, _api: ApiClient, config: Config) {
  server.tool(
    "salesys_organizations_list",
    "List all organizations in SaleSys (admin API). Returns org names, IDs, and usernames.",
    {
      hidden: z.boolean().optional().describe("Include hidden organizations (default: false)"),
    },
    async ({ hidden }) => {
      if (!config.adminToken) {
        return {
          content: [{
            type: "text",
            text: "No admin token set. Ask the user to provide their SaleSys admin token, then call salesys_admin_set_token first.",
          }],
        };
      }
      const showHidden = hidden ?? false;
      const url = `${config.adminBaseUrl}/api/users/organizations-v1?hidden=${showHidden}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.adminToken}`,
        },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Admin API failed (${res.status}): ${text}`);
      }
      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
  );
}
