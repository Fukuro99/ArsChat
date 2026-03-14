# Interactive UI - 設計ドキュメント

## 概要

チャットメッセージ内にAIが動的に定義するカスタムUIコンポーネントを表示し、ユーザーとAIがリッチなインターフェースを介してコミュニケーションできる機能。

## 実現可能性: **可能**

ArisChatの現在のアーキテクチャ（Electron + React + Markdown描画パイプライン）は、この機能を自然に拡張できる構造を持っている。

**根拠:**
- MessageBubble.tsx が既に `dangerouslySetInnerHTML` でリッチコンテンツを描画しており、カスタムコンポーネント描画への拡張が自然
- IPC通信基盤（preload bridge）が既に確立されており、UI操作 → AI へのフィードバックループを構築可能
- MCPツールシステムが「AIがアクションを定義し実行する」パターンを既に実装しており、UIコンポーネントの動的定義も同様のパターンで実現可能
- React 18のコンポーネントモデルにより、JSON定義からの動的UIレンダリングは標準的なアプローチ

---

## コアコンセプト

### AIが出力する「UIブロック」

AIの応答テキスト中に、特殊なフェンスドブロック（` ```interactive-ui `）でUI定義を埋め込む。通常のMarkdownテキストとUIブロックは共存でき、1つの応答に複数のUIブロックを含められる。

```markdown
旅行の計画をお手伝いします！まず、基本的な情報を教えてください。

​```interactive-ui
{
  "id": "travel-form-1",
  "type": "form",
  "title": "旅行プラン入力",
  "components": [
    {
      "type": "select",
      "id": "destination",
      "label": "行き先",
      "options": ["国内", "アジア", "ヨーロッパ", "北米", "その他"]
    },
    {
      "type": "date-range",
      "id": "dates",
      "label": "旅行期間"
    },
    {
      "type": "slider",
      "id": "budget",
      "label": "予算（万円）",
      "min": 5,
      "max": 100,
      "step": 5,
      "default": 20
    },
    {
      "type": "chips",
      "id": "interests",
      "label": "興味のあるジャンル",
      "multi": true,
      "options": ["グルメ", "観光", "自然", "ショッピング", "文化体験"]
    }
  ],
  "actions": [
    { "type": "submit", "label": "プランを提案して", "style": "primary" }
  ]
}
​```

上記のフォームに入力していただければ、最適なプランを提案します！
```

### ユーザー操作のフィードバック

ユーザーがUIコンポーネントを操作してsubmitすると、構造化データがユーザーメッセージとして自動送信される:

```json
{
  "role": "user",
  "content": "[interactive-ui-response]\n{\"ui_id\":\"travel-form-1\",\"action\":\"submit\",\"data\":{\"destination\":\"アジア\",\"dates\":{\"start\":\"2026-04-01\",\"end\":\"2026-04-07\"},\"budget\":30,\"interests\":[\"グルメ\",\"文化体験\"]}}",
  "metadata": {
    "interactive_ui_response": true
  }
}
```

AIはこのレスポンスを受けて、次の応答で新しいUIブロック（例: 提案されたプランの比較表）を返すことができる。

---

## 設計方針: デュアルレンダリングアーキテクチャ

2つのレンダリング方式を共存させる。用途に応じてAIが使い分ける。

### 4つのアプローチの比較

| アプローチ | AIの自由度 | 安全性 | 実装コスト | チャットとの統合感 |
|-----------|-----------|--------|-----------|------------------|
| A. 固定コンポーネント | 低（選ぶだけ） | 高 | 低 | 高 |
| **B. プリミティブ合成（採用）** | 高 | 高 | 中 | **高（ネイティブ）** |
| **C. サンドボックスHTML（採用）** | **最大** | **高（iframe隔離）** | 中 | 中（iframe内） |
| D. HTML直接注入 | 最大 | **危険（XSS）** | 低 | 高だが危険 |

### 方式1: プリミティブ合成（軽量・統合型）

チャットメッセージの中にネイティブに溶け込むUI。
`box`, `text`, `button` 等の原子部品をAIが組み合わせてUIを構築する。

**向いている場面:**
- ボタン選択肢、フォーム入力、進捗表示
- チャットの流れの中で自然に使うインタラクション
- 軽量で即座に描画したいもの

**特徴:**
- チャットUIと完全に一体化（同じフォント、色、テーマ）
- 描画が軽い（React コンポーネントそのもの）
- プリミティブの種類に制限される（ただし組み合わせで多くをカバー）

### 方式2: サンドボックスHTML（自由・隔離型）

AIがHTML/CSS/JSを直接記述し、サンドボックス化されたiframe内で実行する。
**Claude Artifacts / Vercel v0 と同じアプローチ。**

**向いている場面:**
- 五目並べ、チェスなどのゲーム（Canvas描画、複雑なロジック）
- データ可視化（Chart.js / D3.js等を使ったグラフ）
- アニメーション、物理シミュレーション
- プリミティブでは表現しきれない複雑なUI

**特徴:**
- AIの自由度が最大（HTML/CSS/JS何でも書ける）
- ブラウザのiframeサンドボックスで安全に隔離
- `postMessage` で親ウィンドウと通信
- AIはHTML/CSS/JSを書くのが元々得意（追加学習不要）

### なぜ両方採用するか

```
プリミティブ合成だけ → ゲームや可視化で表現力が足りない
サンドボックスHTMLだけ → 「ボタン3つ出すだけ」にiframeは大げさ

