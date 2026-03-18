/**
 * arischat-ext-sysmon / dist/renderer.js
 *
 * extension-loader が先頭に以下を注入:
 *   const React = window.__ARISCHAT_REACT__;
 *   const { useState, useEffect, ... } = React;
 */

// ===== ユーティリティ =====

function fmt(bytes) {
  if (bytes == null || bytes === 0) return '0 B';
  const k = 1024;
  const s = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + s[i];
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return d + '日 ' + h + '時間';
  if (h > 0) return h + '時間 ' + m + '分';
  return m + '分';
}

function osName(p) {
  if (p === 'win32')  return 'Windows';
  if (p === 'darwin') return 'macOS';
  if (p === 'linux')  return 'Linux';
  return p;
}

function color(pct) {
  if (pct == null) return 'rgba(255,255,255,0.3)';
  if (pct < 50)   return '#10b981';
  if (pct < 80)   return '#f59e0b';
  return '#ef4444';
}

// ===== 基本部品 =====

const e = React.createElement;

function Bar({ pct }) {
  if (pct == null) {
    return e('div', {
      style: {
        width: '100%', height: '5px', marginTop: '6px',
        backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '99px',
      },
    });
  }
  return e('div', {
    style: {
      width: '100%', height: '5px', marginTop: '6px',
      backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden',
    },
  },
    e('div', {
      style: {
        width: Math.min(100, pct) + '%', height: '100%',
        backgroundColor: color(pct),
        borderRadius: '99px', transition: 'width 0.5s ease',
      },
    }),
  );
}

function Card({ title, icon, children }) {
  return e('div', {
    style: {
      padding: '12px', marginBottom: '8px',
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.07)',
    },
  },
    e('div', {
      style: {
        fontSize: '9px', fontWeight: '700',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.3)', marginBottom: '8px',
        display: 'flex', alignItems: 'center', gap: '4px',
      },
    },
      icon ? e('span', null, icon) : null,
      title,
    ),
    children,
  );
}

function BigNum({ val, unit, clr }) {
  return e('div', { style: { display: 'flex', alignItems: 'baseline', gap: '3px' } },
    e('span', { style: { fontSize: '26px', fontWeight: '700', lineHeight: 1, color: clr } },
      val != null ? val : '—'
    ),
    e('span', { style: { fontSize: '12px', color: 'rgba(255,255,255,0.4)' } }, unit),
  );
}

function InfoGrid({ items }) {
  return e('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' } },
    ...items.map(function(item) {
      return e('div', { key: item.label },
        e('div', {
          style: {
            fontSize: '9px', color: 'rgba(255,255,255,0.28)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          },
        }, item.label),
        e('div', {
          style: {
            fontSize: '11px', color: 'rgba(255,255,255,0.75)',
            marginTop: '2px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          },
          title: item.value,
        }, item.value != null ? String(item.value) : '—'),
      );
    }),
  );
}

// ===== GPU カード =====

function GpuCard({ gpu }) {
  const vendorIcon = gpu.vendor === 'NVIDIA' ? '🟢' : gpu.vendor === 'AMD' ? '🔴' : '🔵';
  const hasUsage   = gpu.usage     != null;
  const hasMem     = gpu.memTotal  != null;
  const hasTemp    = gpu.temp      != null;

  return e(Card, { title: gpu.name, icon: vendorIcon },
    // 使用率
    hasUsage
      ? e('div', null,
          e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
            e(BigNum, { val: gpu.usage.toFixed(1), unit: '%', clr: color(gpu.usage) }),
            hasTemp
              ? e('span', {
                  style: { fontSize: '11px', color: 'rgba(255,255,255,0.4)' },
                }, gpu.temp + ' °C')
              : null,
          ),
          e(Bar, { pct: gpu.usage }),
        )
      : e('div', {
          style: { fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginBottom: '6px' },
        }, '使用率: 取得不可'),

    // VRAM
    hasMem
      ? e('div', { style: { marginTop: '10px' } },
          e('div', {
            style: {
              fontSize: '9px', color: 'rgba(255,255,255,0.28)',
              textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px',
            },
          }, 'VRAM'),
          e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
            gpu.memPercent != null
              ? e(BigNum, { val: gpu.memPercent.toFixed(1), unit: '%', clr: color(gpu.memPercent) })
              : e('span', { style: { fontSize: '13px', color: 'rgba(255,255,255,0.5)' } }, '—'),
            e('span', { style: { fontSize: '11px', color: 'rgba(255,255,255,0.35)' } },
              (gpu.memUsed != null ? fmt(gpu.memUsed) : '—') + ' / ' + fmt(gpu.memTotal),
            ),
          ),
          e(Bar, { pct: gpu.memPercent }),
        )
      : null,
  );
}

