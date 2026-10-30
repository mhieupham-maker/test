#!/usr/bin/env node
// server.js
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { request as httpsRequest } from "node:https";
import { z } from "zod";

const {
  SLACK_WEBHOOK_URL      // Incoming Webhook URL (notify)
} = process.env;

if (!SLACK_WEBHOOK_URL) {
  console.error("Missing SLACK_WEBHOOK_URL");
  process.exit(1);
}

const notifyTaskArgsSchema = z.object({
  project: z.string().min(1, "Project name is required"),
  task: z.string().min(1, "Task name is required"),
  status: z.string().min(1, "Status is required"),
  note: z.string().optional()
});

async function slackPost(text) {
  const payload = JSON.stringify({ text });
  const url = new URL(SLACK_WEBHOOK_URL);

  await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: "POST",
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      },
      res => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", chunk => {
          responseBody += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            const error = new Error(
              `Slack post failed: ${res.statusCode ?? "unknown status"}`
            );
            if (responseBody) {
              error.cause = responseBody;
            }
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// MCP server (stdio)
const server = new McpServer(
  {
    name: "slack-mcp",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.registerTool(
  "notifyTask",
  {
    description: "Thông báo trạng thái task lên Slack",
    inputSchema: notifyTaskArgsSchema.shape
  },
  async ({ project, task, status, note }) => {
    const lines = [
      `*Project:* ${project}`,
      `*Task:* ${task}`,
      `*Status:* ${status}`
    ];

    if (note && note.trim().length > 0) {
      lines.push(`*Note:* ${note}`);
    }

    await slackPost(lines.join("\n"));

    return {
      content: [{ type: "text", text: "Slack notification sent" }],
      structuredContent: {
        project,
        task,
        status,
        note: note ?? null
      }
    };
  }
);

// start MCP stdio
const transport = new StdioServerTransport();
await server.connect(transport);
