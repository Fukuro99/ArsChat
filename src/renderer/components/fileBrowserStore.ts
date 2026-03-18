/**
 * fileBrowserStore.ts
 * FileBrowserPanel → FileViewerPage へのファイルデータ受け渡し用ストア
 * （React Fast Refresh の制約上、コンポーネントファイルと分離）
 */
export const pendingFiles = new Map<string, { path: string; name: string; content: string }>();
