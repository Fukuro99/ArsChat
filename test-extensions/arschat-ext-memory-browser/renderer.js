// renderer.js — Memory Browser Extension
// React と hooks はローダーによってグローバルに注入されます
// 利用可能: React, useState, useEffect, useRef, useCallback, useMemo

// ─── カラートークン ────────────────────────────────────────────────────────────
const C = {
  bg: '#0f0f17',
  surface: '#1a1a28',
  card: '#22223a',
  border: '#2e2e4a',
  borderActive: '#6c6cac',
  text: '#e0e0f0',
  subtext: '#8888aa',
  accent: '#7c7cff',
  accentHover: '#9d9dff',
  success: '#4caf7d',
  warning: '#f0b940',
  danger: '#e05555',
  dangerHover: '#f06666',
  scoreHigh: '#4caf7d',
  scoreMid: '#f0b940',
  scoreLow: '#e05555',
};

// ─── ユーティリティ ────────────────────────────────────────────────────────────
function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function truncate(str, n) {
  if (!str) return '';
  const s = String(str);
  return s.length <= n ? s : s.slice(0, n) + '…';
}

function scoreColor(score) {
  if (score === null || score === undefined) return C.subtext;
  if (score >= 0.7) return C.scoreHigh;
  if (score >= 0.4) return C.scoreMid;
  return C.scoreLow;
}

function importanceBar(val) {
  const pct = Math.round((Number(val) || 0) * 100);
  const color = pct >= 70 ? C.scoreHigh : pct >= 40 ? C.scoreMid : C.scoreLow;
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
    React.createElement('div', {
      style: {
        width: 60, height: 6, background: C.border, borderRadius: 3, overflow: 'hidden',
      },
    },
      React.createElement('div', { style: { width: `${pct}%`, height: '100%', background: color, borderRadius: 3 } })
    ),
    React.createElement('span', { style: { fontSize: 11, color: C.subtext } }, `${pct}%`)
  );
}

const h = React.createElement;

// ─── 共通コンポーネント ────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return h('div', {
    style: {
      display: 'flex', gap: 2, padding: '6px 12px', borderBottom: `1px solid ${C.border}`,
      background: C.surface, flexShrink: 0,
    },
  },
    tabs.map(({ id, label, icon }) =>
      h('button', {
        key: id,
        onClick: () => onChange(id),
        style: {
          padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: active === id ? 600 : 400,
          background: active === id ? C.accent : 'transparent',
          color: active === id ? '#fff' : C.subtext,
          transition: 'all 0.15s',
        },
      }, `${icon} ${label}`)
    )
  );
}

function Badge({ children, color }) {
  return h('span', {
    style: {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: (color || C.accent) + '22', color: color || C.accent,
      border: `1px solid ${(color || C.accent) + '44'}`,
    },
  }, children);
}

function Spinner() {
  return h('div', {
    style: {
      width: 20, height: 20, border: `2px solid ${C.border}`,
      borderTop: `2px solid ${C.accent}`, borderRadius: '50%',
      animation: 'spin 0.8s linear infinite', margin: '0 auto',
    },
  });
}

function ErrorBox({ msg }) {
  if (!msg) return null;
  return h('div', {
    style: {
      margin: '8px 0', padding: '10px 14px', background: C.danger + '15',
      border: `1px solid ${C.danger}44`, borderRadius: 8, color: C.danger, fontSize: 13,
    },
  }, `⚠️ ${msg}`);
}

function WarnBox({ msg }) {
  if (!msg) return null;
  return h('div', {
    style: {
      margin: '8px 0', padding: '10px 14px', background: C.warning + '15',
      border: `1px solid ${C.warning}44`, borderRadius: 8, color: C.warning, fontSize: 13,
    },
  }, `⚡ ${msg}`);
}

function Select({ value, onChange, options, style }) {
  return h('select', {
    value,
    onChange: (e) => onChange(e.target.value),
    style: {
      padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
      background: C.card, color: C.text, fontSize: 13, cursor: 'pointer',
      outline: 'none', ...style,
    },
  },
    options.map(({ value: v, label }) => h('option', { key: v, value: v }, label))
  );
}

