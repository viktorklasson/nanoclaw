import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { ApiClient } from "./api-client.js";
import { registerAllTools } from "./tools/index.js";

const config = loadConfig();
const api = new ApiClient(config);

const server = new McpServer({
  name: "salesys",
  version: "1.0.0",
});

registerAllTools(server, api, config);

const transport = new StdioServerTransport();
await server.connect(transport);
