/**
 * Hook Profiler - Renderer Build Script
 * ・ランを詰めて並べ、境界に二重線
 * ・X 軸はラン内相対時間（ms）
 * ・マウスホイールでズーム、ドラッグでパン
 */
const fs   = require('fs');
const path = require('path');

const TIMELINE_ROWS = [
  { name: 'chat:beforeSend',    short: 'chat:beforeSend',    color: '#4FC3F7' },
  { name: 'memory:beforeSearch',short: 'mem:beforeSearch',   color: '#66BB6A' },
  { name: 'memory:afterSearch', short: 'mem:afterSearch',    color: '#A5D6A7' },
  { name: 'tool:beforeExecute', short: 'tool:beforeExec',    color: '#CE93D8' },
  { name: 'tool:afterExecute',  short: 'tool:afterExec',     color: '#AB47BC' },
  { name: 'chat:afterResponse', short: 'chat:afterResponse', color: '#0288D1' },
  { name: 'memory:beforeStore', short: 'mem:beforeStore',    color: '#388E3C' },
  { name: 'memory:afterStore',  short: 'mem:afterStore',     color: '#81C784' },
  { name: 'session:beforeSave', short: 'session:beforeSave', color: '#FFA726' },
  { name: 'session:afterSave',  short: 'session:afterSave',  color: '#FFD54F' },
];