function Button({ onClick, children, variant = 'default', disabled, style: extraStyle }) {
  const colors = {
    default: { bg: C.accent, hover: C.accentHover, text: '#fff' },
    danger: { bg: C.danger, hover: C.dangerHover, text: '#fff' },
    ghost: { bg: 'transparent', hover: C.border, text: C.subtext },
  };
  const c = colors[variant] || colors.default;
  return h('button', {
    onClick,
    disabled,
    style: {
      padding: '6px 14px', borderRadius: 6, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
      background: c.bg, color: c.text, fontSize: 13, fontWeight: 500,
      opacity: disabled ? 0.5 : 1, transition: 'background 0.15s', ...extraStyle,
    },
  }, children);
}

// ─── Browse タブ ────────────────────────────────────────────────────────────────
function BrowseTab({ api, personas }) {
  const [personaId, setPersonaId] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async (pg = 0, pid = personaId) => {
    setLoading(true);
    setError('');
    const res = await api.ipc.invoke('list', { personaId: pid || undefined, limit, offset: pg * limit });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setRows(res.rows || []);
    setTotal(res.total || 0);
  }, [personaId, limit]);

  useEffect(() => { load(0, personaId); }, [personaId]);

  const handleDelete = async (id) => {
    if (!confirm(`このメモリを削除しますか？\n\nID: ${id}`)) return;
    setDeleting(id);
    const res = await api.ipc.invoke('delete-memory', { id });
    setDeleting(null);
    if (res.error) { setError(res.error); return; }
    load(page);
  };

  const personaOptions = [
    { value: '', label: '全ペルソナ' },
    ...personas.map((p) => ({ value: p.id, label: `${p.id} (${p.count})` })),
  ];

  const totalPages = Math.ceil(total / limit);

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
    // ── ツールバー
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`, flexShrink: 0, flexWrap: 'wrap',
      },
    },
      h(Select, { value: personaId, onChange: (v) => { setPersonaId(v); setPage(0); }, options: personaOptions }),
      h('span', { style: { color: C.subtext, fontSize: 12, marginLeft: 4 } }, `${total} 件`),
      h('div', { style: { flex: 1 } }),
      loading && h(Spinner),
      h(Button, { onClick: () => load(page), disabled: loading, style: { padding: '5px 12px' } }, '🔄 更新'),
    ),
    h(ErrorBox, { msg: error }),

    // ── テーブル
    h('div', { style: { flex: 1, overflow: 'auto', padding: '0 8px 8px' } },
      h('table', {
        style: {
          width: '100%', borderCollapse: 'collapse', fontSize: 12,
          tableLayout: 'fixed',
        },
      },
        h('colgroup', null,
          h('col', { style: { width: '36%' } }),
          h('col', { style: { width: '18%' } }),
          h('col', { style: { width: '12%' } }),
          h('col', { style: { width: '8%' } }),
          h('col', { style: { width: '18%' } }),
          h('col', { style: { width: '8%' } }),
        ),
        h('thead', null,
          h('tr', { style: { borderBottom: `1px solid ${C.border}` } },
            ...['コンテンツ', 'ペルソナ', '重要度', 'アクセス', '作成日時', '操作'].map((col) =>
              h('th', {
                key: col,
                style: { padding: '8px 10px', textAlign: 'left', color: C.subtext, fontWeight: 600, position: 'sticky', top: 0, background: C.bg },
              }, col)
            )
          )
        ),
        h('tbody', null,
          rows.map((row) => {
            const isExpanded = expandedId === row.id;
            return [
              h('tr', {
                key: row.id,
                onClick: () => setExpandedId(isExpanded ? null : row.id),
                style: {
                  cursor: 'pointer', transition: 'background 0.1s',
                  background: isExpanded ? C.card : 'transparent',
                  borderBottom: `1px solid ${C.border}22`,
                },
              },
                h('td', { style: { padding: '8px 10px', color: C.text, wordBreak: 'break-word' } },
                  truncate(row.content, 80)
                ),
                h('td', { style: { padding: '8px 10px', color: C.subtext } },
                  h(Badge, null, truncate(row.persona_id, 14))
                ),
                h('td', { style: { padding: '8px 10px' } }, importanceBar(row.importance)),
                h('td', { style: { padding: '8px 10px', color: C.subtext, textAlign: 'center' } }, row.access_count),
                h('td', { style: { padding: '8px 10px', color: C.subtext } }, fmtDate(row.created_at)),
                h('td', { style: { padding: '8px 10px' } },
                  h('button', {
                    onClick: (e) => { e.stopPropagation(); handleDelete(row.id); },
                    disabled: deleting === row.id,
                    style: {
                      padding: '3px 8px', borderRadius: 4, border: 'none',
                      background: C.danger + '22', color: C.danger, cursor: 'pointer', fontSize: 11,
                    },
                  }, deleting === row.id ? '…' : '削除')
                ),
              ),
              isExpanded && h('tr', { key: `${row.id}-expand` },
                h('td', { colSpan: 6, style: { padding: '12px 16px', background: C.card } },
                  h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
                    h('div', { style: { color: C.text, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 } }, row.content),
                    h('div', { style: { display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 8, borderTop: `1px solid ${C.border}` } },
                      h('span', { style: { color: C.subtext, fontSize: 11 } }, `ID: ${row.id}`),
                      row.session_id && h('span', { style: { color: C.subtext, fontSize: 11 } }, `セッション: ${row.session_id}`),
                      h('span', { style: { color: C.subtext, fontSize: 11 } }, `最終アクセス: ${fmtDate(row.accessed_at)}`),
                    ),
                  )
                )
              ),
            ];
          })
        )
      )
    ),

    // ── ページネーション
    totalPages > 1 && h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '10px', borderTop: `1px solid ${C.border}`, flexShrink: 0,
      },
    },
      h(Button, { onClick: () => { setPage(page - 1); load(page - 1); }, disabled: page === 0, variant: 'ghost' }, '← 前'),
      h('span', { style: { color: C.subtext, fontSize: 12 } }, `${page + 1} / ${totalPages}`),
      h(Button, { onClick: () => { setPage(page + 1); load(page + 1); }, disabled: page >= totalPages - 1, variant: 'ghost' }, '次 →'),
    )
  );
}

// ─── Search タブ ────────────────────────────────────────────────────────────────
function SearchTab({ api, personas }) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('text');
  const [personaId, setPersonaId] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setWarning('');
    const channel = searchType === 'semantic' ? 'search-semantic' : 'search-text';
    const res = await api.ipc.invoke(channel, { query: query.trim(), personaId: personaId || undefined });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    if (res.warning) setWarning(res.warning);
    setResults(res.results || []);
  };

  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) handleSearch(); };

  const personaOptions = [
    { value: '', label: '全ペルソナ' },
    ...personas.map((p) => ({ value: p.id, label: `${p.id} (${p.count})` })),
  ];

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
    // ── 検索バー
    h('div', {
      style: {
        display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px',
        borderBottom: `1px solid ${C.border}`, flexShrink: 0,
      },
    },
      h('div', { style: { display: 'flex', gap: 8 } },
        h('input', {
          value: query,
          onChange: (e) => setQuery(e.target.value),
          onKeyDown: onKey,
          placeholder: '検索クエリを入力… (Enter で検索)',
          style: {
            flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.card, color: C.text, fontSize: 13, outline: 'none',
          },
        }),
        h(Button, { onClick: handleSearch, disabled: loading || !query.trim() },
          loading ? '検索中…' : '🔍 検索'
        ),
      ),
      h('div', { style: { display: 'flex', gap: 10, alignItems: 'center' } },
        h(Select, { value: personaId, onChange: setPersonaId, options: personaOptions }),
        h('div', {
          style: {
            display: 'flex', borderRadius: 6, border: `1px solid ${C.border}`,
            overflow: 'hidden',
          },
        },
          ['text', 'semantic'].map((type) =>
            h('button', {
              key: type,
              onClick: () => setSearchType(type),
              style: {
                padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 12,
                background: searchType === type ? C.accent : C.card,
                color: searchType === type ? '#fff' : C.subtext,
              },
            }, type === 'text' ? '📝 テキスト' : '🧠 セマンティック')
          )
        ),
        results.length > 0 && h(Badge, { color: C.accent }, `${results.length} 件`),
      ),
    ),
    h(ErrorBox, { msg: error }),
    h(WarnBox, { msg: warning }),

    // ── 結果一覧
    h('div', { style: { flex: 1, overflow: 'auto', padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 } },
      results.length === 0 && !loading && h('div', { style: { color: C.subtext, textAlign: 'center', marginTop: 40 } }, '検索結果がありません'),
      results.map((r) => {
        const isExp = expandedId === r.id;
        return h('div', {
          key: r.id,
          onClick: () => setExpandedId(isExp ? null : r.id),
          style: {
            borderRadius: 8, border: `1px solid ${isExp ? C.borderActive : C.border}`,
            background: C.card, padding: '10px 14px', cursor: 'pointer',
            transition: 'all 0.15s',
          },
        },
          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: 10 } },
            r.score !== null && h('div', {
              style: {
                flexShrink: 0, width: 48, textAlign: 'center',
                padding: '4px 0', borderRadius: 6,
                background: scoreColor(r.score) + '18',
                color: scoreColor(r.score), fontSize: 12, fontWeight: 700,
              },
            }, typeof r.score === 'number' ? (r.score * 100).toFixed(0) + '%' : '—'),
            h('div', { style: { flex: 1, minWidth: 0 } },
              h('div', {
                style: {
                  fontSize: 13, color: C.text, lineHeight: 1.5,
                  ...(isExp ? { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                },
              }, r.content),
              isExp && h('div', {
                style: { display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' },
              },
                h('span', { style: { fontSize: 11, color: C.subtext } }, `ペルソナ: ${r.persona_id}`),
                h('span', { style: { fontSize: 11, color: C.subtext } }, `作成: ${fmtDate(r.created_at)}`),
                r.session_id && h('span', { style: { fontSize: 11, color: C.subtext } }, `セッション: ${r.session_id}`),
                h('span', { style: { fontSize: 11, color: C.subtext } }, `重要度: ${Math.round((Number(r.importance) || 0) * 100)}%`),
              ),
            ),
            h(Badge, null, truncate(r.persona_id, 12)),
          )
        );
      })
    )
  );
}

// ─── Query タブ ─────────────────────────────────────────────────────────────────
const EXAMPLE_QUERIES = [
  { label: '最新 20 件', sql: 'SELECT id, persona_id, content, importance, created_at\nFROM chat_memories\nORDER BY created_at DESC\nLIMIT 20;' },
  { label: 'ペルソナ別カウント', sql: 'SELECT persona_id, COUNT(*) AS count\nFROM chat_memories\nGROUP BY persona_id\nORDER BY count DESC;' },
  { label: '重要度 TOP10', sql: 'SELECT id, persona_id, content, importance\nFROM chat_memories\nORDER BY importance DESC\nLIMIT 10;' },
  { label: 'アクセス回数 TOP10', sql: 'SELECT id, persona_id, content, access_count\nFROM chat_memories\nORDER BY access_count DESC\nLIMIT 10;' },
  { label: 'エンベディングなし', sql: 'SELECT COUNT(*) AS count\nFROM chat_memories\nWHERE embedding IS NULL;' },
  { label: 'テーブル情報', sql: "SELECT name, sql FROM sqlite_master WHERE type='table';", readonly: true },
];

function QueryTab({ api }) {
  const [sql, setSql] = useState('SELECT id, persona_id, content, importance, created_at\nFROM chat_memories\nORDER BY created_at DESC\nLIMIT 20;');
  const [readonly, setReadonly] = useState(true);
  const [tables, setTables] = useState([]);
  const [rowsModified, setRowsModified] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const execute = async () => {
    if (!sql.trim()) return;
    setLoading(true);
    setError('');
    setTables([]);
    setRowsModified(null);
    const res = await api.ipc.invoke('execute-sql', { sql, readonly });
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setTables(res.tables || []);
    setRowsModified(res.rowsModified ?? null);
  };

  return h('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' } },
    // ── エディタエリア
    h('div', {
      style: {
        padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: 8,
      },
    },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        h('span', { style: { color: C.subtext, fontSize: 13, fontWeight: 600 } }, '📋 クエリ例:'),
        EXAMPLE_QUERIES.map((ex) =>
          h('button', {
            key: ex.label,
            onClick: () => setSql(ex.sql),
            style: {
              padding: '3px 9px', borderRadius: 5, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.subtext, cursor: 'pointer', fontSize: 11,
            },
          }, ex.label)
        )
      ),
      h('textarea', {
        value: sql,
        onChange: (e) => setSql(e.target.value),
        rows: 6,
        spellCheck: false,
        style: {
          width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${C.border}`,
          background: C.card, color: C.text, fontSize: 13, fontFamily: 'monospace',
          resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box',
        },
      }),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 12 } },
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 } },
          h('input', {
            type: 'checkbox',
            checked: readonly,
            onChange: (e) => setReadonly(e.target.checked),
            style: { accentColor: C.accent },
          }),
          h('span', { style: { color: readonly ? C.success : C.warning } },
            readonly ? '🔒 読み取り専用' : '✏️ 書き込みモード'
          )
        ),
        !readonly && h('span', { style: { fontSize: 11, color: C.warning } },
          '⚠️ チャット使用中は書き込み操作を避けてください'
        ),
        h('div', { style: { flex: 1 } }),
        rowsModified !== null && h(Badge, { color: C.success }, `${rowsModified} 行更新`),
        loading && h(Spinner),
        h(Button, { onClick: execute, disabled: loading || !sql.trim() },
          loading ? '実行中…' : '▶ 実行'
        ),
      ),
    ),
    h(ErrorBox, { msg: error }),

    // ── 結果テーブル
    h('div', { style: { flex: 1, overflow: 'auto', padding: '8px' } },
      tables.length === 0 && !loading && !error && h('div', {
        style: { color: C.subtext, textAlign: 'center', marginTop: 40, fontSize: 13 },
      }, '上のエディタで SQL を入力して実行してください'),
      tables.map((table, ti) =>
        h('div', { key: ti, style: { marginBottom: 16 } },
          tables.length > 1 && h('div', { style: { color: C.subtext, fontSize: 11, marginBottom: 4 } }, `結果 ${ti + 1}`),
          h('div', { style: { overflowX: 'auto' } },
            h('table', {
              style: { borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' },
            },
              h('thead', null,
                h('tr', null,
                  table.columns.map((col) =>
                    h('th', {
                      key: col,
                      style: {
                        padding: '7px 12px', textAlign: 'left', color: C.subtext,
                        fontWeight: 600, borderBottom: `1px solid ${C.border}`,
                        background: C.surface, position: 'sticky', top: 0,
                        whiteSpace: 'nowrap',
                      },
                    }, col)
                  )
                )
              ),
              h('tbody', null,
                table.rows.map((row, ri) =>
                  h('tr', {
                    key: ri,
                    style: { borderBottom: `1px solid ${C.border}22`, background: ri % 2 === 0 ? 'transparent' : C.card + '44' },
                  },
                    table.columns.map((col) => {
                      const val = row[col];
                      const disp = val === null || val === undefined ? h('span', { style: { color: C.subtext } }, 'NULL')
                        : String(val).length > 120 ? truncate(String(val), 120) : String(val);
                      return h('td', {
                        key: col,
                        style: {
                          padding: '6px 12px', color: C.text,
                          maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontFamily: typeof val === 'number' ? 'monospace' : 'inherit',
                        },
                        title: val !== null && val !== undefined ? String(val) : '',
                      }, disp);
                    })
                  )
                )
              )
            )
          ),
          h('div', { style: { color: C.subtext, fontSize: 11, marginTop: 4 } }, `${table.rows.length} 件`)
        )
      )
    )
  );
}