両方あれば → AIが場面に応じて最適な方を選べる
```

---

## 方式1: プリミティブ合成

### コンセプト

AIに「フォーム」「カンバン」等の完成品を渡すのではなく、
「箱」「テキスト」「ボタン」「グリッド」「入力欄」等の**原子部品（プリミティブ）** を渡し、
AIがそれを自由に組み合わせて任意のUIを構築する。

LEGOブロックのようなもの — 個々のブロックは単純だが、組み合わせで何でも作れる。

---

## UIプリミティブ仕様

### プリミティブ一覧

**レイアウト系**

| primitive | 説明 | 主要プロパティ |
|-----------|------|---------------|
| `box` | コンテナ（div相当） | `direction`, `gap`, `padding`, `align`, `bg`, `border`, `rounded`, `minWidth`, `maxWidth` |
| `grid` | グリッドレイアウト | `cols`, `rows`, `gap`, `cellWidth`, `cellHeight` |
| `scroll` | スクロール可能領域 | `maxHeight`, `direction` |
| `divider` | 区切り線 | `direction`, `color` |

**表示系**

| primitive | 説明 | 主要プロパティ |
|-----------|------|---------------|
| `text` | テキスト表示 | `content`, `size`, `weight`, `color`, `align`, `markdown` |
| `icon` | アイコン/絵文字 | `emoji`, `size` |
| `badge` | バッジ/ラベル | `content`, `color`, `bg` |
| `image` | 画像表示 | `url`, `alt`, `width`, `height`, `fit` |
| `progress-bar` | プログレスバー | `value`, `max`, `color`, `showLabel` |

**インタラクション系**

| primitive | 説明 | 主要プロパティ |
|-----------|------|---------------|
| `button` | ボタン | `label`, `actionId`, `variant`, `disabled`, `color` |
| `input` | テキスト入力 | `inputId`, `placeholder`, `value`, `multiline` |
| `select` | ドロップダウン | `inputId`, `options`, `value`, `placeholder` |
| `checkbox` | チェックボックス | `inputId`, `label`, `checked` |
| `slider` | スライダー | `inputId`, `min`, `max`, `step`, `value` |
| `chips` | タグ選択 | `inputId`, `options`, `selected`, `multi` |
| `clickable` | クリック可能領域 | `actionId`, `children`, `cursor`, `hoverBg` |

### UIブロック定義

```typescript
// AIが出力するUIブロック全体
interface InteractiveUIBlock {
  id: string;                      // ブロック一意ID
  mode?: 'default' | 'live';      // default=使い捨て, live=永続的
  title?: string;                  // ブロックタイトル
  state?: Record<string, any>;    // 動的状態（liveモード用）
  root: UINode;                    // UIツリーのルート
  actions?: UIAction[];           // submit/cancelボタン（defaultモード用）
}

// UIツリーのノード（再帰的）
interface UINode {
  primitive: string;               // プリミティブ名
  id?: string;                     // ノードID（イベント識別用）
  props?: Record<string, any>;    // プリミティブ固有のプロパティ
  children?: UINode[];            // 子ノード（レイアウト系の場合）

  // 条件付き表示（stateの値で表示/非表示を切り替え）
  showIf?: string;                // state内のキーパス e.g. "game.isOver"

  // stateバインディング（inputの値をstateに紐付け）
  bind?: string;                  // state内のキーパス e.g. "form.name"
}

interface UIAction {
  type: 'submit' | 'cancel' | 'custom';
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  actionId?: string;
}
```

### レンダリングエンジン

```typescript
// renderer/components/interactive-ui/UIRenderer.tsx

