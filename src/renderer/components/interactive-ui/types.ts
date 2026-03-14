// ===== Interactive UI 型定義 =====

/** UIツリーのノード（再帰的） */
export interface UINode {
  primitive: string;              // プリミティブ名
  id?: string;                    // ノードID（イベント識別用）
  props?: Record<string, any>;   // プリミティブ固有のプロパティ
  children?: UINode[];           // 子ノード（レイアウト系の場合）

  /** 条件付き表示（stateの値で表示/非表示を切り替え） */
  showIf?: string;               // state内のキーパス e.g. "game.isOver"

  /** stateバインディング（inputの値をstateに紐付け） */
  bind?: string;                 // state内のキーパス e.g. "form.name"
}

/** UIアクション定義 */
export interface UIAction {
  type: 'submit' | 'cancel' | 'custom';
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  actionId?: string;
}

/** AIが出力するUIブロック全体 */
export interface InteractiveUIBlock {
  id: string;                      // ブロック一意ID
  mode?: 'default' | 'live';     // default=使い捨て, live=永続的
  title?: string;                  // ブロックタイトル
  state?: Record<string, any>;   // 動的状態（liveモード用）
  root: UINode;                    // UIツリーのルート
  actions?: UIAction[];          // submit/cancelボタン（defaultモード用）

  /** 内部用: テキストパーツ内での位置インデックス */
  _index?: number;
}

/** パース済みコンテンツ */
export interface ParsedContent {
  /** テキスト部分とnull（UIブロックの位置）の配列 */
  textParts: (string | null)[];
  /** UIブロック配列 */
  blocks: InteractiveUIBlock[];
  /** サンドボックスHTMLブロック配列 */
  sandboxBlocks: SandboxHTMLBlock[];
  /** 未閉じのUIブロックがあるか（ストリーミング中） */
  isLoading: boolean;
}

/** UIアップデートパッチ */
export interface UIUpdatePatch {
  id: string;
  patch: Record<string, any>;
}

/** サンドボックスHTML UIブロック */
export interface SandboxHTMLBlock {
  id: string;
  mode?: 'default' | 'live';
  title?: string;
  width?: string;
  height?: string;
  libs?: string[];       // 将来の外部ライブラリ注入用（現在は無視）
  html: string;          // 実際のHTMLコンテンツ
  /** 内部用: テキストパーツ内での位置インデックス */
  _index?: number;
}

/** プリミティブコンポーネントの共通Props */
export interface PrimitiveProps {
  props: Record<string, any>;     // プリミティブ固有のプロパティ
  value?: any;                     // bind による値（input系）
  onChange?: (v: any) => void;   // 値変更コールバック（input系）
  onAction?: (actionId: string, data?: any) => void; // アクションコールバック
  state?: Record<string, any>;  // 現在のUIブロック状態（テンプレート変数展開用）
  children?: React.ReactNode;   // 子コンポーネント（レイアウト系）
}