const rendererCode = `
// ============================================================
// Hook Profiler Renderer  (auto-generated)
// ランを詰めて並べる・X 軸=ラン内相対時間・二重線区切り
// ============================================================

const TIMELINE_ROWS = ${JSON.stringify(TIMELINE_ROWS)};

const ABOVE_EVENTS = new Set(['chat:beforeSend','memory:beforeSearch','chat:afterResponse','memory:beforeStore']);
const BELOW_EVENTS = new Set(['tool:beforeExecute','tool:afterExecute','session:beforeSave']);
const EVENT_COLORS = Object.fromEntries(TIMELINE_ROWS.map(r => [r.name, r.color]));

// ─── レイアウト定数
const LABEL_W     = 140;
const RULER_H     = 36;
const RUN_LABEL_H = 16;
const ABOVE_H     = 28;
const BAR_H       = 14;
const BELOW_H     = 44;   // ツールラベルが 2 段になっても収まるよう広め
const RUN_PAD     = 10;
const RUN_H       = RUN_LABEL_H + ABOVE_H + BAR_H + BELOW_H + RUN_PAD;
const GAP_PX      = 32;   // ラン間の固定ピクセルギャップ
const MIN_PPMS    = 0.001;
const MAX_PPMS    = 1000;

// ─── ユーティリティ
function fmtMs(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return Math.round(ms) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}
function fmtCount(n) {
  return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n);
}
function niceIntervalMs(approx) {
  for (const n of [0.5,1,2,5,10,20,50,100,200,500,1000,2000,5000,10000])
    if (n >= approx) return n;
  return 10000;
}
function roundRect(ctx, x, y, w, h, r) {
  if (w < 1) w = 1;
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y,   x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x,   y+h, r);
  ctx.arcTo(x,   y+h, x,   y,   r);
  ctx.arcTo(x,   y,   x+w, y,   r);
  ctx.closePath();
}
function runDuration(run) {
  if (!run) return 0;
  if (run.endTime) return run.endTime - run.startTime;
  let max = 500;
  for (const ev of run.events||[]) {
    if (ev.relTime    != null && ev.relTime    > max) max = ev.relTime;
    if (ev.endRelTime != null && ev.endRelTime > max) max = ev.endRelTime;
  }
  return max + 300;
}

// ─── 仮想 X オフセット計算（ランを詰める）
// offsets[i] = ラン i の先頭の「仮想 X」（LABEL_W 基準）
function computeOffsets(runs, ppms) {
  const offsets = [];
  let vx = 0;
  for (const run of runs) {
    offsets.push(vx);
    vx += runDuration(run) * ppms + GAP_PX;
  }
  return offsets;
}

// ─── Canvas 描画本体
function drawTimeline(canvas, W, allRuns, ppms, viewOffPx) {
  const H   = RULER_H + allRuns.length * RUN_H + 4;
  const dpr = window.devicePixelRatio || 1;
  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const offsets = computeOffsets(allRuns, ppms);

  // 仮想 X → スクリーン X
  const vx2sx = (vx) => LABEL_W + vx - viewOffPx;
  // ラン i 内 relMs → スクリーン X
  const tx = (ri, relMs) => vx2sx(offsets[ri] + relMs * ppms);

  // ── 背景
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // ── ルーラー背景
  ctx.fillStyle = '#161b22';
  ctx.fillRect(LABEL_W, 0, W-LABEL_W, RULER_H);
  ctx.strokeStyle = '#30363d';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, RULER_H); ctx.lineTo(W, RULER_H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, H); ctx.stroke();

  // ── ランごとに目盛り描画
  allRuns.forEach((run, ri) => {
    const dur    = runDuration(run);
    const sx0    = tx(ri, 0);
    const sxEnd  = tx(ri, dur);

    // ラン背景帯
    const bgCols = ['#1a2433','#1a2a1a','#2a1a2a','#2a241a'];
    const c1 = Math.max(LABEL_W, sx0), c2 = Math.min(W, sxEnd);
    if (c2 > c1) {
      ctx.fillStyle = bgCols[ri % bgCols.length] + '44';
      ctx.fillRect(c1, RULER_H, c2-c1, H-RULER_H);
    }

    // 目盛り（ラン内相対時間）
    const minTickPx = 72;
    const tickMs = niceIntervalMs(minTickPx / ppms);
    for (let t = 0; t <= dur + tickMs; t += tickMs) {
      const sx = tx(ri, t);
      if (sx < LABEL_W - 2 || sx > W + 10) continue;
      // グリッド線
      ctx.save();
      ctx.strokeStyle = '#1e242c';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(sx, RULER_H); ctx.lineTo(sx, H); ctx.stroke();
      ctx.restore();
      // 目盛りマーク
      ctx.strokeStyle = '#484f58';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(sx, RULER_H-5); ctx.lineTo(sx, RULER_H); ctx.stroke();
      // ラベル
      ctx.fillStyle = '#8b949e';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(fmtMs(t), sx, RULER_H-8);
    }

    // ラン開始の青線
    if (sx0 >= LABEL_W && sx0 <= W) {
      ctx.strokeStyle = '#58a6ff66';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx0, 0); ctx.lineTo(sx0, H); ctx.stroke();
    }

    // ─── ランとランの間の二重線区切り
    if (ri < allRuns.length - 1) {
      const sepX = sxEnd + GAP_PX / 2; // ギャップ中央
      if (sepX > LABEL_W && sepX < W) {
        ctx.strokeStyle = '#484f58';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sepX - 2, RULER_H); ctx.lineTo(sepX - 2, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sepX + 2, RULER_H); ctx.lineTo(sepX + 2, H); ctx.stroke();
        // ルーラーにも二重線
        ctx.strokeStyle = '#30363d';
        ctx.beginPath(); ctx.moveTo(sepX - 2, 0); ctx.lineTo(sepX - 2, RULER_H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sepX + 2, 0); ctx.lineTo(sepX + 2, RULER_H); ctx.stroke();
      }
    }
  });

  // ── ランラベル列（左固定 or ラン開始位置）
  allRuns.forEach((run, ri) => {
    const runY = RULER_H + ri * RUN_H;
    const sx0  = tx(ri, 0);
    const sxEnd = tx(ri, runDuration(run));
    const lx   = Math.max(LABEL_W + 4, sx0 + 4);
    if (lx >= W - 10) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(LABEL_W, runY, W-LABEL_W, RUN_LABEL_H+2); ctx.clip();
    ctx.fillStyle = '#58a6ff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const lbl = 'Run '+(ri+1)
      + (run.incomplete ? ' ⚠' : '')
      + '  ' + fmtMs(runDuration(run))
      + (run.stats?.tokensPerSec ? '  ⚡'+run.stats.tokensPerSec+' tok/s' : '');
    ctx.fillText(lbl, Math.min(lx, W-80), runY + RUN_LABEL_H/2);
    ctx.restore();
  });

  // ── レーン行背景（全体）
  // （ここでは縞模様なし、ランの背景帯で代用）

  // ── イベント描画（タイムライン領域クリップ）
  ctx.save();
  ctx.beginPath(); ctx.rect(LABEL_W, RULER_H, W-LABEL_W, H-RULER_H); ctx.clip();

  allRuns.forEach((run, ri) => {
    const runY    = RULER_H + ri * RUN_H;
    const barTopY = runY + RUN_LABEL_H + ABOVE_H;
    const barMidY = barTopY + BAR_H / 2;
    const barBotY = barTopY + BAR_H;

    const dur = runDuration(run);
    const sx0 = tx(ri, 0);

    // ── ベースバー
    const bx1 = Math.max(LABEL_W, sx0);
    const bx2 = Math.min(W, tx(ri, dur));
    if (bx2 > bx1) {
      ctx.fillStyle = '#21262d';
      roundRect(ctx, bx1, barTopY, bx2-bx1, BAR_H, BAR_H/2);
      ctx.fill();
    }

    const evts  = run.events || [];
    const byName = {};
    for (const ev of evts) (byName[ev.name] = byName[ev.name]||[]).push(ev);

    // ── ツール範囲を構築 (before/after ペア)
    const toolBef = byName['tool:beforeExecute']||[];
    const toolAft = byName['tool:afterExecute'] ||[];
    const toolRanges = toolBef.map((bev, ti) => ({
      toolName: bev.meta?.toolName || 'tool',
      start: bev.relTime,
      end:   toolAft[ti]?.relTime ?? bev.relTime + 30,
    }));


    // ── ツール実行ブロックをバー上に描画
    for (const tr of toolRanges) {
      const ex1 = tx(ri, tr.start);
      const ex2 = tx(ri, tr.end);
      const ew  = Math.max(4, ex2 - ex1);
      // 塗り
      ctx.fillStyle   = EVENT_COLORS['tool:beforeExecute'];
      ctx.globalAlpha = 0.85;
      roundRect(ctx, ex1, barTopY, ew, BAR_H, 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // 枠
      ctx.strokeStyle = EVENT_COLORS['tool:afterExecute'];
      ctx.lineWidth   = 1;
      roundRect(ctx, ex1, barTopY, ew, BAR_H, 2);
      ctx.stroke();
      // ツール名ラベル（ブロック内に収まる場合のみ）
      const lbl = tr.toolName.slice(0, 20);
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      if (ew > ctx.measureText(lbl).width + 6) {
        ctx.fillStyle = '#fff';
        ctx.textBaseline = 'middle';
        ctx.fillText(lbl, ex1 + ew / 2, barMidY);
        ctx.textBaseline = 'alphabetic';
      }
    }

    // ── ABOVE マーカー（↑ステム）
    const STEM_A = ABOVE_H - 6;
    for (const name of ABOVE_EVENTS) {
      const col = EVENT_COLORS[name];
      for (const ev of byName[name]||[]) {
        const ex = tx(ri, ev.relTime);
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(ex, barTopY); ctx.lineTo(ex, barTopY-STEM_A); ctx.stroke();
        const ds = 4;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(ex,    barTopY-STEM_A-ds);
        ctx.lineTo(ex+ds, barTopY-STEM_A);
        ctx.lineTo(ex,    barTopY-STEM_A+ds);
        ctx.lineTo(ex-ds, barTopY-STEM_A);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = col; ctx.font = '8px monospace'; ctx.textAlign = 'center';
        ctx.fillText(_short(name), ex, barTopY-STEM_A-ds-3);
      }
    }

    // ── session:beforeSave だけ BELOW マーカー
    for (const ev of byName['session:beforeSave']||[]) {
      const col   = EVENT_COLORS['session:beforeSave'];
      const ex    = tx(ri, ev.relTime);
      const stemB = BELOW_H - 14;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(ex, barBotY); ctx.lineTo(ex, barBotY+stemB); ctx.stroke();
      const ds = 4;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(ex,    barBotY+stemB+ds);
      ctx.lineTo(ex+ds, barBotY+stemB);
      ctx.lineTo(ex,    barBotY+stemB-ds);
      ctx.lineTo(ex-ds, barBotY+stemB);
      ctx.closePath(); ctx.fill();
      ctx.font = '8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('s:bSave', ex, barBotY+stemB+ds+9);
    }
  });

  ctx.restore();
}

function _short(n) {
  return n.replace('chat:','c:').replace('memory:','m:').replace('session:','s:')
          .replace('beforeSend','bSend').replace('afterResponse','aftResp')
          .replace('beforeSearch','bSearch').replace('beforeStore','bStore')
          .replace('beforeSave','bSave').replace('Execute','Exec');
}

// ─────────────────────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────────────────────
function ProfilerPage({ api }) {
  const [appState,  setAppState]  = useState({ runs:[], currentRun:null, summary:{} });
  const [isRunning, setIsRunning] = useState(false);
  const [ppms,      setPpms]      = useState(0.15);
  const [viewOffPx, setViewOffPx] = useState(0);
  const [canvasW,   setCanvasW]   = useState(600);
  const [isDrag,    setIsDrag]    = useState(false);
  const [tooltip,   setTooltip]   = useState(null);

  const canvasRef       = useRef(null);
  const wrapRef         = useRef(null);
  const drag            = useRef({ active:false, startX:0, startOff:0 });
  const ppmsRef         = useRef(ppms);
  const viewOffPxRef    = useRef(viewOffPx);
  const stateRef        = useRef(appState);
  const wheelHandlerRef = useRef(null);

  useEffect(() => { ppmsRef.current    = ppms;      }, [ppms]);
  useEffect(() => { viewOffPxRef.current = viewOffPx; }, [viewOffPx]);
  useEffect(() => { stateRef.current   = appState;  }, [appState]);

  // ── IPC
  useEffect(() => {
    api.ipc.invoke('get-state').then(s => {
      if (!s) return;
      setAppState(s); setIsRunning(!!s.currentRun);
    }).catch(()=>{});
    const off = api.ipc.on('state-update', s => {
      setAppState(s); setIsRunning(!!s.currentRun);
    });
    return off;
  }, []);

  // ── ResizeObserver
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(e => setCanvasW(Math.max(200, e[0].contentRect.width)));
    ro.observe(wrapRef.current);
    setCanvasW(wrapRef.current.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  const allRuns = useMemo(() => {
    const r = appState.runs || [];
    return appState.currentRun ? [...r, appState.currentRun] : r;
  }, [appState]);

  // ── ラン追加時に自動 Fit
  const lastRunCnt = useRef(0);
  useEffect(() => {
    if (allRuns.length === 0) return;
    if (allRuns.length === lastRunCnt.current) return;
    lastRunCnt.current = allRuns.length;
    // 全ランの合計仮想幅
    const offsets = computeOffsets(allRuns, ppmsRef.current);
    const lastDur = runDuration(allRuns[allRuns.length-1]);
    const totalVW = offsets[offsets.length-1] + lastDur * ppmsRef.current;
    const avail   = canvasW - LABEL_W - 16;
    if (avail > 0 && totalVW > 0) {
      // ppms を調整して全体を収める
      const totalDur = allRuns.reduce((s,r) => s + runDuration(r), 0);
      const gapTotal = (allRuns.length - 1) * GAP_PX;
      const newPpms  = Math.max(MIN_PPMS, (avail - gapTotal) / totalDur);
      setPpms(newPpms);
      setViewOffPx(0);
    }
  }, [allRuns.length, canvasW]);

  // ── Canvas 描画（毎レンダー）
  const canvasH = RULER_H + allRuns.length * RUN_H + 4;
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawTimeline(canvas, canvasW, allRuns, ppms, viewOffPx);
  });

  // ── Wheel ハンドラ
  useEffect(() => {
    wheelHandlerRef.current = (e) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const s = stateRef.current;
      const ar = [...(s.runs||[]), ...(s.currentRun?[s.currentRun]:[])];
      if (ar.length === 0) return;

      const rect      = canvas.getBoundingClientRect();
      const cx        = e.clientX - rect.left - LABEL_W;
      if (cx < 0) return;

      const curVirtX  = viewOffPxRef.current + cx;
      const offsets   = computeOffsets(ar, ppmsRef.current);

      // カーソルがどのラン内か特定
      let ri = 0;
      for (let i = ar.length-1; i >= 0; i--) {
        if (offsets[i] <= curVirtX) { ri = i; break; }
      }
      const relMsAtCursor = Math.max(0, (curVirtX - offsets[ri]) / ppmsRef.current);

      const factor  = e.deltaY < 0 ? 1.3 : 1/1.3;
      const newPpms = Math.max(MIN_PPMS, Math.min(MAX_PPMS, ppmsRef.current * factor));

      // 新しい offsets で同じ relMs の仮想 X を計算
      const newOffsets   = computeOffsets(ar, newPpms);
      const newCurVirtX  = newOffsets[ri] + relMsAtCursor * newPpms;
      const newViewOffPx = Math.max(0, newCurVirtX - cx);

      setPpms(newPpms);
      setViewOffPx(newViewOffPx);
    };
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stable = (e) => wheelHandlerRef.current?.(e);
    canvas.addEventListener('wheel', stable, { passive:false });
    return () => canvas.removeEventListener('wheel', stable);
  }, []);

  // ── ドラッグ
  const onMouseDown = useCallback((e) => {
    drag.current = { active:true, startX:e.clientX, startOff:viewOffPxRef.current };
    setIsDrag(true);
  }, []);

  const onMouseMove = useCallback((e) => {
    if (drag.current.active) {
      const dx = e.clientX - drag.current.startX;
      setViewOffPx(Math.max(0, drag.current.startOff - dx));
    }
    // ツールチップ
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s  = stateRef.current;
    const ar = [...(s.runs||[]), ...(s.currentRun?[s.currentRun]:[])];
    if (ar.length === 0) { setTooltip(null); return; }

    const rect = canvas.getBoundingClientRect();
    const cx   = e.clientX - rect.left;
    const cy   = e.clientY - rect.top;
    if (cx < LABEL_W) { setTooltip(null); return; }

    const virtX  = viewOffPxRef.current + (cx - LABEL_W);
    const ri     = Math.floor((cy - RULER_H) / RUN_H);
    if (ri < 0 || ri >= ar.length) { setTooltip(null); return; }

    const offsets = computeOffsets(ar, ppmsRef.current);
    const relMs   = (virtX - offsets[ri]) / ppmsRef.current;
    const hitMs   = 20 / ppmsRef.current;
    const run     = ar[ri];

    // カーソルの縦位置でゾーンを判定
    const runY    = RULER_H + ri * RUN_H;
    const barTopY = runY + RUN_LABEL_H + ABOVE_H;
    const barBotY = barTopY + BAR_H;
    const inAbove = cy < barTopY;
    const inBar   = cy >= barTopY && cy <= barBotY;

    let best = null, bestDist = hitMs;

    // ツールペアを before/after でまとめる
    const toolBef = run.events.filter(e => e.name === 'tool:beforeExecute');
    const toolAft = run.events.filter(e => e.name === 'tool:afterExecute');
    const toolRangeEvs = toolBef.map((bev, ti) => {
      const aev = toolAft[ti];
      return { ...bev, endRelTime: aev?.relTime ?? bev.relTime + 30, _toolRange: true };
    });

    if (inBar) {
      // バーゾーン: ツール範囲 → その他レンジ → ポイントイベント全て
      // ① ツール範囲（カーソルが内側なら distance=0）
      for (const tr of toolRangeEvs) {
        if (relMs >= tr.relTime && relMs <= tr.endRelTime) {
          best = { ev: tr, run, ri }; bestDist = 0; break;
        }
      }
      // ② 全ポイントイベントを水平距離で検索（ゾーン問わず最近傍）
      if (!best) {
        for (const ev of [...run.events, ...toolRangeEvs]) {
          if (ev.name === 'tool:afterExecute') continue; // before に統合済み
          const d = ev.endRelTime != null
            ? Math.min(Math.abs(relMs - ev.relTime), Math.abs(relMs - ev.endRelTime))
            : Math.abs(relMs - ev.relTime);
          if (d < bestDist) { best = { ev, run, ri }; bestDist = d; }
        }
      }
    } else {
      // 上ゾーン: ABOVE_EVENTS、下ゾーン: session:beforeSave
      for (const ev of run.events||[]) {
        if (inAbove && !ABOVE_EVENTS.has(ev.name)) continue;
        if (!inAbove && ev.name !== 'session:beforeSave') continue;
        const d = Math.abs(relMs - ev.relTime);
        if (d < bestDist) { best = { ev, run, ri }; bestDist = d; }
      }
    }

    if (best) setTooltip({ x:e.clientX, y:e.clientY, ...best });
    else      setTooltip(null);
  }, []);

  const onMouseUp    = useCallback(() => { drag.current.active=false; setIsDrag(false); }, []);
  const onMouseLeave = useCallback(() => { drag.current.active=false; setIsDrag(false); setTooltip(null); }, []);

  // Fit
  const handleFit = () => {
    if (allRuns.length === 0) return;
    const totalDur = allRuns.reduce((s,r) => s+runDuration(r), 0);
    const gapTotal = (allRuns.length-1) * GAP_PX;
    const avail    = canvasW - LABEL_W - 16;
    if (avail > 0 && totalDur > 0) {
      setPpms(Math.max(MIN_PPMS, (avail-gapTotal)/totalDur));
      setViewOffPx(0);
    }
  };

  const summary   = appState.summary || {};
  const zoomLabel = ppms >= 1
    ? (Math.round(ppms*100)/100)+' px/ms'
    : Math.round(1/ppms)+' ms/px';

  return React.createElement('div', {
    style:{ display:'flex', flexDirection:'column', height:'100%',
            background:'#0d1117', color:'#c9d1d9',
            fontFamily:'"SF Mono","Fira Code",Consolas,monospace',
            fontSize:12, overflow:'hidden' }
  },

    // ── Toolbar
    React.createElement('div', {
      style:{ display:'flex', alignItems:'center', gap:8, padding:'5px 12px',
              borderBottom:'1px solid #21262d', background:'#161b22',
              flexShrink:0, flexWrap:'wrap', minHeight:38 }
    },
      React.createElement('span', { style:{fontSize:13,fontWeight:700,color:'#58a6ff'} }, '⏱ Hook Profiler'),
      isRunning && React.createElement('span', {
        style:{background:'#1a3a1a',color:'#66BB6A',border:'1px solid #388e3c',
               borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:700}
      }, '● REC'),
      React.createElement('span', { style:{color:'#8b949e',fontSize:11,marginLeft:4} },
        allRuns.length+' run'+(allRuns.length!==1?'s':'')),
      React.createElement('div', {style:{flex:1}}),

      React.createElement('button', { onClick:()=>setPpms(p=>Math.min(MAX_PPMS,p*1.5)), style:btnStyle() }, '+'),
      React.createElement('span', { style:{color:'#8b949e',fontSize:10,minWidth:72,textAlign:'center'} }, zoomLabel),
      React.createElement('button', { onClick:()=>setPpms(p=>Math.max(MIN_PPMS,p/1.5)), style:btnStyle() }, '−'),
      React.createElement('button', {
        onClick:handleFit,
        style:{...btnStyle(),color:'#58a6ff',borderColor:'#58a6ff44'}
      }, 'Fit'),
      React.createElement('button', {
        onClick:()=>{ api.ipc.invoke('clear-runs').catch(()=>{}); setIsRunning(false); },
        style:{...btnStyle(),color:'#f85149',borderColor:'#f8514944',marginLeft:6}
      }, 'Clear'),
    ),

    // ── Body
    React.createElement('div', {style:{display:'flex',flex:1,overflow:'hidden'}},

      // 左: イベント統計
      React.createElement('div', {
        style:{width:192,borderRight:'1px solid #21262d',display:'flex',
               flexDirection:'column',overflow:'hidden',flexShrink:0}
      },
        React.createElement('div', {
          style:{padding:'6px 10px 4px',fontSize:10,color:'#8b949e',
                 letterSpacing:0.8,textTransform:'uppercase',borderBottom:'1px solid #21262d'}
        }, 'Hook Events'),
        React.createElement('div', {style:{flex:1,overflowY:'auto'}},
          ...TIMELINE_ROWS.map(row => {
            const s = summary[row.name]||{count:0,avgLatency:null,lastLatency:null};
            return React.createElement('div', {
              key:row.name,
              style:{padding:'7px 10px',borderBottom:'1px solid #21262d1a',opacity:s.count===0?0.35:1}
            },
              React.createElement('div', {style:{display:'flex',alignItems:'center',gap:5,marginBottom:2}},
                React.createElement('div', {style:{width:8,height:8,borderRadius:2,background:row.color,flexShrink:0}}),
                React.createElement('span', {style:{color:row.color,fontSize:10,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, row.name),
              ),
              React.createElement('div', {style:{display:'flex',gap:6,marginLeft:13,color:'#8b949e',fontSize:10}},
                React.createElement('span', null, '×'+fmtCount(s.count)),
                s.avgLatency  != null && React.createElement('span', null, 'avg '+fmtMs(s.avgLatency)),
                s.lastLatency != null && React.createElement('span', {style:{color:'#58a6ff'}}, 'last '+fmtMs(s.lastLatency)),
              ),
            );
          })
        ),
      ),

      // 右: canvas（常にマウント）
      React.createElement('div', {
        ref:wrapRef,
        style:{flex:1,position:'relative',overflowX:'hidden',overflowY:'auto',background:'#0d1117'}
      },
        React.createElement('canvas', {
          ref:canvasRef,
          style:{display:'block',cursor:isDrag?'grabbing':'grab',userSelect:'none',width:canvasW+'px'},
          onMouseDown, onMouseMove, onMouseUp, onMouseLeave,
        }),

        allRuns.length===0 && React.createElement('div', {
          style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',
                 alignItems:'center',justifyContent:'center',color:'#8b949e',
                 gap:10,pointerEvents:'none'}
        },
          React.createElement('div', {style:{fontSize:38}}, '⏱'),
          React.createElement('div', {style:{fontSize:13}}, 'チャットを送信してフックイベントを計測する'),
          React.createElement('div', {style:{fontSize:11,color:'#6e7681'}}, 'ホイールでズーム・ドラッグでパン'),
        ),

        tooltip && React.createElement('div', {
          style:{
            position:'fixed', left:tooltip.x+16, top:tooltip.y-8,
            background:'#1c2128',
            border:'1px solid '+(EVENT_COLORS[tooltip.ev.name]||'#888'),
            borderRadius:6, padding:'7px 11px',
            fontSize:11, color:'#c9d1d9',
            pointerEvents:'none', zIndex:9999,
            maxWidth:280, lineHeight:1.7,
            boxShadow:'0 4px 20px #000a',
          }
        },
          tooltip.ev._toolRange
            ? React.createElement(React.Fragment, null,
                React.createElement('div', {
                  style:{color:EVENT_COLORS['tool:beforeExecute'],fontWeight:700,marginBottom:3,fontSize:12}
                }, 'Run '+(tooltip.ri+1)+'  🔧 '+tooltip.ev.meta?.toolName),
                React.createElement('div', null,
                  React.createElement('span',{style:{color:'#6e7681'}},'start  '), fmtMs(tooltip.ev.relTime)),
                React.createElement('div', null,
                  React.createElement('span',{style:{color:'#6e7681'}},'end    '), fmtMs(tooltip.ev.endRelTime)),
                React.createElement('div', null,
                  React.createElement('span',{style:{color:'#6e7681'}},'dur    '), fmtMs(tooltip.ev.endRelTime - tooltip.ev.relTime)),
                tooltip.ev.meta?.inputKeys?.length > 0 && React.createElement('div', null,
                  React.createElement('span',{style:{color:'#6e7681'}},'input  '), tooltip.ev.meta.inputKeys.join(', ').slice(0,50)),
              )
            : React.createElement(React.Fragment, null,
                React.createElement('div', {
                  style:{color:EVENT_COLORS[tooltip.ev.name]||'#888',fontWeight:700,marginBottom:3,fontSize:12}
                }, 'Run '+(tooltip.ri+1)+'  '+tooltip.ev.name),
                React.createElement('div', null,
                  React.createElement('span',{style:{color:'#6e7681'}},'time  '), fmtMs(tooltip.ev.relTime)),
                tooltip.ev.endRelTime!=null && React.createElement('div', null,
                  React.createElement('span',{style:{color:'#6e7681'}},'dur   '), fmtMs(tooltip.ev.endRelTime-tooltip.ev.relTime)),
                tooltip.ev.meta && Object.entries(tooltip.ev.meta).map(([k,v]) =>
                  v!=null && React.createElement('div',{key:k},
                    React.createElement('span',{style:{color:'#6e7681'}},k+'  '), String(v).slice(0,60))
                ),
              ),
        ),
      ),
    ),
  );
}

function btnStyle() {
  return {padding:'2px 8px',background:'#21262d',border:'1px solid #30363d',
          borderRadius:4,cursor:'pointer',color:'#c9d1d9',fontSize:11};
}

export default { pages:{ profiler:ProfilerPage } };
`;

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'renderer.js'), rendererCode, 'utf-8');
console.log('✓ dist/renderer.js を生成しました');