function UIRenderer({ node, state, onAction }: Props) {
  // showIf で条件分岐
  if (node.showIf && !resolveKeyPath(state, node.showIf)) {
    return null;
  }

  // プリミティブ→Reactコンポーネントの解決
  const Component = primitiveRegistry[node.primitive];
  if (!Component) {
    return <UnknownPrimitive name={node.primitive} />;  // フォールバック
  }

  // stateバインディングの解決
  const boundValue = node.bind ? resolveKeyPath(state, node.bind) : undefined;

  return (
    <Component
      {...node.props}
      value={boundValue}
      onChange={(v) => node.bind && updateState(node.bind, v)}
      onAction={(actionId, data) => onAction(node.id, actionId, data)}
    >
      {node.children?.map((child, i) => (
        <UIRenderer key={child.id || i} node={child} state={state} onAction={onAction} />
      ))}
    </Component>
  );
}
```

---

## 具体例: プリミティブで組み立てるUI

### 例1: 五目並べ（ライブUIモード）

AIが `grid` + `clickable` + `text` + `icon` を組み合わせて碁盤を構築:

```json
{
  "id": "gomoku",
  "mode": "live",
  "title": "五目並べ",
  "state": {
    "cells": {},
    "turn": "black",
    "status": "playing",
    "message": "あなたの番です（● 黒）",
    "moveCount": 0
  },
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 8, "align": "center" },
    "children": [
      {
        "primitive": "text",
        "props": { "content": "{state.message}", "size": "sm", "color": "muted" }
      },
      {
        "primitive": "grid",
        "props": {
          "cols": 15, "rows": 15,
          "cellWidth": 32, "cellHeight": 32,
          "bg": "#DEB887", "borderColor": "#000"
        },
        "children": [
          {
            "primitive": "clickable",
            "id": "cell",
            "props": {
              "actionId": "place_stone",
              "cursor": "pointer",
              "hoverBg": "rgba(0,0,0,0.1)"
            },
            "children": [
              {
                "primitive": "text",
                "props": {
                  "content": "{cellValue}",
                  "size": "lg", "align": "center"
                }
              }
            ]
          }
        ]
      },
      {
        "primitive": "text",
        "props": { "content": "手数: {state.moveCount}", "size": "xs", "color": "muted" }
      }
    ]
  }
}
```

### 例2: アンケートフォーム（通常モード）

AIが `box` + `input` + `select` + `slider` + `chips` + `button` を自由に配置:

```json
{
  "id": "survey",
  "title": "旅行プラン入力",
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 16, "padding": 16 },
    "children": [
      {
        "primitive": "select",
        "props": {
          "inputId": "destination",
          "placeholder": "行き先を選択",
          "options": ["国内", "アジア", "ヨーロッパ", "北米"]
        },
        "bind": "destination"
      },
      {
        "primitive": "box",
        "props": { "direction": "row", "gap": 12 },
        "children": [
          {
            "primitive": "input",
            "props": { "inputId": "start", "placeholder": "出発日 (YYYY-MM-DD)" },
            "bind": "startDate"
          },
          {
            "primitive": "input",
            "props": { "inputId": "end", "placeholder": "帰国日 (YYYY-MM-DD)" },
            "bind": "endDate"
          }
        ]
      },
      {
        "primitive": "box",
        "props": { "direction": "column", "gap": 4 },
        "children": [
          { "primitive": "text", "props": { "content": "予算（万円）", "size": "sm" } },
          {
            "primitive": "slider",
            "props": { "inputId": "budget", "min": 5, "max": 100, "step": 5 },
            "bind": "budget"
          }
        ]
      },
      {
        "primitive": "chips",
        "props": {
          "inputId": "interests",
          "options": ["グルメ", "観光", "自然", "ショッピング", "文化体験"],
          "multi": true
        },
        "bind": "interests"
      }
    ]
  },
  "actions": [
    { "type": "submit", "label": "プランを提案して", "variant": "primary" }
  ]
}
```

### 例3: AIがその場で発明するUI

AIは事前定義されていないUIでも、プリミティブを組み合わせてその場で発明できる:

**ユーザー: 「今週の食事を一緒に計画して」**

→ AIが `grid`(7列=曜日 x 3行=朝昼夜) + `clickable` + `text` + `badge` でカレンダー型の食事プランナーUIを構築。事前に「食事プランナー」コンポーネントを用意する必要はない。

**ユーザー: 「この文章を添削して」**

→ AIが `box` + `text`(原文と修正案を並列表示) + `button`(「採用」「却下」) でdiff風の添削UIを構築。

**ユーザー: 「部屋のレイアウトを考えて」**

→ AIが `grid` + `clickable` + `icon`(家具の絵文字) でドラッグ配置風の間取りUIを構築。

これが「事前定義コンポーネント方式」との最大の違い — **AIの想像力だけが限界**になる。

---

## 高レベルテンプレート（ショートカット）

プリミティブだけだとJSONが冗長になる場合があるため、よく使うパターンを**テンプレート**として提供する。
これは「事前定義コンポーネント」ではなく、プリミティブの展開マクロ。

```json
{
  "id": "quick-choice",
  "template": "button-group",
  "templateProps": {
    "question": "どの言語で実装しますか？",
    "options": ["TypeScript", "Python", "Rust", "Go"]
  }
}
```

↓ レンダラー内部でプリミティブツリーに展開される:

```json
{
  "primitive": "box",
  "props": { "direction": "column", "gap": 8 },
  "children": [
    { "primitive": "text", "props": { "content": "どの言語で実装しますか？" } },
    {
      "primitive": "box",
      "props": { "direction": "row", "gap": 8, "wrap": true },
      "children": [
        { "primitive": "button", "props": { "label": "TypeScript", "actionId": "select_0", "variant": "secondary" } },
        { "primitive": "button", "props": { "label": "Python", "actionId": "select_1", "variant": "secondary" } },
        { "primitive": "button", "props": { "label": "Rust", "actionId": "select_2", "variant": "secondary" } },
        { "primitive": "button", "props": { "label": "Go", "actionId": "select_3", "variant": "secondary" } }
      ]
    }
  ]
}
```

テンプレートは利便性のためのショートカットであり、AIはテンプレートを使わずプリミティブ直接記述も常に可能。

---

## UIプリミティブのスタイリング

### デザイントークン方式

AIがスタイルを指定する際、任意のCSSではなくデザイントークンを使う:

```typescript
// 許可されたトークン
const designTokens = {
  // サイズ
  size: ['xs', 'sm', 'md', 'lg', 'xl'],

  // 色（セマンティック）
  color: ['primary', 'secondary', 'success', 'warning', 'danger', 'muted',
          'text', 'text-inverse', 'bg', 'surface', 'border'],

  // 色（直接指定 — 制限付き）
  // #RRGGBB 形式のみ許可、rgba()やCSS関数は不可
  rawColor: /^#[0-9A-Fa-f]{6}$/,

  // スペーシング
  gap: [0, 2, 4, 8, 12, 16, 24, 32],
  padding: [0, 4, 8, 12, 16, 24],

  // ボーダー
  rounded: ['none', 'sm', 'md', 'lg', 'full'],
  border: ['none', 'thin', 'medium'],

  // フォント
  weight: ['normal', 'medium', 'bold'],
  align: ['left', 'center', 'right'],
};
```

AIは `"color": "primary"` や `"color": "#DEB887"` のように指定でき、
レンダラーがこれをTailwindクラスやCSS変数にマッピングする。
任意のCSS文字列や `style` 属性は受け付けない。

---

## 方式2: サンドボックスHTML

### コンセプト

AIがHTML/CSS/JavaScriptを直接記述し、**サンドボックス化されたiframe**内で実行する。
ブラウザのセキュリティモデルを利用して完全に隔離されるため、安全性を保ちながらAIに最大限の自由度を与える。

### フェンスドブロック記法

```markdown
五目並べをやりましょう！

​```interactive-html
{
  "id": "gomoku",
  "mode": "live",
  "title": "五目並べ",
  "width": "500px",
  "height": "540px"
}
---
<!DOCTYPE html>
<html>
<style>
  body { margin: 0; background: #DEB887; display: flex; flex-direction: column; align-items: center; font-family: sans-serif; }
  canvas { cursor: pointer; }
  .status { padding: 8px; color: #333; font-size: 14px; }
</style>
<body>
  <div class="status" id="status">あなたの番です（● 黒）</div>
  <canvas id="board" width="480" height="480"></canvas>
<script>
  const canvas = document.getElementById('board');
  const ctx = canvas.getContext('2d');
  const SIZE = 15, CELL = 32;
  const board = Array(SIZE).fill(null).map(() => Array(SIZE).fill(0));
  let gameOver = false;

  function drawBoard() {
    ctx.clearRect(0, 0, 480, 480);
    // グリッド描画
    ctx.strokeStyle = '#000';
    for (let i = 0; i < SIZE; i++) {
      ctx.beginPath();
      ctx.moveTo(16 + i * CELL, 16);
      ctx.lineTo(16 + i * CELL, 16 + 14 * CELL);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(16, 16 + i * CELL);
      ctx.lineTo(16 + 14 * CELL, 16 + i * CELL);
      ctx.stroke();
    }
    // 石描画
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (board[r][c] !== 0) {
          ctx.beginPath();
          ctx.arc(16 + c * CELL, 16 + r * CELL, 13, 0, Math.PI * 2);
          ctx.fillStyle = board[r][c] === 1 ? '#000' : '#fff';
          ctx.fill();
          ctx.stroke();
        }
      }
    }
  }

  canvas.addEventListener('click', (e) => {
    if (gameOver) return;
    const col = Math.round((e.offsetX - 16) / CELL);
    const row = Math.round((e.offsetY - 16) / CELL);
    if (row < 0 || row >= SIZE || col < 0 || col >= SIZE || board[row][col] !== 0) return;

    board[row][col] = 1; // 黒（ユーザー）
    drawBoard();

    // 親ウィンドウ（ArisChat）に操作を通知
    window.parent.postMessage({
      type: 'interactive-ui-action',
      uiId: 'gomoku',
      action: 'place_stone',
      data: { row, col, board: JSON.stringify(board) }
    }, '*');
  });

  // AIからの応答を受信
  window.addEventListener('message', (e) => {
    if (e.data.type === 'interactive-ui-update' && e.data.uiId === 'gomoku') {
      const { row, col, status, message } = e.data.patch;
      if (row !== undefined) {
        board[row][col] = 2; // 白（AI）
      }
      if (status === 'finished') gameOver = true;
      if (message) document.getElementById('status').textContent = message;
      drawBoard();
    }
  });

  drawBoard();
</script>
</body>
</html>
​```
```

### iframe サンドボックスの仕組み

```typescript
// renderer/components/interactive-ui/SandboxRenderer.tsx

