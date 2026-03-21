/**
 * Hook Profiler - Renderer Build Script
 * ・main bar: chat:beforeSend → chat:afterResponse
 * ・above lanes: memory / tool / session の before→after ペア
 * ・マウスホイールでズーム、ドラッグでパン
 */
const fs   = require('fs');
const path = require('path');

// 左パネル統計用（全イベント）
const STAT_ROWS = [
  { name: 'chat:beforeSend',    color: '#4FC3F7' },
  { name: 'chat:afterResponse', color: '#0288D1' },
  { name: 'memory:beforeSearch',color: '#66BB6A' },
  { name: 'memory:afterSearch', color: '#A5D6A7' },
  { name: 'memory:beforeStore', color: '#388E3C' },
  { name: 'memory:afterStore',  color: '#81C784' },
  { name: 'session:beforeSave', color: '#FFA726' },
  { name: 'session:afterSave',  color: '#FFD54F' },
  { name: 'tool:beforeExecute', color: '#CE93D8' },
  { name: 'tool:afterExecute',  color: '#AB47BC' },
];

// タイムライン上のレーン（main bar より上）
const ABOVE_LANES = [
  { label: 'mem:search', before: 'memory:beforeSearch', after: 'memory:afterSearch',  color: '#66BB6A' },
  { label: 'tool',       before: 'tool:beforeExecute',  after: 'tool:afterExecute',   color: '#CE93D8' },
  { label: 'mem:store',  before: 'memory:beforeStore',  after: 'memory:afterStore',   color: '#388E3C' },
  { label: 'session',    before: 'session:beforeSave',  after: 'session:afterSave',   color: '#FFA726' },
];

