import Database from 'better-sqlite3';
import * as path from 'path';

// =========================================================
// 型定義
// =========================================================

export interface ChatMemoryItem {
  id: string;
  personaId: string;
  sessionId?: string;
  content: string;
  importance: number;
  accessCount: number;
  createdAt: number;
  accessedAt: number;
}

export interface ChatMemorySearchResult {
  item: ChatMemoryItem;
  score: number;
}

// =========================================================
// ユーティリティ
// =========================================================

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * コサイン類似度（JS 純粋実装）。
 * 1 万件以下なら十分高速。
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** DB 行 → ChatMemoryItem */
function rowToItem(r: any): ChatMemoryItem {
  return {
    id: r.id,
    personaId: r.persona_id,
    sessionId: r.session_id ?? undefined,
    content: r.content,
    importance: r.importance,
    accessCount: r.access_count,
    createdAt: r.created_at,
    accessedAt: r.accessed_at,
  };
}

// =========================================================
// Embedding エンドポイント解決
// =========================================================

/**
 * lmstudioBaseUrl から /v1/embeddings エンドポイントを解決する。
 * claude.ts の normalizeBaseUrl パターンに合わせた実装。
 */
function resolveEmbeddingEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (/\/v1\/embeddings$/i.test(normalized)) return normalized;
  if (/\/api\/v1$/i.test(normalized)) {
    return normalized.replace(/\/api\/v1$/i, '') + '/v1/embeddings';
  }
  if (/\/v1$/i.test(normalized)) return `${normalized}/embeddings`;
  return `${normalized}/v1/embeddings`;
}

/**
 * LM Studio の /v1/embeddings を呼び出して Float32Array を返す。
 * 失敗（未起動・モデル未指定 など）は null を返す。
 */
async function fetchEmbedding(
  baseUrl: string,
  model: string,
  text: string,
): Promise<Float32Array | null> {
  if (!baseUrl || !model) return null;
  try {
    const endpoint = resolveEmbeddingEndpoint(baseUrl);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: text }),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const vec = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec)) return null;
    return new Float32Array(vec);
  } catch {
    return null;
  }
}

// =========================================================
// チャンク分割
// =========================================================

/**
 * テキストを maxChars 文字以下のチャンクに分割する。
 * チャンク間は overlap 文字分を重複させてコンテキストを維持する。
 * maxChars のデフォルト 350 は 512 トークン制限に対して余裕を持った値。
 */
export function chunkText(text: string, maxChars = 350, overlap = 80): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// =========================================================
// ChatMemoryManager
// =========================================================

