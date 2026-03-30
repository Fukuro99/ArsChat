// ===== 共有型定義 =====

export interface AppTab {
  id: string; // ユニーク ID（通常は page 文字列、動的タブは 'ext:{id}:{tabId}'）
  page: string; // 'chat' | 'settings' | 'ext:{id}:{pageId or tabId}'
  label: string;
  icon?: string;
  closable: boolean;
  /** openTab で作られた動的タブ：実際に使うコンポーネントの pageId */
  pageComponentId?: string;
  /** openTab で作られた動的タブ：コンポーネントに渡す tabId prop */
  tabId?: string;
}

export interface Pane {
  id: string;
  tabs: AppTab[];
  activeTabId: string;
}

export interface DragState {
  tabId: string;
  sourcePaneId: string;
  currentX: number;
  currentY: number;
}