const rendererCode = `
// ============================================================
// Hook Profiler Renderer  (auto-generated)
// main bar (beforeSend→afterResponse) + above lanes
// ============================================================

const STAT_ROWS   = ${JSON.stringify(STAT_ROWS)};
const ABOVE_LANES = ${JSON.stringify(ABOVE_LANES)};

// ─── レイアウト
const LABEL_W     = 140;
const RUN_LABEL_H = 16;
const LANE_H      = 16;   // 上レーン1本の高さ
const LANE_PAD    = 2;    // レーン内上下余白
const MAIN_BAR_H  = 20;   // main bar の高さ
const MAIN_PAD    = 4;    // main bar 上の隙間
const RULER_H     = 34;
const RUN_PAD     = 12;
const N_LANES     = ABOVE_LANES.length;
const RUN_H       = RUN_LABEL_H + N_LANES * LANE_H + MAIN_PAD + MAIN_BAR_H + RUN_PAD;
const GAP_PX      = 28;
const MIN_PPMS    = 0.001;
const MAX_PPMS    = 1000;

// ─── ユーティリティ
function fmtMs(ms) {
  if (ms == null) return '-';
  if (ms < 1000) return Math.round(ms) + 'ms';
  return (ms / 1000).toFixed(2) + 's';
}
function fmtCount(n) { return n >= 1000 ? (n/1000).toFixed(1)+'k' : String(n); }
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
  return max + 200;
}
function computeOffsets(runs, ppms) {
  const offsets = [];
  let vx = 0;
  for (const run of runs) {
    offsets.push(vx);
    vx += runDuration(run) * ppms + GAP_PX;
  }
  return offsets;
}

// ─── Canvas 描画
function drawTimeline(canvas, W, allRuns, ppms, viewOffPx) {
  const H   = RULER_H + RUN_H + 4;   // 全ランを同じ行に描画
  const dpr = window.devicePixelRatio || 1;
  canvas.width        = W * dpr;
  canvas.height       = H * dpr;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const offsets  = computeOffsets(allRuns, ppms);
  const vx2sx    = (vx) => LABEL_W + vx - viewOffPx;
  const tx       = (ri, relMs) => vx2sx(offsets[ri] + relMs * ppms);
  const runY     = RULER_H;                                        // 全ランで共通
  const mainBarY = runY + RUN_LABEL_H + N_LANES * LANE_H + MAIN_PAD;

  // 背景
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, W, H);

  // ── ルーラー
  ctx.fillStyle = '#161b22';
  ctx.fillRect(LABEL_W, 0, W-LABEL_W, RULER_H);
  ctx.strokeStyle = '#30363d'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, RULER_H); ctx.lineTo(W, RULER_H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(LABEL_W, 0); ctx.lineTo(LABEL_W, H); ctx.stroke();

  // ── 左パネル: レーンラベル（一度だけ描画）
  ABOVE_LANES.forEach((lane, li) => {
    const laneY = runY + RUN_LABEL_H + li * LANE_H;
    ctx.fillStyle = lane.color; ctx.font='9px monospace';
    ctx.textAlign='right'; ctx.textBaseline='middle';
    ctx.fillText(lane.label, LABEL_W-4, laneY+LANE_H/2);
  });
  ctx.fillStyle = '#4FC3F7'; ctx.font='9px monospace';
  ctx.textAlign='right'; ctx.textBaseline='middle';
  ctx.fillText('chat', LABEL_W-4, mainBarY+MAIN_BAR_H/2);
  ctx.textBaseline='alphabetic';

  // 目盛り・区切り線
  allRuns.forEach((run, ri) => {
    const dur = runDuration(run);
    const tickMs = niceIntervalMs(72 / ppms);
    for (let t = 0; t <= dur + tickMs; t += tickMs) {
      const sx = tx(ri, t);
      if (sx < LABEL_W-2 || sx > W+10) continue;
      ctx.save();
      ctx.strokeStyle = '#1e242c'; ctx.lineWidth=1; ctx.setLineDash([3,5]);
      ctx.beginPath(); ctx.moveTo(sx, RULER_H); ctx.lineTo(sx, H); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = '#484f58'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sx, RULER_H-5); ctx.lineTo(sx, RULER_H); ctx.stroke();
      ctx.fillStyle = '#8b949e'; ctx.font='9px monospace'; ctx.textAlign='center';
      ctx.fillText(fmtMs(t), sx, RULER_H-8);
    }
    // ラン開始線
    const sx0 = tx(ri, 0);
    if (sx0 >= LABEL_W && sx0 <= W) {
      ctx.strokeStyle = '#58a6ff55'; ctx.lineWidth=1.5; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(sx0, 0); ctx.lineTo(sx0, H); ctx.stroke();
    }
    // ラン区切り二重線
    if (ri < allRuns.length-1) {
      const sepX = tx(ri, dur) + GAP_PX/2;
      if (sepX > LABEL_W && sepX < W) {
        ctx.strokeStyle = '#484f58'; ctx.lineWidth=1.5; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(sepX-2, RULER_H); ctx.lineTo(sepX-2, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(sepX+2, RULER_H); ctx.lineTo(sepX+2, H); ctx.stroke();
      }
    }
  });

  // ── ランごとのイベント描画（全ラン同じ Y に描画）
  ctx.save();
  ctx.beginPath(); ctx.rect(LABEL_W, RULER_H, W-LABEL_W, H-RULER_H); ctx.clip();

  const bgCols = ['#1a2433','#1a2a1a','#2a1a2a','#2a241a'];
  allRuns.forEach((run, ri) => {
    const evts   = run.events || [];
    const byName = {};
    for (const ev of evts) (byName[ev.name] = byName[ev.name]||[]).push(ev);

    // ── ラン背景帯
    const dur     = runDuration(run);
    const sx0 = tx(ri, 0), sxEnd = tx(ri, dur);
    const c1 = Math.max(LABEL_W, sx0), c2 = Math.min(W, sxEnd);
    if (c2 > c1) {
      ctx.fillStyle = bgCols[ri%bgCols.length]+'44';
      ctx.fillRect(c1, runY, c2-c1, RUN_H-RUN_PAD);
    }

    // ── ランラベル
    const lx = Math.max(LABEL_W+4, sx0+4);
    if (lx < W-10) {
      ctx.save();
      ctx.beginPath(); ctx.rect(sx0, runY, Math.max(4, sxEnd-sx0), RUN_LABEL_H+2); ctx.clip();
      ctx.fillStyle = '#58a6ff'; ctx.font='bold 10px monospace';
      ctx.textAlign='left'; ctx.textBaseline='middle';
      const bSend   = (byName['chat:beforeSend']  ||[])[0];
      const aftResp = (byName['chat:afterResponse']||[])[0];
      const chatDur = bSend && aftResp ? fmtMs(aftResp.relTime - bSend.relTime) : fmtMs(dur);
      const lbl = 'Run '+(ri+1)+(run.incomplete?' ⚠':'')+' '+chatDur
        +(run.stats?.tokensPerSec ? '  ⚡'+run.stats.tokensPerSec+' tok/s' : '');
      ctx.fillText(lbl, lx, runY+RUN_LABEL_H/2);
      ctx.restore();
    }

    // ── main bar（beforeSend → afterResponse）
    const bSendEv   = (byName['chat:beforeSend']  ||[])[0];
    const aftRespEv = (byName['chat:afterResponse']||[])[0];
    const mainStart = bSendEv   ? bSendEv.relTime   : 0;
    const mainEnd   = aftRespEv ? aftRespEv.relTime : dur;
    const msx1 = tx(ri, mainStart);
    const msx2 = tx(ri, mainEnd);
    const mw   = Math.max(4, msx2-msx1);
    ctx.fillStyle = '#21262d';
    roundRect(ctx, msx1, mainBarY, mw, MAIN_BAR_H, MAIN_BAR_H/2);
    ctx.fill();
    ctx.fillStyle = '#4FC3F7';
    ctx.globalAlpha = 0.25;
    roundRect(ctx, msx1, mainBarY, mw, MAIN_BAR_H, MAIN_BAR_H/2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#4FC3F7'; ctx.lineWidth=1.5;
    roundRect(ctx, msx1, mainBarY, mw, MAIN_BAR_H, MAIN_BAR_H/2);
    ctx.stroke();
    if (mw > 60) {
      ctx.fillStyle = '#4FC3F7'; ctx.font='bold 9px monospace';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('chat: '+fmtMs(mainEnd-mainStart), msx1+mw/2, mainBarY+MAIN_BAR_H/2);
      ctx.textBaseline='alphabetic';
    }

    // ── 上レーン（before/after ペア）
    ABOVE_LANES.forEach((lane, li) => {
      const laneY = runY + RUN_LABEL_H + li * LANE_H;
      const barY  = laneY + LANE_PAD;
      const barH  = LANE_H - LANE_PAD*2;

      const befEvts = byName[lane.before]||[];
      const aftEvts = byName[lane.after] ||[];

      befEvts.forEach((bev, pi) => {
        const aev   = aftEvts[pi];
        const ex1   = tx(ri, bev.relTime);
        const ex2   = aev ? tx(ri, aev.relTime) : ex1+4;
        const ew    = Math.max(4, ex2-ex1);
        ctx.fillStyle   = lane.color;
        ctx.globalAlpha = 0.8;
        roundRect(ctx, ex1, barY, ew, barH, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = lane.color; ctx.lineWidth=1;
        roundRect(ctx, ex1, barY, ew, barH, 3);
        ctx.stroke();
        if (lane.before === 'tool:beforeExecute' && bev.meta?.toolName) {
          const lbl = bev.meta.toolName.slice(0, 16);
          ctx.font='bold 8px monospace'; ctx.textAlign='center';
          if (ew > ctx.measureText(lbl).width+6) {
            ctx.fillStyle='#fff'; ctx.textBaseline='middle';
            ctx.fillText(lbl, ex1+ew/2, barY+barH/2);
            ctx.textBaseline='alphabetic';
          }
        }
        if (aev && ew > 30 && lane.before !== 'tool:beforeExecute') {
          const d = fmtMs(aev.relTime - bev.relTime);
          ctx.font='8px monospace'; ctx.textAlign='center';
          ctx.fillStyle='#fff'; ctx.textBaseline='middle';
          ctx.fillText(d, ex1+ew/2, barY+barH/2);
          ctx.textBaseline='alphabetic';
        }
      });
    });
  });

  ctx.restore();
}

// ─── メインコンポーネント
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

  useEffect(() => { ppmsRef.current     = ppms;      }, [ppms]);
  useEffect(() => { viewOffPxRef.current = viewOffPx; }, [viewOffPx]);
  useEffect(() => { stateRef.current    = appState;  }, [appState]);

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
    const r = appState.runs||[];
    return appState.currentRun ? [...r, appState.currentRun] : r;
  }, [appState]);

  // ── 自動 Fit
  const lastRunCnt = useRef(0);
  useEffect(() => {
    if (allRuns.length === 0) return;
    if (allRuns.length === lastRunCnt.current) return;
    lastRunCnt.current = allRuns.length;
    const totalDur = allRuns.reduce((s,r) => s+runDuration(r), 0);
    const gapTotal = (allRuns.length-1)*GAP_PX;
    const avail    = canvasW - LABEL_W - 16;
    if (avail>0 && totalDur>0) {
      setPpms(Math.max(MIN_PPMS, (avail-gapTotal)/totalDur));
      setViewOffPx(0);
    }
  }, [allRuns.length, canvasW]);

  const canvasH = RULER_H + RUN_H + 4;

  // ── Canvas 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawTimeline(canvas, canvasW, allRuns, ppms, viewOffPx);
  });

  // ── Wheel
  useEffect(() => {
    wheelHandlerRef.current = (e) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;
      const s  = stateRef.current;
      const ar = [...(s.runs||[]), ...(s.currentRun?[s.currentRun]:[])];
      if (ar.length===0) return;
      const rect   = canvas.getBoundingClientRect();
      const cx     = e.clientX - rect.left - LABEL_W;
      if (cx<0) return;
      const curVirtX = viewOffPxRef.current + cx;
      const offsets  = computeOffsets(ar, ppmsRef.current);
      let ri=0;
      for (let i=ar.length-1;i>=0;i--) { if (offsets[i]<=curVirtX){ri=i;break;} }
      const relMs   = Math.max(0, (curVirtX-offsets[ri])/ppmsRef.current);
      const factor  = e.deltaY<0 ? 1.3 : 1/1.3;
      const newPpms = Math.max(MIN_PPMS, Math.min(MAX_PPMS, ppmsRef.current*factor));
      const newOff  = computeOffsets(ar, newPpms);
      setViewOffPx(Math.max(0, newOff[ri]+relMs*newPpms-cx));
      setPpms(newPpms);
    };
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const stable = (e) => wheelHandlerRef.current?.(e);
    canvas.addEventListener('wheel', stable, {passive:false});
    return () => canvas.removeEventListener('wheel', stable);
  }, []);

  // ── ドラッグ
  const onMouseDown = useCallback((e) => {
    drag.current = {active:true, startX:e.clientX, startOff:viewOffPxRef.current};
    setIsDrag(true);
  }, []);

  const onMouseMove = useCallback((e) => {
    if (drag.current.active) {
      const dx = e.clientX - drag.current.startX;
      setViewOffPx(Math.max(0, drag.current.startOff - dx));
    }
    // Tooltip
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s  = stateRef.current;
    const ar = [...(s.runs||[]), ...(s.currentRun?[s.currentRun]:[])];
    if (ar.length===0) { setTooltip(null); return; }

    const rect   = canvas.getBoundingClientRect();
    const cx     = e.clientX - rect.left;
    const cy     = e.clientY - rect.top;
    if (cx < LABEL_W || cy < RULER_H || cy > RULER_H + RUN_H) { setTooltip(null); return; }

    const virtX  = viewOffPxRef.current + (cx-LABEL_W);
    const offsets= computeOffsets(ar, ppmsRef.current);

    // X 位置からどのランかを特定
    let ri = -1;
    for (let i=ar.length-1;i>=0;i--) { if (virtX>=offsets[i]){ri=i;break;} }
    if (ri<0) { setTooltip(null); return; }
    // ラン間のギャップ内ならヒットなし
    const runEndPx = offsets[ri] + runDuration(ar[ri]) * ppmsRef.current;
    if (ri < ar.length-1 && virtX > runEndPx + GAP_PX/2) { setTooltip(null); return; }

    const relMs  = (virtX-offsets[ri])/ppmsRef.current;
    const hitMs  = 20/ppmsRef.current;
    const run    = ar[ri];
    const runY   = RULER_H;                              // 全ラン同じ高さ
    const mainBarY = runY + RUN_LABEL_H + N_LANES*LANE_H + MAIN_PAD;

    let best=null, bestDist=hitMs;

    // どのゾーンか
    const inMainBar = cy >= mainBarY && cy <= mainBarY+MAIN_BAR_H;
    const laneIdx   = cy >= runY+RUN_LABEL_H && cy < mainBarY
      ? Math.floor((cy - runY - RUN_LABEL_H) / LANE_H)
      : -1;

    if (inMainBar) {
      // main bar: beforeSend / afterResponse
      for (const ev of run.events||[]) {
        if (ev.name!=='chat:beforeSend' && ev.name!=='chat:afterResponse') continue;
        const d = Math.abs(relMs-ev.relTime);
        if (d<bestDist) { best={ev,run,ri}; bestDist=d; }
      }
    } else if (laneIdx>=0 && laneIdx<ABOVE_LANES.length) {
      const lane = ABOVE_LANES[laneIdx];
      const befEvts = (run.events||[]).filter(ev=>ev.name===lane.before);
      const aftEvts = (run.events||[]).filter(ev=>ev.name===lane.after);
      // ペアを探す
      for (let pi=0;pi<befEvts.length;pi++) {
        const bev=befEvts[pi], aev=aftEvts[pi];
        const start=bev.relTime, end=aev?.relTime??bev.relTime+4;
        const dist = relMs>=start&&relMs<=end ? 0
          : Math.min(Math.abs(relMs-start), Math.abs(relMs-end));
        if (dist<bestDist) {
          best={ ev:{ ...bev, endRelTime:end, _paired:true, _aev:aev }, run, ri };
          bestDist=dist;
        }
      }
    }

    if (best) setTooltip({x:e.clientX, y:e.clientY, ...best});
    else      setTooltip(null);
  }, []);

  const onMouseUp    = useCallback(()=>{ drag.current.active=false; setIsDrag(false); },[]);
  const onMouseLeave = useCallback(()=>{ drag.current.active=false; setIsDrag(false); setTooltip(null); },[]);

  const handleFit = () => {
    if (allRuns.length===0) return;
    const totalDur = allRuns.reduce((s,r)=>s+runDuration(r),0);
    const gapTotal = (allRuns.length-1)*GAP_PX;
    const avail    = canvasW-LABEL_W-16;
    if (avail>0&&totalDur>0) { setPpms(Math.max(MIN_PPMS,(avail-gapTotal)/totalDur)); setViewOffPx(0); }
  };

  const summary   = appState.summary||{};
  const zoomLabel = ppms>=1 ? (Math.round(ppms*100)/100)+' px/ms' : Math.round(1/ppms)+' ms/px';

  return React.createElement('div', {
    style:{display:'flex',flexDirection:'column',height:'100%',background:'#0d1117',
           color:'#c9d1d9',fontFamily:'"SF Mono","Fira Code",Consolas,monospace',
           fontSize:12,overflow:'hidden'}
  },
    // Toolbar
    React.createElement('div', {
      style:{display:'flex',alignItems:'center',gap:8,padding:'5px 12px',
             borderBottom:'1px solid #21262d',background:'#161b22',
             flexShrink:0,flexWrap:'wrap',minHeight:38}
    },
      React.createElement('span',{style:{fontSize:13,fontWeight:700,color:'#58a6ff'}},'⏱ Hook Profiler'),
      isRunning && React.createElement('span',{
        style:{background:'#1a3a1a',color:'#66BB6A',border:'1px solid #388e3c',
               borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:700}
      },'● REC'),
      React.createElement('span',{style:{color:'#8b949e',fontSize:11,marginLeft:4}},
        allRuns.length+' run'+(allRuns.length!==1?'s':'')),
      React.createElement('div',{style:{flex:1}}),
      React.createElement('button',{onClick:()=>setPpms(p=>Math.min(MAX_PPMS,p*1.5)),style:btnStyle()},'+'),
      React.createElement('span',{style:{color:'#8b949e',fontSize:10,minWidth:72,textAlign:'center'}},zoomLabel),
      React.createElement('button',{onClick:()=>setPpms(p=>Math.max(MIN_PPMS,p/1.5)),style:btnStyle()},'−'),
      React.createElement('button',{onClick:handleFit,style:{...btnStyle(),color:'#58a6ff',borderColor:'#58a6ff44'}},'Fit'),
      React.createElement('button',{
        onClick:()=>{api.ipc.invoke('clear-runs').catch(()=>{}); setIsRunning(false);},
        style:{...btnStyle(),color:'#f85149',borderColor:'#f8514944',marginLeft:6}
      },'Clear'),
    ),

    // Body
    React.createElement('div',{style:{display:'flex',flex:1,overflow:'hidden'}},

      // 左: 統計
      React.createElement('div',{
        style:{width:192,borderRight:'1px solid #21262d',display:'flex',
               flexDirection:'column',overflow:'hidden',flexShrink:0}
      },
        React.createElement('div',{
          style:{padding:'6px 10px 4px',fontSize:10,color:'#8b949e',
                 letterSpacing:0.8,textTransform:'uppercase',borderBottom:'1px solid #21262d'}
        },'Hook Events'),
        React.createElement('div',{style:{flex:1,overflowY:'auto'}},
          ...STAT_ROWS.map(row => {
            const s = summary[row.name]||{count:0,avgLatency:null,lastLatency:null};
            return React.createElement('div',{
              key:row.name,
              style:{padding:'6px 10px',borderBottom:'1px solid #21262d1a',opacity:s.count===0?0.35:1}
            },
              React.createElement('div',{style:{display:'flex',alignItems:'center',gap:5,marginBottom:2}},
                React.createElement('div',{style:{width:8,height:8,borderRadius:2,background:row.color,flexShrink:0}}),
                React.createElement('span',{style:{color:row.color,fontSize:10,fontWeight:600,
                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},row.name),
              ),
              React.createElement('div',{style:{display:'flex',gap:6,marginLeft:13,color:'#8b949e',fontSize:10}},
                React.createElement('span',null,'×'+fmtCount(s.count)),
                s.avgLatency  != null && React.createElement('span',null,'avg '+fmtMs(s.avgLatency)),
                s.lastLatency != null && React.createElement('span',{style:{color:'#58a6ff'}},'last '+fmtMs(s.lastLatency)),
              ),
            );
          })
        ),
      ),

      // 右: タイムライン
      React.createElement('div',{
        ref:wrapRef,
        style:{flex:1,position:'relative',overflowX:'hidden',overflowY:'auto',background:'#0d1117'}
      },
        React.createElement('canvas',{
          ref:canvasRef,
          style:{display:'block',cursor:isDrag?'grabbing':'grab',userSelect:'none',width:canvasW+'px'},
          onMouseDown,onMouseMove,onMouseUp,onMouseLeave,
        }),

        allRuns.length===0 && React.createElement('div',{
          style:{position:'absolute',inset:0,display:'flex',flexDirection:'column',
                 alignItems:'center',justifyContent:'center',color:'#8b949e',
                 gap:10,pointerEvents:'none'}
        },
          React.createElement('div',{style:{fontSize:38}},'⏱'),
          React.createElement('div',{style:{fontSize:13}},'チャットを送信してフックイベントを計測する'),
          React.createElement('div',{style:{fontSize:11,color:'#6e7681'}},'ホイールでズーム・ドラッグでパン'),
        ),

        tooltip && React.createElement('div',{
          style:{
            position:'fixed',left:tooltip.x+16,top:tooltip.y-8,
            background:'#1c2128',
            border:'1px solid #58a6ff',
            borderRadius:6,padding:'7px 11px',
            fontSize:11,color:'#c9d1d9',
            pointerEvents:'none',zIndex:9999,
            maxWidth:280,lineHeight:1.7,
            boxShadow:'0 4px 20px #000a',
          }
        },
          React.createElement('div',{style:{color:'#58a6ff',fontWeight:700,marginBottom:3,fontSize:12}},
            'Run '+(tooltip.ri+1)+'  '+tooltip.ev.name),
          React.createElement('div',null,
            React.createElement('span',{style:{color:'#6e7681'}},'time  '),fmtMs(tooltip.ev.relTime)),
          tooltip.ev._paired && tooltip.ev._aev && React.createElement('div',null,
            React.createElement('span',{style:{color:'#6e7681'}},'end   '),fmtMs(tooltip.ev.endRelTime),
            React.createElement('span',{style:{color:'#6e7681'}},'  dur '),fmtMs(tooltip.ev.endRelTime-tooltip.ev.relTime)),
          tooltip.ev.meta && Object.entries(tooltip.ev.meta).map(([k,v])=>
            v!=null && React.createElement('div',{key:k},
              React.createElement('span',{style:{color:'#6e7681'}},k+'  '),String(v).slice(0,60))
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