export function createChatMemoryManager(dataDir: string) {
  const dbPath = path.join(dataDir, 'chat-memories.db');
  let _db: Database.Database | null = null;

  function getDb(): Database.Database {
    if (_db) return _db;
    _db = new Database(dbPath);
    _db.exec(`
      CREATE TABLE IF NOT EXISTS chat_memories (
        id           TEXT    PRIMARY KEY,
        persona_id   TEXT    NOT NULL,
        session_id   TEXT,
        content      TEXT    NOT NULL,
        embedding    BLOB,
        importance   REAL    NOT NULL DEFAULT 0.5,
        access_count INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        accessed_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cm_persona  ON chat_memories (persona_id);
      CREATE INDEX IF NOT EXISTS idx_cm_created  ON chat_memories (persona_id, created_at DESC);
    `);
    return _db;
  }

  return {
    // --------------------------------------------------
    // 保存
    // --------------------------------------------------

    /**
     * 会話スニペットを保存する。
     * baseUrl と embeddingModel が渡された場合は LM Studio で Embedding を生成して保存。
     */
    async storeMemory(
      personaId: string,
      content: string,
      options: {
        sessionId?: string;
        importance?: number;
        baseUrl?: string;
        embeddingModel?: string;
      } = {},
    ): Promise<string> {
      const id = generateId();
      const now = Date.now();

      let embeddingBuffer: Buffer | null = null;
      if (options.baseUrl && options.embeddingModel) {
        const vec = await fetchEmbedding(options.baseUrl, options.embeddingModel, content);
        if (vec) {
          embeddingBuffer = Buffer.from(vec.buffer);
        }
      }

      getDb()
        .prepare(
          `INSERT INTO chat_memories
             (id, persona_id, session_id, content, embedding, importance, access_count, created_at, accessed_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          id,
          personaId,
          options.sessionId ?? null,
          content,
          embeddingBuffer,
          options.importance ?? 0.5,
          now,
          now,
        );

      return id;
    },

    // --------------------------------------------------
    // 検索
    // --------------------------------------------------

    /**
     * クエリに意味的に近いメモリを返す。
     * Embedding が取得できない場合は最新 topK 件にフォールバックする。
     */
    async searchMemories(
      personaId: string,
      query: string,
      options: {
        topK?: number;
        baseUrl?: string;
        embeddingModel?: string;
        minScore?: number;
      } = {},
    ): Promise<ChatMemorySearchResult[]> {
      const topK = options.topK ?? 3;
      const minScore = options.minScore ?? 0.25;
      const db = getDb();

      // Embedding なしフォールバック
      if (!options.baseUrl || !options.embeddingModel) {
        const rows = db
          .prepare(
            `SELECT * FROM chat_memories
             WHERE persona_id = ?
             ORDER BY created_at DESC LIMIT ?`,
          )
          .all(personaId, topK) as any[];
        return rows.map((r) => ({ item: rowToItem(r), score: 1.0 }));
      }

      const queryVec = await fetchEmbedding(options.baseUrl, options.embeddingModel, query);

      // Embedding 失敗フォールバック
      if (!queryVec) {
        const rows = db
          .prepare(
            `SELECT * FROM chat_memories
             WHERE persona_id = ?
             ORDER BY created_at DESC LIMIT ?`,
          )
          .all(personaId, topK) as any[];
        return rows.map((r) => ({ item: rowToItem(r), score: 1.0 }));
      }

      // Embedding あり: 最新 500 件を JS でスコアリング
      const rows = db
        .prepare(
          `SELECT * FROM chat_memories
           WHERE persona_id = ? AND embedding IS NOT NULL
           ORDER BY created_at DESC LIMIT 500`,
        )
        .all(personaId) as any[];

      const scored: ChatMemorySearchResult[] = rows
        .map((r) => {
          const buf = r.embedding as Buffer;
          const vec = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
          return { item: rowToItem(r), score: cosineSimilarity(queryVec, vec) };
        })
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      // アクセスカウント更新
      if (scored.length > 0) {
        const ids = scored.map((r) => r.item.id);
        const ph = ids.map(() => '?').join(',');
        db.prepare(
          `UPDATE chat_memories
           SET access_count = access_count + 1, accessed_at = ?
           WHERE id IN (${ph})`,
        ).run(Date.now(), ...ids);
      }

      return scored;
    },

    // --------------------------------------------------
    // 管理
    // --------------------------------------------------

    /** 件数が maxItems を超えたら重要度スコアが低い順に削除 */
    pruneMemories(personaId: string, maxItems: number = 200): void {
      const db = getDb();
      const { c } = db
        .prepare('SELECT COUNT(*) AS c FROM chat_memories WHERE persona_id = ?')
        .get(personaId) as any;
      if (c <= maxItems) return;
      db.prepare(
        `DELETE FROM chat_memories WHERE id IN (
           SELECT id FROM chat_memories WHERE persona_id = ?
           ORDER BY (importance * 0.7 + MIN(CAST(access_count AS REAL) / 10.0, 1.0) * 0.3) ASC,
                    created_at ASC
           LIMIT ?
         )`,
      ).run(personaId, c - maxItems);
    },

    /** ペルソナのメモリをすべて削除 */
    clearMemories(personaId: string): void {
      getDb().prepare('DELETE FROM chat_memories WHERE persona_id = ?').run(personaId);
    },

    /** 保存件数を返す */
    getMemoryCount(personaId: string): number {
      const { c } = getDb()
        .prepare('SELECT COUNT(*) AS c FROM chat_memories WHERE persona_id = ?')
        .get(personaId) as any;
      return c;
    },

    /** 最近のメモリ一覧（UI 表示用・embedding は含まない） */
    listMemories(personaId: string, limit: number = 50): ChatMemoryItem[] {
      const rows = getDb()
        .prepare(
          `SELECT * FROM chat_memories
           WHERE persona_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(personaId, limit) as any[];
      return rows.map(rowToItem);
    },

    /** DB を閉じる（アプリ終了時） */
    close(): void {
      _db?.close();
      _db = null;
    },
  };
}

export type ChatMemoryManager = ReturnType<typeof createChatMemoryManager>;
