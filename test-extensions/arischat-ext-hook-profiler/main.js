/**
 * arschat-ext-hook-profiler - Main Entry (CommonJS)
 *
 * 全 8 フックイベントをリッスンし、処理時間を計測してレンダラーへ送信する。
 * CUDA Nsight Systems ライクなタイムラインビューで可視化できるデータ形式で提供。
 *
 * @param {import('../../src/main/extension-context').ExtensionContext} ctx
 */

const ALL_EVENTS = [
  'chat:beforeSend',
  'memory:beforeSearch',
  'memory:beforeStore',
  'chat:afterResponse',
  'session:beforeSave',
  'tool:beforeExecute',
  'tool:afterExecute',
];

function activate(ctx) {
  ctx.log.info('Hook Profiler: activate()');

  // ===== 状態管理 =====

  /** 完了済みラン */
  const runs = [];

  /** 進行中のラン */
  let currentRun = null;

  /** イベントごとの集計統計 */
  const stats = {};
  for (const name of ALL_EVENTS) {
    stats[name] = { count: 0, latencies: [] };
  }


  // ===== ヘルパー =====

  function now() {
    return Date.now();
  }

  function startRun() {
    // 前のランが完了していない場合は強制終了
    if (currentRun) {
      currentRun.endTime = now();
      currentRun.incomplete = true;
      runs.push(currentRun);
      if (runs.length > 50) runs.shift(); // 最大50ラン保持
    }
    currentRun = {
      id: `run-${Date.now()}`,
      startTime: now(),
      endTime: null,
      incomplete: false,
      events: [],
      stats: null,
    };
    sendStateNow();
  }

  function finalizeRun(runStats) {
    if (!currentRun) return;
    currentRun.endTime = now();
    currentRun.stats = runStats ?? null;
    // チャンクをまとめてレンジとして追加
    runs.push(currentRun);
    if (runs.length > 50) runs.shift();
    currentRun = null;
    sendStateNow();
  }

  function addEvent(name, relTime, meta) {
    if (!currentRun) return;
    if (name === 'chat:onChunk') return; // チャンクは別途集計
    currentRun.events.push({ name, relTime, meta: meta ?? null });
    sendState();
  }

  function updateStats(name, relTime) {
    if (!stats[name]) return;
    stats[name].count++;
    if (relTime !== null && relTime >= 0) {
      stats[name].latencies.push(relTime);
      // 直近100件のみ保持（メモリ節約）
      if (stats[name].latencies.length > 100) {
        stats[name].latencies.shift();
      }
    }
  }

  function getAvgLatency(name) {
    const lats = stats[name]?.latencies ?? [];
    if (lats.length === 0) return null;
    return Math.round(lats.reduce((a, b) => a + b, 0) / lats.length);
  }

  let _sendTimer = null;
  function buildStatePayload() {
    const summary = {};
    for (const name of ALL_EVENTS) {
      summary[name] = {
        count: stats[name].count,
        avgLatency: getAvgLatency(name),
        lastLatency: stats[name].latencies.at(-1) ?? null,
      };
    }
    return { runs: runs.slice(-20), currentRun, summary };
  }

  // 通常更新: 50ms スロットル（onChunk 連打でも詰まらない）
  function sendState() {
    if (_sendTimer) return;
    _sendTimer = setTimeout(() => {
      _sendTimer = null;
      ctx.ipc.send('state-update', buildStatePayload());
    }, 50);
  }

  // ラン開始・終了など重要な変化は即時送信
  function sendStateNow() {
    if (_sendTimer) { clearTimeout(_sendTimer); _sendTimer = null; }
    ctx.ipc.send('state-update', buildStatePayload());
  }

  // ===== フックリスナー登録 =====

  // --- chat:beforeSend ---
  ctx.hooks.on('chat:beforeSend', (payload) => {
    startRun();
    const relTime = 0;
    updateStats('chat:beforeSend', relTime);
    addEvent('chat:beforeSend', relTime, {
      messageCount: payload.messages.length,
    });
    sendState();
  });

  // --- memory:beforeSearch ---
  ctx.hooks.on('memory:beforeSearch', (payload) => {
    const relTime = currentRun ? now() - currentRun.startTime : null;
    updateStats('memory:beforeSearch', relTime);
    addEvent('memory:beforeSearch', relTime, { personaId: payload.personaId });
  });


  // --- chat:afterResponse ---
  ctx.hooks.on('chat:afterResponse', (payload) => {
    const relTime = currentRun ? now() - currentRun.startTime : null;
    updateStats('chat:afterResponse', relTime);
    // afterResponse のタイミングを events に追加してからランを完了
    if (currentRun && relTime !== null) {
      currentRun.events.push({
        name: 'chat:afterResponse',
        relTime,
        meta: {
          responseLength: payload.response?.length ?? 0,
          tokensPerSec: payload.stats?.tokensPerSec ?? null,
          totalTokens: payload.stats?.totalTokens ?? null,
          timeSeconds: payload.stats?.timeSeconds ?? null,
        },
      });
    }
    finalizeRun(payload.stats);
  });

  // --- memory:beforeStore ---
  ctx.hooks.on('memory:beforeStore', (payload) => {
    const relTime = currentRun ? now() - currentRun.startTime : null;
    updateStats('memory:beforeStore', relTime);
    addEvent('memory:beforeStore', relTime, { personaId: payload.personaId });
  });

  // --- session:beforeSave ---
  ctx.hooks.on('session:beforeSave', () => {
    const relTime = currentRun ? now() - currentRun.startTime : null;
    updateStats('session:beforeSave', relTime);
    addEvent('session:beforeSave', relTime, null);
  });

  // --- tool:beforeExecute ---
  ctx.hooks.on('tool:beforeExecute', (payload) => {
    const relTime = currentRun ? now() - currentRun.startTime : null;
    updateStats('tool:beforeExecute', relTime);
    addEvent('tool:beforeExecute', relTime, {
      toolName: payload.toolName,
      inputKeys: Object.keys(payload.input ?? {}),
    });
  });

  // --- tool:afterExecute ---
  ctx.hooks.on('tool:afterExecute', (payload) => {
    const relTime = currentRun ? now() - currentRun.startTime : null;
    updateStats('tool:afterExecute', relTime);
    addEvent('tool:afterExecute', relTime, {
      toolName: payload.toolName,
      resultLength: payload.result?.length ?? 0,
    });
  });

  // レンダラーから初期状態を要求された時
  ctx.ipc.handle('get-state', async () => {
    const summary = {};
    for (const name of ALL_EVENTS) {
      summary[name] = {
        count: stats[name].count,
        avgLatency: getAvgLatency(name),
        lastLatency: stats[name].latencies.at(-1) ?? null,
      };
    }
    return {
      runs: runs.slice(-20),
      currentRun,
      summary,
    };
  });

  // レンダラーからクリア要求
  ctx.ipc.handle('clear-runs', async () => {
    runs.length = 0;
    for (const name of ALL_EVENTS) {
      stats[name] = { count: 0, latencies: [] };
    }
    currentRun = null;
    sendState();
    return { ok: true };
  });

  ctx.log.info('Hook Profiler: 全フックリスナー登録完了');
}

function deactivate() {
  // フックリスナーの解除は extensionManager が自動処理
}

module.exports = { activate, deactivate };
