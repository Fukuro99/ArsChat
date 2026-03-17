# 設計書：スプリットペイン + タブドラッグ

## 概要

VS Code 風のエディタグループ機能。タブをドラッグして左右分割、各ペインが独立したタブ管理を持つ。

---

## 現状のタブシステム（実装済み）

```
App.tsx
└─ tabs: AppTab[]          // 全タブのフラット配列
└─ activeTabId: string     // アクティブタブ
└─ [タブバー UI]           // メインエリア上部
└─ [タブコンテンツ]         // display:none で全レンダリング
```

---

## 変更後の State 設計

```typescript
// ペイン（エディタグループ）
interface Pane {
  id: string;                // ユニーク ID ('pane-1', 'pane-2', ...)
  tabs: AppTab[];            // このペインが持つタブ
  activeTabId: string;       // このペインのアクティブタブ
}

// App.tsx の新 state
const [panes, setPanes] = useState<Pane[]>([
  { id: 'pane-1', tabs: [chatTab], activeTabId: 'chat' }
]);
const [activePaneId, setActivePaneId] = useState<string>('pane-1');
const [paneWidths, setPaneWidths] = useState<number[]>([]);  // 各ペインの幅比率
```

### 分割方向

初期実装は **左右分割（水平）のみ**。上下分割は v2 で検討。

---

## UI レイアウト

```
┌────────────────────────────────────────────────┐
│ ActivityBar │ SidePanel │ [ペイン1] ║ [ペイン2] │
│             │           │ [タブバー]║ [タブバー]│
│             │           │ [コンテンツ]║[コンテンツ]│
│             │           │          ║           │
└────────────────────────────────────────────────┘
                           ↑ ResizeHandle
```

ペイン間にリサイズハンドル（既存の `makeResizeHandler` パターンを流用）。

---

## ドラッグ操作の仕様

### タブの並び替え（同一ペイン内）

```
[タブA][タブB][タブC]  →  ドラッグ A を B の右へ  →  [タブB][タブA][タブC]
```

- `onMouseDown` でドラッグ開始
- ドラッグ中：半透明のゴースト表示、挿入位置のインジケータ（縦線）
- `onMouseUp` でドロップ → tabs 配列を並び替え

### ペインへのタブ移動

```
[タブA][タブB]  →  ドラッグ A を右端にドロップ  →  [タブB] ║ [タブA]（新ペイン）
```

**ドロップゾーン（4種）**
```
┌──────────────────────────┐
│        [上 25%]          │  → 現在未対応（v2）
│ [左25%][  中央  ][右25%] │  → 左/右ゾーンで分割
│        [下 25%]          │  → 現在未対応（v2）
└──────────────────────────┘
```

- **中央ゾーンにドロップ**：既存ペインにタブを追加（移動）
- **左ゾーンにドロップ**：既存ペインの左に新ペインを作成してタブを移動
- **右ゾーンにドロップ**：既存ペインの右に新ペインを作成してタブを移動

ドラッグ中、対象ペインにドロップゾーンをオーバーレイ表示。

---

## コンポーネント設計

### 新コンポーネント `PaneGroup`

```tsx
// src/renderer/components/PaneGroup.tsx
interface PaneGroupProps {
  panes: Pane[];
  activePaneId: string;
  extensions: LoadedExtension[];
  onTabClose: (paneId: string, tabId: string) => void;
  onTabActivate: (paneId: string, tabId: string) => void;
  onTabMove: (fromPane: string, toPane: string, tabId: string, insertIdx: number) => void;
  onPaneSplit: (sourcePaneId: string, tabId: string, direction: 'left' | 'right') => void;
  onPaneClose: (paneId: string) => void;
  renderContent: (tab: AppTab) => React.ReactNode;
}
```

### `TabBar` コンポーネント（新規分離）

```tsx
// src/renderer/components/TabBar.tsx
interface TabBarProps {
  tabs: AppTab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onDragStart: (tabId: string) => void;
  onDrop: (tabId: string, insertIdx: number) => void;
}
```

---

## ドラッグ実装詳細

### ドラッグ状態（App.tsx level）

```typescript
interface DragState {
  tabId: string;
  sourcePaneId: string;
  currentX: number;
  currentY: number;
}
const [dragging, setDragging] = useState<DragState | null>(null);
```

### ドラッグ検出

HTML5 Drag & Drop API は使わない（カスタム挙動が困難）。
**マウスイベント**で実装：