function SandboxRenderer({ htmlContent, uiId, onAction }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // HTML を Blob URL に変換（ネットワークアクセスなし）
  const blobUrl = useMemo(() => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    return URL.createObjectURL(blob);
  }, [htmlContent]);

  // iframe からの postMessage を受信
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.data?.type === 'interactive-ui-action' && e.data.uiId === uiId) {
        onAction(uiId, e.data.action, e.data.data);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [uiId, onAction]);

  return (
    <iframe
      ref={iframeRef}
      src={blobUrl}
      sandbox="allow-scripts"
      // ↑ これが核心:
      //   allow-scripts   → JS実行は許可
      //   （以下は全て禁止）
      //   allow-same-origin  なし → 親のDOM/cookie/storageにアクセス不可
      //   allow-forms        なし → フォーム送信不可
      //   allow-popups       なし → 新しいウィンドウ/タブを開けない
      //   allow-top-navigation なし → 親ページをリダイレクトできない
      style={{
        width: '100%',
        height: props.height || '400px',
        border: '1px solid var(--aria-border)',
        borderRadius: '8px',
        background: '#fff',
      }}
    />
  );
}
```

### セキュリティモデル

```
┌─────────────────────────────────────────┐
│  ArisChat (親ウィンドウ)                 │
│                                          │
│  ┌───────────────────────────────────┐   │
│  │  iframe sandbox="allow-scripts"   │   │
│  │                                   │   │
│  │  ✅ JavaScript実行               │   │
│  │  ✅ Canvas / SVG 描画            │   │
│  │  ✅ CSS アニメーション            │   │
│  │  ✅ postMessage で親と通信        │   │
│  │                                   │   │
│  │  ❌ 親のDOMアクセス              │   │
│  │  ❌ Cookie / localStorage        │   │
│  │  ❌ fetch / XMLHttpRequest        │←─ Blob URLのため外部通信不可
│  │  ❌ window.open / リダイレクト    │   │
│  │  ❌ Electron API / Node.js       │   │
│  │  ❌ ファイルシステム             │   │
│  └───────────────────────────────────┘   │
│                                          │
│  通信: postMessage のみ（構造化データ）   │
└─────────────────────────────────────────┘
```

**なぜ安全か:**
1. **`sandbox="allow-scripts"`** — `allow-same-origin` を付けないことで、iframeは親ウィンドウと完全に隔離される
2. **Blob URL** — `blob:` プロトコルで読み込むため、外部ネットワークへのアクセスができない（`fetch` しても失敗する）
3. **Electron APIへの到達不能** — `contextBridge` は親ウィンドウにのみ公開されており、iframe内からはアクセスできない
4. **通信は postMessage のみ** — 親側でメッセージの `type` と `uiId` をバリデーションしてから処理

### AIから見たライブUI更新

サンドボックスHTML方式のライブUI更新も、プリミティブ方式と同じサイレントメッセージを使う。
違いは、AIの応答がiframe内のJSに `postMessage` で転送される点:

```
ユーザー操作
  → iframe内JS が postMessage で親に通知
  → 親(ChatWindow) がサイレントメッセージでAIに送信
  → AIが interactive-ui-update で応答
  → 親が iframe に postMessage で patch を転送
  → iframe内JS が patch を受けてUI更新
```

### プリミティブ合成 vs サンドボックスHTML: AIの使い分け基準

AIがシステムプロンプトの指示に基づいて自動的に使い分ける:

```
【プリミティブ合成を使う場面】 → ```interactive-ui
- 選択肢の提示（ボタン、チップス）
- フォーム入力（テキスト、スライダー、ドロップダウン）
- 簡単なカード比較
- 進捗表示
- チャットの流れの中で自然に挿入したいUI

【サンドボックスHTMLを使う場面】 → ```interactive-html
- ゲーム（Canvas描画が必要）
- グラフ・チャート（SVG / Canvas）
- アニメーション付きUI
- 複雑なドラッグ&ドロップ
- プリミティブでは表現できない独自のビジュアル
- 外部ライブラリ（Chart.js等）を使いたい場合
```

### 外部ライブラリの利用について

iframe内のHTMLはネットワークアクセスができないため、CDNからライブラリを読み込めない。

**解決策: バンドル済みライブラリの注入**

```typescript
// よく使うライブラリを事前にバンドルしておく
const BUNDLED_LIBS = {
  'chart.js': () => import('chart.js/dist/chart.umd.js?raw'),
  'three.js': () => import('three/build/three.min.js?raw'),
  'd3': () => import('d3/dist/d3.min.js?raw'),
};