// ===== メインパネル =====

function SysMonPanel({ api }) {
  const [metrics, setMetrics] = useState(null);
  const [err,     setErr]     = useState(null);

  useEffect(function() {
    let alive = true;

    function poll() {
      api.ipc.invoke('get-metrics')
        .then(function(data) { if (alive) { setMetrics(data); setErr(null); } })
        .catch(function(ex)  { if (alive) setErr(String(ex?.message ?? ex)); });
    }

    poll();
    const id = setInterval(poll, 1000);
    return function() { alive = false; clearInterval(id); };
  }, []);

  if (!metrics && !err) {
    return e('div', {
      style: {
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.3)', fontSize: '12px',
      },
    }, '読み込み中...');
  }

  if (err) {
    return e('div', {
      style: {
        margin: '10px', padding: '12px', borderRadius: '8px',
        backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: '12px',
      },
    }, '⚠ ' + err);
  }

  const { cpu, memory, gpus, platform, arch, hostname, uptime } = metrics;

  return e('div', { style: { padding: '10px', color: 'rgba(255,255,255,0.8)' } },

    // CPU
    e(Card, { title: 'CPU', icon: '🖥️' },
      e('div', {
        style: {
          fontSize: '10px', color: 'rgba(255,255,255,0.35)',
          marginBottom: '6px',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        },
        title: cpu.model,
      }, cpu.model),
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        e(BigNum, { val: cpu.usage.toFixed(1), unit: '%', clr: color(cpu.usage) }),
        e('span', { style: { fontSize: '11px', color: 'rgba(255,255,255,0.35)' } }, cpu.cores + ' コア'),
      ),
      e(Bar, { pct: cpu.usage }),
    ),

    // メモリ
    e(Card, { title: 'メモリ', icon: '💾' },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
        e(BigNum, { val: memory.percent.toFixed(1), unit: '%', clr: color(memory.percent) }),
        e('span', { style: { fontSize: '11px', color: 'rgba(255,255,255,0.35)' } },
          fmt(memory.used) + ' / ' + fmt(memory.total),
        ),
      ),
      e(Bar, { pct: memory.percent }),
      e('div', {
        style: {
          marginTop: '6px', fontSize: '10px',
          color: 'rgba(255,255,255,0.28)',
          display: 'flex', justifyContent: 'space-between',
        },
      },
        e('span', null, '空き: ' + fmt(memory.free)),
        e('span', null, '合計: ' + fmt(memory.total)),
      ),
    ),

    // GPU (複数対応)
    gpus && gpus.length > 0
      ? gpus.map(function(gpu) {
          return e(GpuCard, { key: gpu.index, gpu });
        })
      : e(Card, { title: 'GPU', icon: '🎮' },
          e('div', {
            style: { fontSize: '11px', color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '8px 0' },
          }, 'GPU 情報を取得できませんでした'),
        ),

    // システム情報
    e(Card, { title: 'システム情報', icon: 'ℹ️' },
      e(InfoGrid, {
        items: [
          { label: 'OS',       value: osName(platform) },
          { label: 'アーキテクチャ', value: arch },
          { label: 'ホスト名',  value: hostname },
          { label: '稼働時間',  value: fmtUptime(uptime) },
        ],
      }),
    ),
  );
}

// ===== エクスポート =====

export default {
  rightPanels: {
    sysmon: SysMonPanel,
  },
};
