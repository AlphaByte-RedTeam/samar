import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { ShadowService } from "./ShadowService.js";
import { WatcherService } from "./WatcherService.js";
import path from "path";

export class MCPService {
  private server: Server;
  private shadowService: ShadowService;
  private watcherService: WatcherService;
  private projectRoot: string;
  private strictMode: boolean;

  constructor(projectRoot: string, strictMode: boolean = false) {
    this.projectRoot = projectRoot;
    this.strictMode = strictMode;
    this.shadowService = new ShadowService(projectRoot);
    this.watcherService = new WatcherService(
      projectRoot,
      this.shadowService.getShadowPath(),
      strictMode
    );

    this.server = new Server(
      {
        name: "samar-mcp-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_workspace_info",
            description:
              "Returns critical information about the current Safe Shadow Workspace, including the path where file operations should be performed.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "reset_shadow_workspace",
            description:
              "Completely wipes and re-creates the Shadow Workspace from the Real Workspace. Use this if the environment gets messed up or out of sync.",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "get_workspace_info": {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    status: "active",
                    mode: this.strictMode ? "strict" : "normal",
                    real_path: this.projectRoot,
                    shadow_path: this.shadowService.getShadowPath(),
                    instructions:
                      "Perform ALL file modifications in the 'shadow_path'. Do NOT touch 'real_path'.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }
        case "reset_shadow_workspace": {
          // Re-initialize logic
          await this.shadowService.cleanup();
          await this.shadowService.initialize(false);
          return {
            content: [
              {
                type: "text",
                text: "Shadow Workspace has been successfully reset and re-synced from the source of truth.",
              },
            ],
          };
        }
        default:
          throw new Error("Unknown tool");
      }
    });
    
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
        return {
            prompts: [
                {
                    name: "samar_safety_briefing",
                    description: "Injects the Samar safety protocols and workspace paths into the agent's context.",
                }
            ]
        }
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        if (request.params.name === "samar_safety_briefing") {
            const shadowPath = this.shadowService.getShadowPath();
            return {
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: `You are operating within a **Samar Shadow Workspace**.
                            
1. **Safety**: This is a sandboxed environment. You can freely create, edit, or delete files here.
2. **Synchronization**: Changes you make here are synced back to the real project *unless* they are dangerous (e.g. secrets).
3. **Location**: Your workspace is located at: 
${shadowPath}
. 
4. **Strict Mode**: ${this.strictMode ? "ACTIVE. Secrets created here will be destroyed immediately." : "Inactive. Secrets are blocked from syncing back."} 

Please perform your tasks within this directory.`
                        }
                    }
                ]
            }
        }
        throw new Error("Unknown prompt");
    });
  }

  public async start() {
    // 1. Initialize the physical shadow workspace first
    await this.shadowService.initialize(false);
    
    // 2. Start the watcher in the background
    // Note: We don't await watcher.start() because it keeps the process alive? 
    // Actually watcher.start() sets up listeners, it doesn't block event loop forever by itself unless we don't exit.
    await this.watcherService.start();

    // 3. Start MCP Server Transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Keep alive log (stderr only!)
    console.error("Samar MCP Server running on stdio...");
  }
}