function injectLibraries(html: string, requestedLibs: string[]): string {
  const scripts = requestedLibs
    .filter(lib => BUNDLED_LIBS[lib])
    .map(lib => `<script>${BUNDLED_LIBS[lib]()}</script>`)
    .join('\n');
  return html.replace('</head>', `${scripts}\n</head>`);
}
```

AIがUIブロックのメタデータで使いたいライブラリを宣言:

```json
{
  "id": "chart-demo",
  "mode": "default",
  "title": "売上グラフ",
  "libs": ["chart.js"],
  "width": "600px",
  "height": "400px"
}
---
<!DOCTYPE html>
...
```

バンドルに含まれていないライブラリをリクエストした場合は無視される（安全側に倒す）。

---

## アーキテクチャ設計

### レイヤー構成

```
┌─────────────────────────────────────────────────────┐
│                   AI Provider                        │
│     (Anthropic / LM Studio / OpenAI Compatible)      │
└──────────────────────┬──────────────────────────────┘
                       │ ストリーミング応答
                       │ （Markdown + ```interactive-ui ブロック）
                       ▼
┌─────────────────────────────────────────────────────┐
│              Main Process (claude.ts)                 │
│  ストリーミング処理は変更不要。テキストとして透過     │
└──────────────────────┬──────────────────────────────┘
                       │ IPC: chat:stream チャンク
                       ▼
┌─────────────────────────────────────────────────────┐
│           MessageBubble.tsx (描画パイプライン)        │
│                                                      │
│  1. parseThinkBlocks()        ← 既存                 │
│  2. parseInteractiveUI()      ← 【新規】             │
│     └─ ```interactive-ui ブロックを抽出              │
│     └─ JSON パース & バリデーション                  │
│  3. marked.parse() for 残りのMarkdown                │
│  4. 通常Markdown + <InteractiveUIRenderer/> を合成   │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│         InteractiveUIRenderer (新規コンポーネント)    │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  UIComponentRegistry                        │     │
│  │  type → React Component のマッピング         │     │
│  │  "button-group" → <ButtonGroup />           │     │
│  │  "slider" → <Slider />                      │     │
│  │  "form" → <Form />                          │     │
│  │  "cards" → <Cards />                        │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  JSON定義 → コンポーネントツリー動的構築             │
│  ユーザー操作 → onInteraction コールバック           │
└──────────────────────┬──────────────────────────────┘
                       │ onInteraction(uiId, action, data)
                       ▼
┌─────────────────────────────────────────────────────┐
│            ChatWindow.tsx (操作ハンドラ)              │
│                                                      │
│  handleInteractiveUIAction(uiId, action, data)       │
│    1. 構造化データをユーザーメッセージとして整形      │
│    2. メッセージ配列に追加                           │
│    3. AIに送信（通常のsendMessageフローを再利用）     │
└─────────────────────────────────────────────────────┘
```

### ストリーミング中のUIブロック処理

ストリーミング中に `interactive-ui` ブロックが途中まで届いている状態の処理が重要。

```
受信中のテキスト:
"旅行プランを提案します！\n\n```interactive-ui\n{\"id\":\"plan\",\"ty"
                                                              ↑ まだ途中

→ フェンスドブロックが閉じていない場合:
  - JSONパースを試みない
  - プレースホルダー（ローディングスピナー）を表示
  - ブロックが閉じたら（``` を検出）パース＆レンダリング
```

**実装方針:**

