/**
 * Extension Loader (Renderer Process)
 *
 * Main Process から拡張情報を取得し、Renderer Entry (renderer.js) を
 * 動的 import で読み込んで React コンポーネントを返す。
 */

import React from 'react';
import type { ExtensionInfo } from '../shared/types';

// ===== Renderer API 型 =====

export interface ExtensionRendererAPI {
  /** Main Entry との IPC 通信 */
  ipc: {
    /** Main Entry の handle() に対して invoke する */
    invoke(channel: string, data?: any): Promise<any>;
    /** Main Entry に fire-and-forget 送信 */
    send(channel: string, data?: any): void;
    /** Main Entry からのイベントを受信 */
    on(channel: string, handler: (data: any) => void): () => void;
  };
  /** 拡張メタ情報 */
  extension: {
    id: string;
    version: string;
  };
  /** アプリ内ナビゲーション */
  navigation: {
    goTo(pageId: string): void;
    goToChat(): void;
    /**
     * ファイル等、動的にタブを開く。
     * id はこの拡張内でユニークな文字列（例: 'file:/path/to/foo.ts'）。
     * pageId は renderer.js の pages.{pageId} に対応するコンポーネント。
     * コンポーネントは props.tabId でこの id を受け取れる。
     */
    openTab(options: { id: string; label: string; icon?: string; pageId: string }): void;
  };
}

// ===== ロード済み拡張 =====

export interface LoadedExtension {
  info: ExtensionInfo;
  /** pages.{pageId}: React コンポーネント（フルページ） */
  pages: Record<string, React.ComponentType<{ api: ExtensionRendererAPI }>>;
  /** settings.{panelId}: React コンポーネント */
  settings: Record<string, React.ComponentType<{ api: ExtensionRendererAPI }>>;
  /** sidebarPanels.{pageId}: 左サイドバー内インラインパネル */
  sidebarPanels: Record<string, React.ComponentType<{ api: ExtensionRendererAPI }>>;
  /** rightPanels.{pageId}: 右パネルのタブコンテンツ */
  rightPanels: Record<string, React.ComponentType<{ api: ExtensionRendererAPI }>>;
}

// ===== ローダー =====

/** openTab コールバックのオプション型 */
export interface OpenTabOptions {
  extId: string;
  id: string;
  label: string;
  icon?: string;
  pageId: string;
}

/**
 * 有効な全拡張をロードして返す。
 * @param onNavigate - App.tsx の navigate 関数
 * @param onOpenTab  - App.tsx の openExtTab 関数（動的タブ生成）
 */
export async function loadExtensions(
  onNavigate: (page: string) => void,
  onOpenTab: (options: OpenTabOptions) => void,
): Promise<LoadedExtension[]> {
  const extInfoList: ExtensionInfo[] = await window.arsChatAPI.extensions.list();
  const results: LoadedExtension[] = [];

  for (const info of extInfoList) {
    if (!info.enabled) continue;

    try {
      const loaded = await loadOneExtension(info, onNavigate, onOpenTab);
      results.push(loaded);
    } catch (err: any) {
      console.error(`[ExtensionLoader] 拡張 "${info.id}" のロードに失敗:`, err?.message);
    }
  }

  return results;
}

async function loadOneExtension(
  info: ExtensionInfo,
  onNavigate: (page: string) => void,
  onOpenTab: (options: OpenTabOptions) => void,
): Promise<LoadedExtension> {
  // Main Process から Renderer Entry のコードを取得
  const result = await window.arsChatAPI.extensions.readRendererCode(info.id);
  if (!result.success) {
    throw new Error(result.error ?? 'Renderer Entry の読み込みに失敗しました');
  }

  // React / React-DOM をグローバル公開（拡張側が external で参照できるように）
  const w = window as any;
  if (!w.__ARISCHAT_REACT__) {
    w.__ARISCHAT_REACT__ = React;
  }

  // ESM モジュールとして動的 import する
  // esbuild format:esm で出力された拡張コードを想定。
  // React を inline inject して import.meta 等を回避するため IIFE ラッパーを使用。
  const wrappedCode = `
const React = window.__ARISCHAT_REACT__;
const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext } = React;
${result.code}
`;

  const blob = new Blob([wrappedCode], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);

  let mod: any;
  try {
    mod = await import(/* @vite-ignore */ blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  // デフォルトエクスポートから pages / settings / sidebarPanels / rightPanels を取得
  const defaultExport = mod.default ?? mod;
  const pages: Record<string, React.ComponentType<any>> = defaultExport?.pages ?? {};
  const settings: Record<string, React.ComponentType<any>> = defaultExport?.settings ?? {};
  const sidebarPanels: Record<string, React.ComponentType<any>> = defaultExport?.sidebarPanels ?? {};
  const rightPanels: Record<string, React.ComponentType<any>> = defaultExport?.rightPanels ?? {};

  // ExtensionRendererAPI を生成
  const api = createRendererAPI(info, onNavigate, onOpenTab);

  // API を各コンポーネントに bind した Wrapper を作る
  function bindAll(map: Record<string, React.ComponentType<any>>): Record<string, React.ComponentType<any>> {
    const bound: Record<string, React.ComponentType<any>> = {};
    for (const [id, Component] of Object.entries(map)) {
      bound[id] = (props: any) => React.createElement(Component, { ...props, api });
    }
    return bound;
  }

  return {
    info,
    pages: bindAll(pages),
    settings: bindAll(settings),
    sidebarPanels: bindAll(sidebarPanels),
    rightPanels: bindAll(rightPanels),
  };
}

function createRendererAPI(
  info: ExtensionInfo,
  onNavigate: (page: string) => void,
  onOpenTab: (options: OpenTabOptions) => void,
): ExtensionRendererAPI {
  return {
    ipc: {
      invoke: (channel: string, data?: any) => window.arsChatAPI.extensions.invoke(info.id, channel, data),
      send: (channel: string, data?: any) => window.arsChatAPI.extensions.send(info.id, channel, data),
      on: (channel: string, handler: (data: any) => void) => window.arsChatAPI.extensions.on(info.id, channel, handler),
    },
    extension: {
      id: info.id,
      version: info.version,
    },
    navigation: {
      goTo: (pageId: string) => onNavigate(`ext:${info.id}:${pageId}`),
      goToChat: () => onNavigate('chat'),
      openTab: (options) => onOpenTab({ extId: info.id, ...options }),
    },
  };
}