// ─── Stats タブ ─────────────────────────────────────────────────────────────────
function StatsTab({ api, personas }) {
  const [stats, setStats] = useState(null);
  const [personaStats, setPersonaStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clearTarget, setClearTarget] = useState('');
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await api.ipc.invoke('get-stats', {});
    setLoading(false);
    if (res.error) { setError(res.error); return; }
    setStats(res.stats);
    setPersonaStats(res.personaStats || []);
  }, []);

  useEffect(() => { load(); }, []);

  const handleClear = async () => {
    if (!clearTarget) return;
    if (!confirm(`「${clearTarget}」のメモリをすべて削除しますか？\nこの操作は取り消せません。`)) return;
    setClearing(true);
    const res = await api.ipc.invoke('clear-persona', { personaId: clearTarget });
    setClearing(false);
    if (res.error) { setError(res.error); return; }
    setClearTarget('');
    load();
  };

  const personaOptions = [
    { value: '', label: 'ペルソナを選択…' },
    ...personas.map((p) => ({ value: p.id, label: `${p.id} (${p.count})` })),
  ];

  return h('div', { style: { flex: 1, overflow: 'auto', padding: '14px' } },
    loading && h('div', { style: { textAlign: 'center', padding: 40 } }, h(Spinner)),
    h(ErrorBox, { msg: error }),
    stats && h('div', { style: { display: 'flex', flexDirection: 'column', gap: 16 } },
      // ── サマリカード
      h('div', { style: { display: 'flex', gap: 12, flexWrap: 'wrap' } },
        [
          { label: '総メモリ数', value: stats.total?.toLocaleString(), icon: '🗃️', color: C.accent },
          { label: 'エンベディング有', value: stats.withEmbedding != null ? `${stats.withEmbedding} / ${stats.total}` : '—', icon: '🧠', color: C.success },
          { label: 'DB ファイルサイズ', value: fmtBytes(stats.fileSize), icon: '💾', color: C.warning },
          { label: '平均重要度', value: stats.avgImportance != null ? `${Math.round(stats.avgImportance * 100)}%` : '—', icon: '⭐', color: C.scoreMid },
        ].map(({ label, value, icon, color }) =>
          h('div', {
            key: label,
            style: {
              flex: '1 1 140px', background: C.card, borderRadius: 10,
              border: `1px solid ${C.border}`, padding: '14px 16px',
            },
          },
            h('div', { style: { fontSize: 22, marginBottom: 4 } }, icon),
            h('div', { style: { fontSize: 20, fontWeight: 700, color } }, value ?? '—'),
            h('div', { style: { fontSize: 11, color: C.subtext, marginTop: 2 } }, label),
          )
        )
      ),

      // ── 期間
      stats.oldestTs && stats.newestTs && h('div', {
        style: { background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: '12px 16px' },
      },
        h('div', { style: { fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 } }, '📅 期間'),
        h('div', { style: { display: 'flex', gap: 20, flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 12, color: C.subtext } }, `最古: ${fmtDate(stats.oldestTs)}`),
          h('span', { style: { fontSize: 12, color: C.subtext } }, `最新: ${fmtDate(stats.newestTs)}`),
        )
      ),

      // ── ペルソナ別テーブル
      personaStats.length > 0 && h('div', {
        style: { background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' },
      },
        h('div', { style: { padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.text } },
          '👤 ペルソナ別統計'
        ),
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          h('thead', null,
            h('tr', null,
              ['ペルソナ ID', '件数', '平均重要度', '平均アクセス', 'エンベディング'].map((col) =>
                h('th', {
                  key: col,
                  style: { padding: '8px 16px', textAlign: 'left', color: C.subtext, fontWeight: 600, borderBottom: `1px solid ${C.border}` },
                }, col)
              )
            )
          ),
          h('tbody', null,
            personaStats.map((ps, i) =>
              h('tr', {
                key: ps.personaId,
                style: { borderBottom: `1px solid ${C.border}22`, background: i % 2 === 0 ? 'transparent' : C.surface + '44' },
              },
                h('td', { style: { padding: '8px 16px', color: C.text } },
                  h(Badge, null, ps.personaId)
                ),
                h('td', { style: { padding: '8px 16px', color: C.text, fontWeight: 600 } }, ps.count?.toLocaleString()),
                h('td', { style: { padding: '8px 16px' } }, importanceBar(ps.avgImportance)),
                h('td', { style: { padding: '8px 16px', color: C.subtext } }, (ps.avgAccessCount || 0).toFixed(1)),
                h('td', { style: { padding: '8px 16px', color: C.subtext } },
                  `${ps.withEmbedding ?? 0} / ${ps.count}`
                ),
              )
            )
          )
        )
      ),

      // ── 削除操作
      h('div', {
        style: {
          background: C.card, borderRadius: 10, border: `1px solid ${C.danger}33`, padding: '14px 16px',
        },
      },
        h('div', { style: { fontSize: 13, fontWeight: 600, color: C.danger, marginBottom: 10 } }, '🗑️ ペルソナのメモリを全削除'),
        h('div', { style: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' } },
          h(Select, { value: clearTarget, onChange: setClearTarget, options: personaOptions }),
          h(Button, {
            onClick: handleClear,
            variant: 'danger',
            disabled: !clearTarget || clearing,
          }, clearing ? '削除中…' : '全削除'),
        ),
        h('div', { style: { marginTop: 8, fontSize: 11, color: C.subtext } },
          '※ チャット中は操作を避けてください。削除後の復元はできません。'
        ),
      ),

      h(Button, { onClick: load, style: { alignSelf: 'flex-start' }, disabled: loading }, '🔄 統計を更新'),
    )
  );
}