```typescript
function parseInteractiveUI(content: string): ParsedContent {
  const blocks: InteractiveUIBlock[] = [];
  const textParts: string[] = [];

  // 正規表現で ```interactive-ui ... ``` を検出
  const regex = /```interactive-ui\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // マッチ前のテキスト部分を保持
    textParts.push(content.slice(lastIndex, match.index));

    try {
      const parsed = JSON.parse(match[1]);
      blocks.push({ ...parsed, _index: textParts.length });
      textParts.push(null); // UIブロックのプレースホルダー
    } catch {
      // パース失敗 → Markdownとしてフォールバック表示
      textParts.push(match[0]);
    }
    lastIndex = regex.lastIndex;
  }

  // 未閉じブロックの検出
  const unclosed = content.slice(lastIndex);
  const hasUnclosedBlock = unclosed.includes('```interactive-ui');
  textParts.push(hasUnclosedBlock
    ? unclosed.replace(/```interactive-ui[\s\S]*$/, '')
    : unclosed);

  return { textParts, blocks, isLoading: hasUnclosedBlock };
}
```

---

## ライブUIモード（永続的インタラクション）

### 概要

通常のUIブロックは「submit → 新メッセージ → 新UI」の使い捨てフロー。
**ライブUIモード**は、同一のUIブロックをその場で書き換え続ける永続的なインタラクションパターン。

チャットメッセージは増えず、UIだけが変化する。五目並べ、チェス、タスクボードなど「状態が蓄積される対話」に最適。

### 通常モード vs ライブモード

```
【通常モード】                       【ライブモード】
 AI: UIブロック表示                    AI: UIブロック表示 (mode: "live")
 User: submitクリック                  User: セルをクリック
 → 新しいユーザーメッセージ追加        → メッセージ追加なし
 → AIが新しい応答を生成               → バックグラウンドでAIに送信
 → 新しいUIブロックが表示             → AIが同じUIのstateだけ返す
 → チャットが2メッセージ増える        → UIがその場で書き換わる
                                       → チャットに変化なし
```

### JSON定義

ライブUIは `"mode": "live"` を指定し、`state` オブジェクトで描画状態を保持する。

```markdown
五目並べをしましょう！先手（黒）でどうぞ。

​```interactive-ui
{
  "id": "gomoku-game",
  "type": "canvas-grid",
  "mode": "live",
  "title": "五目並べ",
  "config": {
    "rows": 15,
    "cols": 15,
    "cellSize": 32,
    "clickable": true
  },
  "state": {
    "board": [],
    "currentTurn": "black",
    "status": "playing",
    "message": "あなたの番です（黒）"
  },
  "render": {
    "empty": "",
    "black": "●",
    "white": "○"
  }
}
​```
```

### インタラクションフロー（五目並べの例）

```
1. AI応答でライブUIブロック表示（15x15空盤面）

2. ユーザーがセル(7,7)をクリック
   │
   ├─ UIにすぐ反映: board に {row:7, col:7, value:"black"} 追加（楽観的更新）
   │
   └─ バックグラウンドでAIに送信 ─────────────────────┐
      メッセージは非表示（チャットに出ない）            │
      payload:                                         │
      {                                                │
        "ui_id": "gomoku-game",                        │
        "action": "cell_click",                        │
        "data": { "row": 7, "col": 7 },               │
        "current_state": { "board": [...] }            │
      }                                                │
                                                       ▼
3. AIが応答（ライブUI更新専用の短縮形式）
   ─────────────────────────────────────────
   ​```interactive-ui-update
   {
     "id": "gomoku-game",
     "patch": {
       "board": [
         { "row": 7, "col": 7, "value": "black" },
         { "row": 7, "col": 8, "value": "white" }
       ],
       "currentTurn": "black",
       "message": "私は(7,8)に置きました。あなたの番です"
     }
   }
   ​```
   ─────────────────────────────────────────
   │
   ├─ UIが更新される（AIの手が追加）
   ├─ この応答はチャット履歴に表示されない
   └─ ユーザーが次のセルをクリック → 2. に戻る

4. ゲーム終了
   AIが patch で status: "finished" を返す
   → UIがゲーム結果を表示、クリック無効化
   → AIの応答が通常のチャットメッセージとして表示される:
     「おめでとうございます！黒の勝利です！素晴らしい一手でした。」
```

### 通信の仕組み: サイレントメッセージ

ライブUIの操作は「サイレントメッセージ」としてAIに送信される。通常のメッセージとの違い:

| | 通常メッセージ | サイレントメッセージ |
|---|---|---|
| チャットに表示 | される | **されない** |
| AI応答の表示 | チャットに表示 | **UIの更新のみ** |
| メッセージ履歴 | 永続保存 | セッション内のみ保持 |
| ストリーミング | テキスト描画 | JSON パース待ち |

**実装:**

```typescript
// ChatWindow.tsx に追加
async function handleLiveUIAction(uiId: string, action: string, data: any) {
  // 1. 楽観的更新（ユーザーの操作を即座にUIに反映）
  updateLiveUIState(uiId, optimisticPatch(action, data));

  // 2. サイレントメッセージとしてAIに送信
  const silentMessages = [
    ...buildContextMessages(),  // 会話の要約コンテキスト
    {
      role: 'user',
      content: JSON.stringify({
        _type: 'live_ui_action',
        ui_id: uiId,
        action,
        data,
        current_state: getLiveUIState(uiId)
      })
    }
  ];

  // 3. AIの応答を受信（通常のストリーミングだがチャットに出さない）
  const response = await sendSilentMessage(silentMessages);

  // 4. interactive-ui-update ブロックを抽出してUIに適用
  const patch = parseUIUpdate(response);
  if (patch) {
    updateLiveUIState(uiId, patch);
  }

  // 5. 通常テキスト部分があればチャットに表示
  //   （ゲーム終了時のコメントなど）
  const textContent = extractNonUIContent(response);
  if (textContent.trim()) {
    appendAssistantMessage(textContent);
  }
}
```

### コンテキスト管理（トークン節約）

ライブUIのやり取りは数十ターンになり得る。全履歴をAPIに送ると膨大なトークンを消費する。

**戦略: ローリングコンテキスト**

```typescript
function buildContextMessages(): Message[] {
  return [
    // 1. 元の会話コンテキスト（最初のAI応答まで）
    ...originalConversation,

    // 2. ライブUI用サマリ（現在のstate全体を1メッセージに集約）
    {
      role: 'system',
      content: `[Live UI State - ${uiId}]\n${JSON.stringify(currentState)}`
    },

    // 3. 直近N手の操作履歴（デフォルト: 最新6手）
    ...recentActions.slice(-6)
  ];
}
```

これにより:
- 五目並べ50手目でも、APIに送るのは「盤面全体 + 直近6手」のみ
- AIは盤面状態から次の手を判断できる
- トークン消費は手数に関わらずほぼ一定

### Main Process への影響

ライブUIモードでは、Main Process に **1つだけ変更が必要**:

```typescript
// index.ts - 新規IPCチャンネル追加
ipcMain.handle('chat:send-silent', async (event, messages, sessionId) => {
  // chat:send とほぼ同じだが:
  // - ストリーミングではなく完了を待って一括返却
  // - セッション履歴には保存しない
  const response = await claude.sendChat(messages, { stream: false });
  return response;
});
```

通常のストリーミングパイプラインは変更不要。サイレントメッセージは別チャンネルで処理する。

### ライブUI対応コンポーネント（Tier 1拡張 + Tier 2）

| type | 説明 | ライブUI用途 |
|------|------|-------------|
| `canvas-grid` | クリック可能なグリッド | 五目並べ、チェス、オセロ、マインスイーパー |
| `sortable-list` | ドラッグ並べ替えリスト | 優先度ソート、ランキング |
| `drawing-canvas` | 描画キャンバス | お絵かきしりとり、図解 |
| `counter-set` | 増減カウンター群 | リソース管理、スコア追跡 |
| `toggle-grid` | ON/OFF切り替えグリッド | パズル、ライツアウト |

### ライブUI状態のライフサイクル

```
  loading (ストリーミング中)
     │
     ▼
  live (操作可能・継続的)
     │
     ├──→ 操作 → AI応答 → 状態更新 → live のまま (ループ)
     │
     ├──→ finished (AIがstatus:"finished"を返した)
     │      └─ 結果表示、操作不可に
     │
     ├──→ paused (ユーザーが一時停止 or セッション再開)
     │      └─ state は保持、再開可能
     │
     └──→ expired (セッション切替時)
```

### 五目並べ完全例

**AIの初回応答:**

```markdown
五目並べをやりましょう！15x15の盤面です。あなたは黒（先手）です。
盤面の好きな場所をクリックして石を置いてください。

​```interactive-ui
{
  "id": "gomoku",
  "type": "canvas-grid",
  "mode": "live",
  "title": "五目並べ",
  "config": {
    "rows": 15, "cols": 15, "cellSize": 32,
    "showCoords": true,
    "clickable": true,
    "backgroundColor": "#DEB887",
    "gridColor": "#000000"
  },
  "state": {
    "cells": {},
    "currentTurn": "black",
    "status": "playing",
    "message": "あなたの番です（● 黒）",
    "moveCount": 0
  },
  "render": {
    "cellTypes": {
      "black": { "symbol": "●", "color": "#000000" },
      "white": { "symbol": "○", "color": "#FFFFFF", "stroke": "#000000" }
    }
  }
}
​```
```

**ユーザーが(7,7)をクリック → AIの応答（サイレント）:**

```
​```interactive-ui-update
{
  "id": "gomoku",
  "patch": {
    "cells": { "7,7": "black", "8,8": "white" },
    "currentTurn": "black",
    "moveCount": 2,
    "message": "なるほど天元ですね。私は(8,8)に。あなたの番です"
  }
}
​```
```

**ゲーム終了時のAI応答（通常表示に戻る）:**

```
​```interactive-ui-update
{
  "id": "gomoku",
  "patch": {
    "cells": { "7,3": "black" },
    "status": "finished",
    "winner": "black",
    "winningLine": [[7,3],[7,4],[7,5],[7,6],[7,7]],
    "message": "黒の勝利！"
  }
}
​```

見事です！(7,3)から(7,7)への横一列で五目達成ですね。
中盤の(5,5)が効いていました。もう一局いかがですか？
```

---

## 状態管理設計

### UIブロックの状態ライフサイクル

```
  loading (ストリーミング中)
     │
     ▼
  active (操作可能)
     │
     ├──→ submitted (送信済み) ← 通常の終了状態
     │      └─ 入力値をサマリ表示、操作不可に
     │
     └──→ expired (期限切れ) ← 新しいUIブロックで置換された場合
```

### 状態の永続化

```typescript
// ChatMessage型の拡張
interface ChatMessage {
  // ... 既存フィールド
  interactiveUI?: {
    blocks: InteractiveUIBlock[];
    state: Record<string, 'active' | 'submitted' | 'expired'>;
    submittedData?: Record<string, any>;  // 送信済みデータの保存
  };
}
```

**永続化ルール:**
- セッション保存時、UIブロック定義と状態も保存
- セッション再開時、`submitted` / `expired` のUIブロックは読み取り専用で表示
- `active` なUIブロックはセッション再開時に `expired` に変更（古い会話のUIを操作させない）

---

## AIへの指示方法

### システムプロンプトへの追加

AIがInteractive UIを使えるようにするため、システムプロンプトに機能説明を付加する。これはペルソナのシステムプロンプトとは別に、設定でON/OFFできる形にする。

```
## Interactive UI

あなたはチャットメッセージ内にインタラクティブなUIコンポーネントを埋め込むことができます。
ユーザーとの対話をより効率的にするために、適切な場面でUIコンポーネントを活用してください。

### 使用方法
```interactive-ui のフェンスドブロック内にJSON定義を記述します。

### 利用可能なコンポーネント
- button-group: 選択肢を提示する場合
- form: 複数の情報を一度に収集する場合
- cards: 選択肢を視覚的に比較提示する場合
- slider: 数値の範囲指定
- chips: 複数タグ選択
- progress: 進捗表示

### ガイドライン
- 単純なyes/noの質問にはUIを使わず通常のテキストで十分です
- 3つ以上の選択肢がある場合はbutton-groupやcardsの活用を検討してください
- フォームは5フィールド以下に抑えてください
- UIブロックの前後に説明テキストを添えてください
```

---

## ファイル構成（新規・変更）

```
src/
├── renderer/
│   ├── components/
│   │   ├── MessageBubble.tsx            # 変更: parseInteractiveUI追加
│   │   ├── ChatWindow.tsx               # 変更: UIアクションハンドラ追加
│   │   └── interactive-ui/              # 【新規ディレクトリ】
│   │       ├── UIRenderer.tsx           # 再帰レンダリングエンジン
│   │       ├── types.ts                 # InteractiveUIBlock, UINode型定義
│   │       ├── parser.ts               # parseInteractiveUI() / parseUIUpdate()
│   │       ├── state-manager.ts         # ライブUI状態管理
│   │       ├── template-expander.ts     # テンプレート→プリミティブ展開
│   │       ├── design-tokens.ts         # デザイントークン定義・バリデーション
│   │       ├── primitives/              # プリミティブコンポーネント群
│   │       │   ├── index.ts             # primitiveRegistry マッピング
│   │       │   ├── Box.tsx              # レイアウトコンテナ
│   │       │   ├── Grid.tsx             # グリッドレイアウト
│   │       │   ├── Scroll.tsx           # スクロール領域
│   │       │   ├── Text.tsx             # テキスト表示
│   │       │   ├── Icon.tsx             # アイコン/絵文字
│   │       │   ├── Badge.tsx            # バッジ/ラベル
│   │       │   ├── Image.tsx            # 画像表示
│   │       │   ├── ProgressBar.tsx      # プログレスバー
│   │       │   ├── Button.tsx           # ボタン
│   │       │   ├── Input.tsx            # テキスト入力
│   │       │   ├── Select.tsx           # ドロップダウン
│   │       │   ├── Checkbox.tsx         # チェックボックス
│   │       │   ├── Slider.tsx           # スライダー
│   │       │   ├── Chips.tsx            # タグ選択
│   │       │   ├── Clickable.tsx        # クリック可能領域
│   │       │   └── Divider.tsx          # 区切り線
│   │       ├── templates/               # 高レベルテンプレート
│   │       │   ├── index.ts             # テンプレートレジストリ
│   │       │   ├── button-group.ts      # ボタン選択肢
│   │       │   ├── form.ts              # フォーム
│   │       │   └── cards.ts             # カード一覧
│   │       └── styles.css               # プリミティブ用スタイル
│   └── styles/
│       └── globals.css                  # 変更: デザイントークンCSS変数追加
├── shared/
│   └── types.ts                         # 変更: ChatMessage拡張
├── main/
│   └── index.ts                         # 変更: chat:send-silent IPC追加
```

---

## セキュリティ考慮事項

### 入力バリデーション

AIが生成するJSONは信頼できない入力として扱う:

1. **JSONスキーマバリデーション**: パース後にスキーマチェック。未知の `type` はフォールバック表示
2. **プロパティのサニタイズ**: `style` プロパティに任意のCSSを許可しない。ホワイトリスト方式
3. **コンポーネント数制限**: 1ブロックあたり最大20コンポーネント
4. **ネスト深度制限**: 最大3レベル
5. **文字列長制限**: label/optionなどのテキストフィールドに上限

### XSS防止

- UIコンポーネントはReactコンポーネントとして描画（`dangerouslySetInnerHTML`を使わない）
- ラベルやテキストはReactのテキストノードとして挿入（自動エスケープ）
- `onclick` や `href` などの危険なプロパティはJSON定義で受け付けない

---

## 実装フェーズ

### Phase 1: レンダリング基盤 + 最小プリミティブ
1. `parseInteractiveUI()` パーサー実装
2. `UIRenderer` 再帰レンダリングエンジン
3. レイアウト系プリミティブ: `box`, `grid`, `divider`
4. 表示系プリミティブ: `text`, `icon`, `badge`
5. インタラクション系: `button`, `clickable`
6. ChatWindow へのアクションハンドラ統合
7. システムプロンプト追加（設定でON/OFF）
8. デザイントークン・バリデーション

**これだけで「AIがプリミティブを組み合わせてUIを構築 → ユーザーが操作」のフローが動く。**

### Phase 2: 入力系プリミティブ + テンプレート
9. `input`, `select`, `slider`, `chips`, `checkbox` 実装
10. `state` バインディング（bind）機能
11. submit/cancel アクション
12. テンプレートエキスパンダー（`button-group`, `form` 等のショートカット）

### Phase 3: ライブUIモード
13. サイレントメッセージIPC (`chat:send-silent`) 追加
14. `handleLiveUIAction` + 楽観的更新ロジック
15. `interactive-ui-update` パーサー
16. ローリングコンテキスト（トークン節約）
17. ライブUI状態の永続化（セッション保存）

**これで五目並べなど「同一UIを使い回すインタラクション」が動く。**

### Phase 4: 拡張プリミティブ + 磨き込み
18. `image`, `progress-bar`, `scroll` 実装
19. `showIf` 条件付き表示
20. AIへのプロンプト最適化（生成品質向上）
21. テンプレートの拡充

---

## 設計判断の根拠

### なぜフェンスドブロック方式か（代替案との比較）

| 方式 | メリット | デメリット |
|------|---------|-----------|
| **`interactive-ui` フェンスドブロック（採用）** | Markdownと自然に共存、AI が理解しやすい、既存パーサーと競合しない | AI がJSONを正確に生成する必要あり |
| ツールコール方式（MCP経由） | 既存MCP基盤を再利用可能 | レスポンス内にインラインで埋め込めない、表示とアクションが分離 |
| カスタムHTML方式 | 表現力が高い | XSSリスク大、AIが複雑なHTMLを正確に生成しにくい |
| 専用タグ方式（`<ui:form>`） | XMLライクで構造的 | Markdownパーサーと競合する可能性、think blockと混同リスク |

### なぜJSON定義か（代替案との比較）

| 方式 | メリット | デメリット |
|------|---------|-----------|
| **JSON（採用）** | パースが確実、型定義と相性良好、AIが比較的正確に生成 | 冗長になりがち |
| YAML | 人間が読みやすい | インデントミスでパース失敗しやすい |
| カスタムDSL | 簡潔に書ける | パーサー実装コスト大、AIが学習しにくい |

### Main Process の変更が不要な理由

ストリーミングチャンクはテキストとしてそのまま転送されるため、Main Process（claude.ts / index.ts）は `interactive-ui` ブロックの存在を知る必要がない。パースと描画はすべてRenderer Process（React側）で完結する。これにより:

- 既存のストリーミングパイプラインに影響を与えない
- LM Studio / Anthropic どちらのプロバイダでも動作する
- バックエンドとフロントエンドの関心が分離される

---

## 具体的なユースケース例

### 1. クイズ・学習

```json
{
  "id": "quiz-1",
  "type": "button-group",
  "title": "JavaScript クイズ #3",
  "description": "次のコードの出力は何ですか？\n`console.log(typeof null)`",
  "options": [
    { "label": "\"null\"", "value": "null" },
    { "label": "\"undefined\"", "value": "undefined" },
    { "label": "\"object\"", "value": "object" },
    { "label": "\"boolean\"", "value": "boolean" }
  ],
  "style": { "variant": "outlined" }
}
```

### 2. コードレビューフィードバック

```json
{
  "id": "review-1",
  "type": "cards",
  "title": "修正提案",
  "cards": [
    {
      "id": "fix-a",
      "title": "案A: Early Return パターン",
      "description": "ネストを減らしてガード節で処理",
      "badge": "推奨",
      "actions": [{ "type": "submit", "label": "この案を採用" }]
    },
    {
      "id": "fix-b",
      "title": "案B: Optional Chaining",
      "description": "?.演算子でnullチェックを簡潔に",
      "actions": [{ "type": "submit", "label": "この案を採用" }]
    }
  ]
}
```

### 3. 設定ウィザード

```json
{
  "id": "setup-wizard",
  "type": "form",
  "title": "プロジェクト初期設定",
  "components": [
    { "type": "text-input", "id": "name", "label": "プロジェクト名", "required": true },
    { "type": "select", "id": "framework", "label": "フレームワーク",
      "options": ["React", "Vue", "Svelte", "None"] },
    { "type": "chips", "id": "features", "label": "追加機能", "multi": true,
      "options": ["TypeScript", "ESLint", "Prettier", "Vitest", "Tailwind"] },
    { "type": "select", "id": "pkg", "label": "パッケージマネージャ",
      "options": ["npm", "yarn", "pnpm", "bun"] }
  ],
  "actions": [
    { "type": "submit", "label": "セットアップ開始", "style": "primary" }
  ]
}
```

### 4. 進捗トラッカー（操作なし・表示のみ）

```json
{
  "id": "migration-progress",
  "type": "progress",
  "title": "マイグレーション進捗",
  "steps": [
    { "label": "スキーマ解析", "status": "completed" },
    { "label": "型定義生成", "status": "completed" },
    { "label": "テスト更新", "status": "in-progress" },
    { "label": "ドキュメント更新", "status": "pending" }
  ],
  "percentage": 62
}
```
