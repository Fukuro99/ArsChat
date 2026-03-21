'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

// ─── sql.js 初期化（キャッシュ付き） ────────────────────────────────────────────
let _SQL = null;

async function getSQL() {
  if (_SQL) return _SQL;
  const initSqlJs = require('sql.js');
  const sqlJsDistDir = path.dirname(require.resolve('sql.js'));
  _SQL = await initSqlJs({
    locateFile: (filename) => path.join(sqlJsDistDir, filename),
  });
  return _SQL;
}

// ─── DB パス ──────────────────────────────────────────────────────────────────
function getDbPath() {
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'arschat-data', 'chat-memories.db');
}

// ─── DB ロード ────────────────────────────────────────────────────────────────
async function loadDB() {
  const SQL = await getSQL();
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    return new SQL.Database();
  }
  const buf = fs.readFileSync(dbPath);
  return new SQL.Database(buf);
}

// ─── DB 書き戻し ──────────────────────────────────────────────────────────────
function saveDB(db) {
  const dbPath = getDbPath();
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  db.close();
}

// ─── エンベディング取得 ───────────────────────────────────────────────────────
function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const client = isHttps ? https : http;
    const payload = JSON.stringify(body);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 15000,
    };
    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Embedding request timeout')); });
    req.write(payload);
    req.end();
  });
}

async function getEmbedding(text, baseUrl, model) {
  if (!baseUrl || !model) return null;
  try {
    let ep = baseUrl.replace(/\/$/, '');
    if (!ep.includes('/v1')) ep += '/v1';
    if (!ep.endsWith('/embeddings')) ep += '/embeddings';
    const res = await httpPost(ep, { model, input: text });
    return res?.data?.[0]?.embedding ?? null;
  } catch (_) {
    return null;
  }
}

// ─── コサイン類似度 ───────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── BLOB → Float32Array 変換 ────────────────────────────────────────────────
function blobToFloats(blob) {
  try {
    if (!blob) return null;
    const buf = blob instanceof Buffer ? blob : Buffer.from(blob);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return Array.from(new Float32Array(ab));
  } catch (_) {
    return null;
  }
}