```typescript
// TabBar の各タブ
onMouseDown={(e) => {
  // 300ms 以上保持 or 5px 以上移動でドラッグ開始
  const startX = e.clientX, startY = e.clientY;
  const timer = setTimeout(() => startDrag(tabId), 300);
  const onMove = (ev) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 5) {
      clearTimeout(timer);
      startDrag(tabId);
    }
  };
  window.addEventListener('mousemove', onMove, { once: true });
  window.addEventListener('mouseup', () => clearTimeout(timer), { once: true });
}}
```

### ドラッグゴースト

```tsx
// App.tsx - ドラッグ中に表示
{dragging && (
  <div
    className="fixed pointer-events-none z-50 bg-aria-bg-light border border-aria-border rounded px-3 py-1 text-xs opacity-80 shadow-lg"
    style={{ left: dragging.currentX + 10, top: dragging.currentY - 10 }}
  >
    {tabs.find(t => t.id === dragging.tabId)?.label}
  </div>
)}
```

---

## ペイン操作関数

```typescript
// タブを別ペインに移動
function moveTab(fromPaneId: string, toPaneId: string, tabId: string, insertIdx: number) {
  setPanes(prev => {
    const fromPane = prev.find(p => p.id === fromPaneId)!;
    const toPane   = prev.find(p => p.id === toPaneId)!;
    const tab      = fromPane.tabs.find(t => t.id === tabId)!;
    const newFrom  = { ...fromPane, tabs: fromPane.tabs.filter(t => t.id !== tabId) };
    const newTabs  = [...toPane.tabs];
    newTabs.splice(insertIdx, 0, tab);
    const newTo    = { ...toPane, tabs: newTabs, activeTabId: tabId };
    // fromPane が空になったら削除
    if (newFrom.tabs.length === 0) return prev.filter(p => p.id !== fromPaneId).map(p => p.id === toPaneId ? newTo : p);
    return prev.map(p => p.id === fromPaneId ? newFrom : p.id === toPaneId ? newTo : p);
  });
}

// タブをドロップして分割
function splitPane(sourcePaneId: string, tabId: string, direction: 'left' | 'right') {
  setPanes(prev => {
    const sourcePane = prev.find(p => p.id === sourcePaneId)!;
    const tab        = sourcePane.tabs.find(t => t.id === tabId)!;
    const newPane: Pane = { id: `pane-${Date.now()}`, tabs: [tab], activeTabId: tabId };
    const newSource  = { ...sourcePane, tabs: sourcePane.tabs.filter(t => t.id !== tabId) };
    const idx        = prev.indexOf(sourcePane);
    const result     = [...prev];
    result[idx]      = newSource;
    result.splice(direction === 'right' ? idx + 1 : idx, 0, newPane);
    return result;
  });
}
```

---

## 実装フェーズ

### Phase 1：タブ並び替え（同一ペイン、ドラッグ）
- 対象ファイル：`App.tsx`, `TabBar.tsx`（新規）
- 工数：3〜4時間
- 依存：なし

### Phase 2：ペイン分割（スプリット）
- 対象ファイル：`App.tsx`, `PaneGroup.tsx`（新規）, `TabBar.tsx`（更新）
- 工数：6〜8時間
- 依存：Phase 1 完了後

### Phase 3：ペイン間タブ移動
- 対象ファイル：`App.tsx`（`moveTab` 関数追加）, `PaneGroup.tsx`（ドロップゾーン）
- 工数：3〜4時間
- 依存：Phase 2 完了後

---

## 現在の実装との差分サマリー

| 項目 | 現在 | 変更後 |
|------|------|--------|
| state | `tabs[]` + `activeTabId` | `panes[]` (各ペインに `tabs[]` + `activeTabId`) |
| レンダリング | 1つのタブバー + コンテンツ | `PaneGroup` で複数ペインを `flex` 配置 |
| タブ操作 | `closeTab()`, `navigate()` | 既存 + `moveTab()`, `splitPane()` |
| リサイズ | 既存 `makeResizeHandler` | ペイン間にも同パターン適用 |

---

## 留意点・リスク

1. **display:none によるコンテンツ保持**：現在の仕組みはそのまま活用できる（各ペインでそれぞれ display:none）
2. **ChatWindow の複数インスタンス**：チャットタブは常に1つのみ（closable: false）なのでペイン分割しても1つのインスタンスが display:none で切り替わる
3. **拡張側 openTab API**：ペイン指定は不要（App 側が適切なペインに配置する）
