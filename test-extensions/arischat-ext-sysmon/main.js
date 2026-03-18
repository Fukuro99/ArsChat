/**
 * arschat-ext-sysmon / main.js
 * CPU・メモリ・GPU リソースを取得して IPC で公開する
 */
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ===== CPU =====

let prevCpuInfo = null;

function calcCpuUsage() {
  const cpus = os.cpus();
  if (!prevCpuInfo) {
    prevCpuInfo = cpus;
    return 0;
  }

  let totalDelta = 0;
  let idleDelta  = 0;

  for (let i = 0; i < cpus.length; i++) {
    const p = prevCpuInfo[i].times;
    const c = cpus[i].times;
    const pt = p.user + p.nice + p.sys + p.idle + p.irq;
    const ct = c.user + c.nice + c.sys + c.idle + c.irq;
    totalDelta += ct - pt;
    idleDelta  += c.idle - p.idle;
  }

  prevCpuInfo = cpus;
  return totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;
}

// ===== GPU =====

/**
 * NVIDIA GPU: nvidia-smi で使用率・VRAM・温度を取得
 */
async function getNvidiaGpus() {
  try {
    const { stdout } = await execAsync(
      'nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits',
      { timeout: 4000 },
    );
    return stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line, i) => {
        const [name, usage, memUsedMB, memTotalMB, temp] = line.split(',').map(s => s.trim());
        const memUsed  = parseInt(memUsedMB,  10) * 1024 * 1024;
        const memTotal = parseInt(memTotalMB, 10) * 1024 * 1024;
        return {
          index    : i,
          vendor   : 'NVIDIA',
          name     : name || 'NVIDIA GPU',
          usage    : parseFloat(usage) || 0,
          memUsed,
          memTotal,
          memPercent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
          temp     : parseFloat(temp) || null,
        };
      });
  } catch {
    return null; // nvidia-smi なし
  }
}

/**
 * AMD GPU (Windows): WMI で名前・VRAM のみ（使用率は取得困難）
 */
async function getAmdGpuWindows() {
  try {
    const ps = `Get-WmiObject Win32_VideoController | Where-Object { $_.Name -like '*AMD*' -or $_.Name -like '*Radeon*' } | Select-Object Name,AdapterRAM | ConvertTo-Json`;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 });
    const data = JSON.parse(stdout.trim());
    const arr = Array.isArray(data) ? data : [data];
    return arr.filter(Boolean).map((item, i) => ({
      index     : i,
      vendor    : 'AMD',
      name      : item.Name || 'AMD GPU',
      usage     : null,
      memUsed   : null,
      memTotal  : item.AdapterRAM ? parseInt(item.AdapterRAM) : null,
      memPercent: null,
      temp      : null,
    }));
  } catch {
    return null;
  }
}

/**
 * 汎用フォールバック: WMI で GPU 名と VRAM だけ取得（Windows）
 */
async function getGenericGpuWindows() {
  try {
    const ps = `Get-WmiObject Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json`;
    const { stdout } = await execAsync(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 });
    const data = JSON.parse(stdout.trim());
    const arr = Array.isArray(data) ? data : [data];
    return arr.filter(Boolean).map((item, i) => ({
      index     : i,
      vendor    : 'GPU',
      name      : item.Name || 'Unknown GPU',
      usage     : null,
      memUsed   : null,
      memTotal  : item.AdapterRAM ? parseInt(item.AdapterRAM) : null,
      memPercent: null,
      temp      : null,
    }));
  } catch {
    return [];
  }
}

async function getGpuInfo() {
  // 1. NVIDIA SMI を試みる
  const nvidia = await getNvidiaGpus();
  if (nvidia && nvidia.length > 0) return nvidia;

  // 2. AMD (Windows PowerShell)
  if (os.platform() === 'win32') {
    const amd = await getAmdGpuWindows();
    if (amd && amd.length > 0) return amd;

    // 3. 汎用 WMI
    return getGenericGpuWindows();
  }

  return [];
}

// ===== エントリポイント =====

function activate(ctx) {
  // 初回スナップショット
  prevCpuInfo = os.cpus();

  ctx.ipc.handle('get-metrics', async () => {
    const cpuUsage = calcCpuUsage();
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;
    const cpus     = os.cpus();
    const gpus     = await getGpuInfo();

    return {
      cpu: {
        usage : cpuUsage,
        cores : cpus.length,
        model : (cpus[0]?.model ?? 'Unknown').trim(),
      },
      memory: {
        total  : totalMem,
        free   : freeMem,
        used   : usedMem,
        percent: (usedMem / totalMem) * 100,
      },
      gpus,
      platform: os.platform(),
      arch    : os.arch(),
      hostname: os.hostname(),
      uptime  : os.uptime(),
    };
  });

  ctx.log.info('SysMon Extension: 起動完了（GPU 検出対応）');
}

function deactivate() {}

module.exports = { activate, deactivate };
