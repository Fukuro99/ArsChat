import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { MCPServerConfig, MCPServerStatus, MCPToolInfo } from '../shared/types';

// ===== 内部型 =====

interface MCPToolDef extends MCPToolInfo {
  inputSchema: any;
}

interface ConnectedServer {
  config: MCPServerConfig;
  client: Client;
  tools: MCPToolDef[];
  status: 'connected' | 'error';
  errorMessage?: string;
}

// ===== MCP マネージャー =====

export function createMCPManager() {
  const connections = new Map<string, ConnectedServer>();

  /** 単一サーバーへ接続してツール一覧を取得 */
  async function connectServer(config: MCPServerConfig): Promise<ConnectedServer> {
    const client = new Client({ name: 'arischat', version: '1.0.0' });

    let transport;
    if (config.type === 'stdio') {
      if (!config.command) throw new Error(`stdio サーバー "${config.name}" に command が指定されていません`);
      transport = new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: { ...process.env, ...config.env } as Record<string, string>,
      });
    } else if (config.type === 'http') {
      if (!config.url) throw new Error(`http サーバー "${config.name}" に url が指定されていません`);
      transport = new SSEClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers ?? {} },
      });
    } else {
      // streamable-http
      if (!config.url) throw new Error(`streamable-http サーバー "${config.name}" に url が指定されていません`);
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers ?? {} },
      });
    }

    await client.connect(transport);

    const toolsResult = await client.listTools();
    const tools: MCPToolDef[] = toolsResult.tools.map((tool) => ({
      serverName: config.name,
      name: `${config.name}__${tool.name}`,
      originalName: tool.name,
      description: `[${config.name}] ${tool.description ?? ''}`,
      inputSchema: tool.inputSchema,
    }));

    return { config, client, tools, status: 'connected' };
  }

  /** 設定一覧にもとづいて全サーバーに接続（再接続含む） */
  async function connect(configs: MCPServerConfig[]): Promise<void> {
    await disconnectAll();

    for (const config of configs) {
      if (!config.enabled) continue;
      try {
        const conn = await connectServer(config);
        connections.set(config.name, conn);
        console.log(`[MCP] "${config.name}" 接続完了 (${conn.tools.length} ツール)`);
      } catch (err: any) {
        console.error(`[MCP] "${config.name}" 接続失敗:`, err?.message);
        connections.set(config.name, {
          config,
          client: null as any,
          tools: [],
          status: 'error',
          errorMessage: err?.message ?? '接続に失敗しました',
        });
      }
    }
  }

  /** 全サーバーを切断 */
  async function disconnectAll(): Promise<void> {
    for (const [, conn] of connections) {
      if (conn.status === 'connected' && conn.client) {
        try { await conn.client.close(); } catch {}
      }
    }
    connections.clear();
  }

  /** 全ツールを OpenAI function calling 形式に変換して返す */
  function getOpenAITools(): any[] {
    const tools: any[] = [];
    for (const [, conn] of connections) {
      if (conn.status !== 'connected') continue;
      for (const tool of conn.tools) {
        tools.push({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema ?? { type: 'object', properties: {} },
          },
        });
      }
    }
    return tools;
  }

  /** レンダラー用ツール情報を返す */
  function getToolInfoList(): MCPToolInfo[] {
    const list: MCPToolInfo[] = [];
    for (const [, conn] of connections) {
      if (conn.status !== 'connected') continue;
      for (const tool of conn.tools) {
        list.push({
          serverName: tool.serverName,
          name: tool.name,
          originalName: tool.originalName,
          description: tool.description,
        });
      }
    }
    return list;
  }

  /**
   * ツールを実行する
   * @param toolName "serverName__originalToolName" 形式
   * @param args ツール引数オブジェクト
   * @returns ツール実行結果テキスト
   */
  async function executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const sep = toolName.indexOf('__');
    if (sep === -1) throw new Error(`不正なツール名: ${toolName}`);
    const serverName = toolName.slice(0, sep);
    const originalName = toolName.slice(sep + 2);

    const conn = connections.get(serverName);
    if (!conn || conn.status !== 'connected') {
      throw new Error(`MCP サーバー "${serverName}" は接続されていません`);
    }

    const result = await conn.client.callTool({ name: originalName, arguments: args });

    const content = result.content;
    if (Array.isArray(content)) {
      return content
        .map((c: any) => {
          if (c.type === 'text') return c.text;
          if (c.type === 'image') return '[画像データ]';
          return JSON.stringify(c);
        })
        .join('\n');
    }
    return JSON.stringify(content);
  }

  /**
   * 省トークンモード用: 接続中サーバーのツール概要を返す
   * システムプロンプトへの注入用
   */
  function getServerSummaries(): Array<{
    name: string;
    description?: string;
    tools: Array<{ name: string; description: string }>;
  }> {
    const result = [];
    for (const [, conn] of connections) {
      if (conn.status !== 'connected') continue;
      result.push({
        name: conn.config.name,
        description: conn.config.description || undefined,
        tools: conn.tools.map((t) => ({
          name: t.originalName,
          description: t.description.replace(`[${conn.config.name}] `, ''),
        })),
      });
    }
    return result;
  }

  /**
   * 省トークンモード用: 特定サーバーのツールを OpenAI function calling 形式で返す
   */
  function getOpenAIToolsForServer(serverName: string): any[] {
    const conn = connections.get(serverName);
    if (!conn || conn.status !== 'connected') return [];
    return conn.tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.originalName,
        description: tool.description.replace(`[${serverName}] `, ''),
        parameters: tool.inputSchema ?? { type: 'object', properties: {} },
      },
    }));
  }

  /** 各サーバーの接続状態を返す */
  function getStatus(configs: MCPServerConfig[]): MCPServerStatus[] {
    return configs.map((config) => {
      if (!config.enabled) {
        return { name: config.name, status: 'disabled', toolCount: 0 };
      }
      const conn = connections.get(config.name);
      if (!conn) {
        return { name: config.name, status: 'disabled', toolCount: 0 };
      }
      return {
        name: config.name,
        status: conn.status,
        toolCount: conn.tools.length,
        error: conn.errorMessage,
      };
    });
  }

  /**
   * 一時的にサーバーへ接続してツール一覧を取得後すぐ切断する（説明生成などに使用）
   * 既に接続済みの場合はそのツールをそのまま返す
   */
  async function getToolsTemporarily(
    config: MCPServerConfig,
  ): Promise<Array<{ name: string; description: string }>> {
    // 既に接続済みならそのまま返す
    const existing = connections.get(config.name);
    if (existing?.status === 'connected' && existing.tools.length > 0) {
      return existing.tools.map((t) => ({
        name: t.originalName,
        description: t.description.replace(`[${config.name}] `, ''),
      }));
    }
    // 未接続 or エラー → 一時接続
    const conn = await connectServer(config);
    try {
      return conn.tools.map((t) => ({
        name: t.originalName,
        description: t.description.replace(`[${config.name}] `, ''),
      }));
    } finally {
      try { await conn.client.close(); } catch {}
    }
  }

  return {
    connect,
    disconnectAll,
    getOpenAITools,
    getToolInfoList,
    getServerSummaries,
    getOpenAIToolsForServer,
    getToolsTemporarily,
    executeTool,
    getStatus,
  };
}

export type MCPManager = ReturnType<typeof createMCPManager>;