// ─── メインページ ──────────────────────────────────────────────────────────────
function MemoryBrowserPage({ api }) {
  const [tab, setTab] = useState('browse');
  const [personas, setPersonas] = useState([]);
  const [initError, setInitError] = useState('');

  useEffect(() => {
    api.ipc.invoke('get-personas', {}).then((res) => {
      if (res.error) { setInitError(res.error); return; }
      setPersonas(res.personas || []);
    });
  }, []);

  const tabs = [
    { id: 'browse', label: '一覧', icon: '📋' },
    { id: 'search', label: '検索', icon: '🔍' },
    { id: 'query', label: 'クエリ', icon: '💻' },
    { id: 'stats', label: '統計', icon: '📊' },
  ];

  const refreshPersonas = () => {
    api.ipc.invoke('get-personas', {}).then((res) => {
      if (!res.error) setPersonas(res.personas || []);
    });
  };

  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column', height: '100%',
      background: C.bg, color: C.text, fontFamily: "'Segoe UI', system-ui, sans-serif",
      fontSize: 14, overflow: 'hidden',
    },
  },
    // ── ヘッダー
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
        borderBottom: `1px solid ${C.border}`, flexShrink: 0, background: C.surface,
      },
    },
      h('span', { style: { fontSize: 18 } }, '🗄️'),
      h('span', { style: { fontWeight: 700, fontSize: 15 } }, 'Memory Browser'),
      h('div', { style: { flex: 1 } }),
      personas.length > 0 && h(Badge, { color: C.accent }, `${personas.reduce((s, p) => s + p.count, 0)} 件`),
      h('button', {
        onClick: refreshPersonas,
        style: {
          padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`,
          background: 'transparent', color: C.subtext, cursor: 'pointer', fontSize: 12,
        },
      }, '↺'),
    ),

    initError && h(ErrorBox, { msg: initError }),

    // ── タブバー
    h(TabBar, { tabs, active: tab, onChange: setTab }),

    // ── コンテンツ
    h('div', { style: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } },
      tab === 'browse' && h(BrowseTab, { api, personas }),
      tab === 'search' && h(SearchTab, { api, personas }),
      tab === 'query' && h(QueryTab, { api }),
      tab === 'stats' && h(StatsTab, { api, personas }),
    ),

    // ── スタイル注入（アニメーション）
    h('style', null, `
      @keyframes spin { to { transform: rotate(360deg); } }
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
      input, textarea, select { transition: border-color 0.15s; }
      input:focus, textarea:focus, select:focus { border-color: ${C.accent} !important; }
      button:not(:disabled):hover { opacity: 0.85; }
      tr:hover td { background: ${C.card} !important; }
    `),
  );
}

// ─── エクスポート ──────────────────────────────────────────────────────────────
export default {
  pages: {
    'memory-browser': MemoryBrowserPage,
  },
};