// ─── activate ────────────────────────────────────────────────────────────────
function activate(ctx) {

  // ── ペルソナ一覧 ──────────────────────────────────────────────────────────
  ctx.ipc.handle('get-personas', async () => {
    try {
      const db = await loadDB();
      const result = db.exec(
        'SELECT persona_id, COUNT(*) AS cnt FROM chat_memories GROUP BY persona_id ORDER BY cnt DESC'
      );
      db.close();
      if (!result[0]) return { personas: [] };
      const personas = result[0].values.map(([id, count]) => ({ id: String(id), count: Number(count) }));
      return { personas };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── メモリ一覧（ページネーション付き）───────────────────────────────────────
  ctx.ipc.handle('list', async (data) => {
    try {
      const { personaId, limit = 50, offset = 0 } = data || {};
      const db = await loadDB();

      const whereClause = personaId ? 'WHERE persona_id = ?' : '';
      const params = personaId ? [personaId, limit, offset] : [limit, offset];

      const stmt = db.prepare(
        `SELECT id, persona_id, session_id, content, importance, access_count, created_at, accessed_at
         FROM chat_memories ${whereClause}
         ORDER BY created_at DESC LIMIT ? OFFSET ?`
      );
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();

      const countResult = db.exec(
        `SELECT COUNT(*) FROM chat_memories ${whereClause}`,
        personaId ? [personaId] : []
      );
      const total = Number(countResult[0]?.values[0][0] ?? 0);

      db.close();
      return { rows, total };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── テキスト検索 ──────────────────────────────────────────────────────────
  ctx.ipc.handle('search-text', async (data) => {
    try {
      const { query, personaId, limit = 30 } = data || {};
      if (!query) return { results: [] };

      const db = await loadDB();
      const conditions = ['content LIKE ?'];
      const params = [`%${query}%`];
      if (personaId) { conditions.push('persona_id = ?'); params.push(personaId); }
      params.push(limit);

      const stmt = db.prepare(
        `SELECT id, persona_id, session_id, content, importance, access_count, created_at, accessed_at
         FROM chat_memories WHERE ${conditions.join(' AND ')}
         ORDER BY created_at DESC LIMIT ?`
      );
      stmt.bind(params);
      const results = [];
      while (stmt.step()) results.push({ ...stmt.getAsObject(), score: null, searchType: 'text' });
      stmt.free();
      db.close();

      return { results };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── セマンティック検索 ────────────────────────────────────────────────────
  ctx.ipc.handle('search-semantic', async (data) => {
    try {
      const { query, personaId, limit = 20, minScore = 0.2 } = data || {};
      if (!query) return { results: [] };

      const settings = await ctx.settings.get();
      const baseUrl = settings.lmstudioBaseUrl;
      const model = settings.chatHistoryEmbeddingModel;

      const queryVec = await getEmbedding(query, baseUrl, model);
      if (!queryVec) {
        return { results: [], warning: 'エンベディングが取得できませんでした。設定で LM Studio URL とモデルを確認してください。テキスト検索に切り替えてください。' };
      }

      const db = await loadDB();
      const whereClause = personaId ? 'WHERE persona_id = ?' : '';
      const params = personaId ? [personaId] : [];

      const stmt = db.prepare(
        `SELECT id, persona_id, session_id, content, importance, access_count, created_at, accessed_at, embedding
         FROM chat_memories ${whereClause}
         ORDER BY created_at DESC LIMIT 500`
      );
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      db.close();

      const scored = rows.map((row) => {
        const vec = blobToFloats(row.embedding);
        const score = vec ? cosineSimilarity(queryVec, vec) : 0;
        const { embedding: _emb, ...rest } = row;
        return { ...rest, score: Math.round(score * 1000) / 1000, searchType: 'semantic' };
      });

      const results = scored
        .filter((r) => r.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      return { results };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── 統計情報 ──────────────────────────────────────────────────────────────
  ctx.ipc.handle('get-stats', async () => {
    try {
      const dbPath = getDbPath();
      const db = await loadDB();

      const totalResult = db.exec(`
        SELECT
          COUNT(*) AS total,
          ROUND(AVG(importance), 3) AS avg_importance,
          ROUND(AVG(access_count), 2) AS avg_access_count,
          MIN(created_at) AS oldest_ts,
          MAX(created_at) AS newest_ts,
          SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) AS with_embedding
        FROM chat_memories
      `);

      const personaResult = db.exec(`
        SELECT
          persona_id,
          COUNT(*) AS count,
          ROUND(AVG(importance), 3) AS avg_importance,
          ROUND(AVG(access_count), 2) AS avg_access_count,
          SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) AS with_embedding
        FROM chat_memories
        GROUP BY persona_id
        ORDER BY count DESC
      `);

      db.close();

      let fileSize = 0;
      try { fileSize = fs.statSync(dbPath).size; } catch (_) { /* ignore */ }

      const row = totalResult[0]?.values?.[0];
      const stats = row ? {
        total: Number(row[0]),
        avgImportance: Number(row[1]),
        avgAccessCount: Number(row[2]),
        oldestTs: Number(row[3]),
        newestTs: Number(row[4]),
        withEmbedding: Number(row[5]),
        fileSize,
      } : { total: 0, fileSize };

      const personaStats = (personaResult[0]?.values ?? []).map(([id, count, avgImp, avgAcc, withEmb]) => ({
        personaId: String(id),
        count: Number(count),
        avgImportance: Number(avgImp),
        avgAccessCount: Number(avgAcc),
        withEmbedding: Number(withEmb),
      }));

      return { stats, personaStats };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── 任意 SQL 実行 ─────────────────────────────────────────────────────────
  ctx.ipc.handle('execute-sql', async (data) => {
    try {
      const { sql, readonly = true } = data || {};
      if (!sql || !sql.trim()) return { error: 'SQL を入力してください' };

      const db = await loadDB();

      let tables = [];
      let rowsModified = 0;
      try {
        const results = db.exec(sql);
        tables = (results || []).map((r) => ({
          columns: r.columns,
          rows: r.values.map((vals) =>
            Object.fromEntries(r.columns.map((col, i) => [col, vals[i]]))
          ),
        }));
        // SQLite doesn't expose rowsModified via db.exec, use a rough heuristic
        rowsModified = db.getRowsModified ? db.getRowsModified() : 0;
      } catch (e) {
        db.close();
        return { error: e.message };
      }

      if (!readonly) {
        saveDB(db);
      } else {
        db.close();
      }

      return { tables, rowsModified };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── 個別メモリ削除 ────────────────────────────────────────────────────────
  ctx.ipc.handle('delete-memory', async (data) => {
    try {
      const { id } = data || {};
      if (!id) return { error: 'id が指定されていません' };
      const db = await loadDB();
      db.run('DELETE FROM chat_memories WHERE id = ?', [id]);
      saveDB(db);
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  // ── ペルソナのメモリを全削除 ──────────────────────────────────────────────
  ctx.ipc.handle('clear-persona', async (data) => {
    try {
      const { personaId } = data || {};
      if (!personaId) return { error: 'personaId が指定されていません' };
      const db = await loadDB();
      db.run('DELETE FROM chat_memories WHERE persona_id = ?', [personaId]);
      saveDB(db);
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });

  ctx.log.info('[memory-browser] activated');
}

function deactivate() {}

module.exports = { activate, deactivate };
