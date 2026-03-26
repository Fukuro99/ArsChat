import * as fs from 'fs';
import * as path from 'path';
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import {
  ExtensionRegistryEntry,
  ExtensionManifest,
  ExtensionInfo,
  ExtensionPermission,
} from '../shared/types';

const execAsync = promisify(exec);

const REGISTRY_FILE_NAME = 'registry.json';

export interface InstallProgress {
  step: 'clone' | 'install' | 'build' | 'done' | 'error';
  message: string;
}

export interface ExtensionManager {
  getExtensionsDir(): string;
  list(): ExtensionRegistryEntry[];
  listForRenderer(): ExtensionInfo[];
  install(
    url: string,
    onProgress: (p: InstallProgress) => void,
  ): Promise<ExtensionRegistryEntry>;
  uninstall(extId: string): Promise<void>;
  toggle(extId: string, enabled: boolean): Promise<void>;
  update(extId: string, onProgress: (p: InstallProgress) => void): Promise<void>;
  readRendererCode(extId: string): string;
  /** 有効な拡張を全てロード（activate 呼び出し） */
  loadAll(contextFactory: (entry: ExtensionRegistryEntry) => any): Promise<void>;
  unloadAll(): Promise<void>;
}

export function createExtensionManager(dataDir: string): ExtensionManager {
  const extensionsDir = path.join(dataDir, 'extensions');
  const registryPath = path.join(extensionsDir, REGISTRY_FILE_NAME);

  /** activate の戻り値（deactivate 用） */
  const loadedModules = new Map<string, { deactivate?: () => void | Promise<void> }>();

  // ディレクトリ確保
  if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
  }

  // ===== registry 読み書き =====

  function readRegistry(): ExtensionRegistryEntry[] {
    try {
      if (fs.existsSync(registryPath)) {
        return JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
      }
    } catch (err) {
      console.error('[ExtensionManager] registry 読み込みエラー:', err);
    }
    return [];
  }

  function writeRegistry(entries: ExtensionRegistryEntry[]): void {
    fs.writeFileSync(registryPath, JSON.stringify(entries, null, 2), 'utf-8');
  }

  // ===== manifest 読み込み =====

  function readManifest(extDir: string): { version: string; manifest: ExtensionManifest } {
    const pkgPath = path.join(extDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    if (!pkg.arschat) {
      throw new Error('package.json に arschat フィールドがありません');
    }
    const manifest = pkg.arschat as ExtensionManifest;
    // package.json 直下の description を arschat セクションにフォールバック
    if (!manifest.description && pkg.description) {
      manifest.description = pkg.description;
    }
    return { version: pkg.version ?? '0.0.0', manifest };
  }

  // ===== Git clone / pull =====

  /** URL → リポジトリ名（ディレクトリ名）を返す */
  function repoNameFromUrl(url: string): string {
    return url.replace(/\.git$/, '').split('/').pop() ?? 'unknown-ext';
  }

  async function gitClone(url: string, destDir: string): Promise<void> {
    await execAsync(`git clone --depth 1 "${url}" "${destDir}"`);
  }

  async function gitPull(extDir: string): Promise<void> {
    await execAsync('git pull --ff-only', { cwd: extDir });
  }

  async function npmInstallAndBuild(extDir: string): Promise<void> {
    await execAsync('npm install --prefer-offline', { cwd: extDir });
    await execAsync('npm run build', { cwd: extDir });
  }

  // ===== public API =====

  function getExtensionsDir(): string {
    return extensionsDir;
  }

  function list(): ExtensionRegistryEntry[] {
    return readRegistry();
  }

  function listForRenderer(): ExtensionInfo[] {
    return readRegistry().map((entry) => {
      // source がローカル絶対パスの場合はそのまま使用、そうでなければ extensionsDir/id
      const extDir = path.isAbsolute(entry.source) && fs.existsSync(entry.source)
        ? entry.source
        : path.join(extensionsDir, entry.id);
      const rendererPath = path.join(extDir, entry.manifest.renderer);
      return {
        id: entry.id,
        source: entry.source,
        version: entry.version,
        enabled: entry.enabled,
        manifest: entry.manifest,
        rendererPath,
      };
    });
  }

  async function install(
    url: string,
    onProgress: (p: InstallProgress) => void,
  ): Promise<ExtensionRegistryEntry> {
    // ローカルパス対応 (file:// または絶対パス)
    const isLocalPath = url.startsWith('file://') || path.isAbsolute(url);
    const localPath = url.startsWith('file://') ? url.slice(7) : url;

    const id = repoNameFromUrl(isLocalPath ? localPath : url);
    const extDir = isLocalPath ? localPath : path.join(extensionsDir, id);

    if (!isLocalPath && fs.existsSync(extDir)) {
      throw new Error(`拡張 "${id}" は既にインストールされています`);
    }

    if (isLocalPath) {
      // ローカルパスの場合はそのディレクトリを直接使用（コピーしない）
      if (!fs.existsSync(extDir)) {
        throw new Error(`パスが見つかりません: ${extDir}`);
      }
      onProgress({ step: 'clone', message: `ローカルパスから読み込み中: ${extDir}` });
    } else {
      // 1. git clone
      onProgress({ step: 'clone', message: 'リポジトリをクローン中...' });
      await gitClone(url, extDir);
    }

    // 2. npm install + build
    onProgress({ step: 'install', message: '依存パッケージをインストール中...' });
    onProgress({ step: 'build', message: 'ビルド中...' });
    await npmInstallAndBuild(extDir);

    // 3. manifest 読み込み
    const { version, manifest } = readManifest(extDir);

    // ローカルパスの場合は manifest の name または ディレクトリ名を id にする
    const resolvedId = isLocalPath
      ? (path.basename(extDir))
      : id;

    // ローカルパスの場合は listForRenderer でも extDir を使う
    if (isLocalPath) {
      // registry に extDir を保存するため source にフルパスを入れる
    }

    // 4. registry 登録
    const entry: ExtensionRegistryEntry = {
      id: resolvedId,
      source: isLocalPath ? extDir : url,
      version,
      installedAt: new Date().toISOString(),
      enabled: true,
      permissions: manifest.permissions ?? [],
      manifest,
    };

    const entries = readRegistry();
    entries.push(entry);
    writeRegistry(entries);

    onProgress({ step: 'done', message: 'インストール完了' });
    return entry;
  }

  async function uninstall(extId: string): Promise<void> {
    // deactivate
    const loaded = loadedModules.get(extId);
    if (loaded?.deactivate) {
      try { await loaded.deactivate(); } catch {}
    }
    loadedModules.delete(extId);

    // ディレクトリ削除
    const extDir = path.join(extensionsDir, extId);
    if (fs.existsSync(extDir)) {
      fs.rmSync(extDir, { recursive: true, force: true });
    }

    // registry から削除
    const entries = readRegistry().filter((e) => e.id !== extId);
    writeRegistry(entries);
  }

  async function toggle(extId: string, enabled: boolean): Promise<void> {
    const entries = readRegistry().map((e) =>
      e.id === extId ? { ...e, enabled } : e,
    );
    writeRegistry(entries);
  }

  async function update(
    extId: string,
    onProgress: (p: InstallProgress) => void,
  ): Promise<void> {
    const entry = readRegistry().find((e) => e.id === extId);
    if (!entry) throw new Error(`拡張 "${extId}" が見つかりません`);

    // loadOne / readRendererCode と同じロジックでディレクトリを解決
    const isLocalPath = path.isAbsolute(entry.source) && fs.existsSync(entry.source);
    const extDir = isLocalPath ? entry.source : path.join(extensionsDir, extId);

    if (isLocalPath) {
      // ローカルパス拡張は git pull 不要（ファイルは既に最新）
      onProgress({ step: 'clone', message: 'ローカル拡張機能を更新中...' });
    } else {
      onProgress({ step: 'clone', message: '最新版を取得中...' });
      await gitPull(extDir);
    }

    onProgress({ step: 'install', message: '依存パッケージを更新中...' });
    onProgress({ step: 'build', message: 'ビルド中...' });
    await npmInstallAndBuild(extDir);

    // manifest 更新（権限変更も反映）
    const { version, manifest } = readManifest(extDir);
    const entries = readRegistry().map((e) =>
      e.id === extId ? { ...e, version, manifest, permissions: manifest.permissions ?? [] } : e,
    );
    writeRegistry(entries);

    onProgress({ step: 'done', message: '更新完了' });
  }

  function readRendererCode(extId: string): string {
    const entry = readRegistry().find((e) => e.id === extId);
    if (!entry) throw new Error(`拡張 "${extId}" が見つかりません`);

    const extDir = path.isAbsolute(entry.source) && fs.existsSync(entry.source)
      ? entry.source
      : path.join(extensionsDir, extId);
    const rendererPath = path.join(extDir, entry.manifest.renderer);

    if (!fs.existsSync(rendererPath)) {
      throw new Error(`Renderer エントリが見つかりません: ${rendererPath}`);
    }
    return fs.readFileSync(rendererPath, 'utf-8');
  }

  async function loadAll(contextFactory: (entry: ExtensionRegistryEntry) => any): Promise<void> {
    const entries = readRegistry().filter((e) => e.enabled);

    for (const entry of entries) {
      try {
        await loadOne(entry, contextFactory);
      } catch (err: any) {
        console.error(`[ExtensionManager] 拡張 "${entry.id}" のロードに失敗:`, err?.message);
      }
    }
  }

  async function loadOne(
    entry: ExtensionRegistryEntry,
    contextFactory: (entry: ExtensionRegistryEntry) => any,
  ): Promise<void> {
    if (!entry.manifest.main) return; // Main Entry なし（Renderer Only）

    const extDir = path.isAbsolute(entry.source) && fs.existsSync(entry.source)
      ? entry.source
      : path.join(extensionsDir, entry.id);
    const mainPath = path.join(extDir, entry.manifest.main);

    if (!fs.existsSync(mainPath)) {
      console.warn(`[ExtensionManager] Main Entry が見つかりません: ${mainPath}`);
      return;
    }

    // Node.js require でロード
    // require のキャッシュをクリアして常に最新版をロード
    delete require.cache[require.resolve(mainPath)];
    const mod = require(mainPath);

    const ctx = contextFactory(entry);
    const result = await mod.activate?.(ctx);

    loadedModules.set(entry.id, {
      deactivate: mod.deactivate ?? result?.deactivate,
    });

    console.log(`[ExtensionManager] 拡張 "${entry.id}" を起動しました`);
  }

  async function unloadAll(): Promise<void> {
    for (const [id, mod] of loadedModules) {
      try {
        if (mod.deactivate) await mod.deactivate();
      } catch (err: any) {
        console.error(`[ExtensionManager] 拡張 "${id}" の停止に失敗:`, err?.message);
      }
    }
    loadedModules.clear();
  }

  return {
    getExtensionsDir,
    list,
    listForRenderer,
    install,
    uninstall,
    toggle,
    update,
    readRendererCode,
    loadAll,
    unloadAll,
  };
}
