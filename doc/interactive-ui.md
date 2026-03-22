**[English](en/interactive-ui.md) | 日本語**

# Interactive UI

Interactive UI は AI がチャットメッセージの中に動的な UI コンポーネントを埋め込める機能です。
フォーム、ボタン、スライダー、ゲームなど、AI が JSON で UI を定義して表示します。

---

## 目次

- [概要](#概要)
- [レンダリング方式](#レンダリング方式)
- [UIブロックの形式](#uiブロックの形式)
- [プリミティブ一覧](#プリミティブ一覧)
- [通常モードとライブモード](#通常モードとライブモード)
- [サンドボックスHTML](#サンドボックスhtml)
- [使用例](#使用例)

---

## 概要

AI のレスポンスに ` ```interactive-ui ` フェンスブロックを含めることで UI が表示されます。

```
ユーザー: 旅行プランを提案するフォームを出して

AI: もちろんです！以下のフォームに入力してください。

​```interactive-ui
{ ... UIの JSON定義 ... }
​```
```

ユーザーがフォームに入力して送信すると、構造化データがユーザーメッセージとして自動送信され、
AI が次の応答でその内容に基づいたレスポンスを返します。

---

## レンダリング方式

2つの方式を使い分けます。

### 方式1: プリミティブ合成（軽量・統合型）

チャット UI に溶け込む軽量な UI。`box`、`button`、`input` などの原子部品（プリミティブ）を
JSON で組み合わせて任意の UI を構築します。

**適している用途:**
- フォーム入力、選択肢の提示
- 進捗表示、カード一覧
- チャットの流れに自然に組み込むインタラクション

### 方式2: サンドボックス HTML（自由・隔離型）

AI が HTML/CSS/JavaScript を直接記述し、サンドボックス化された iframe 内で実行します。
Claude Artifacts と同様のアプローチです。

**適している用途:**
- ゲーム（Canvas 描画、複雑なロジック）
- データ可視化（Chart.js / D3.js 等）
- アニメーション、シミュレーション

---

## UIブロックの形式

### 基本構造

```json
{
  "id": "unique-block-id",
  "mode": "default",
  "title": "タイトル（省略可）",
  "root": { ... UIツリー ... },
  "actions": [
    { "type": "submit", "label": "送信", "variant": "primary" }
  ]
}
```

### フィールド定義

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ✓ | ブロックの一意 ID |
| `mode` | string | — | `"default"`（使い捨て）または `"live"`（永続的） |
| `title` | string | — | ブロックのタイトル |
| `state` | object | — | 動的状態（live モード用） |
| `root` | UINode | ✓ | UI ツリーのルートノード |
| `actions` | UIAction[] | — | フォーム送信・キャンセルボタン |

### UINode の構造

```json
{
  "primitive": "box",
  "id": "optional-id",
  "props": { "direction": "column", "gap": 16 },
  "children": [ ... 子ノード ... ],
  "bind": "state.fieldName",
  "showIf": "state.isVisible"
}
```

| フィールド | 説明 |
|---|---|
| `primitive` | プリミティブ名（後述の一覧を参照） |
| `id` | ノードの識別子（イベント識別に使用） |
| `props` | プリミティブ固有のプロパティ |
| `children` | 子ノード（レイアウト系プリミティブで使用） |
| `bind` | state のキーパスにデータをバインド（例: `"form.name"`） |
| `showIf` | state のキーパスが truthy の場合のみ表示（例: `"ui.showDetail"`） |

---

## プリミティブ一覧

### レイアウト系

#### `box`

汎用コンテナ（div 相当）。子要素を水平・垂直方向に並べます。

```json
{
  "primitive": "box",
  "props": {
    "direction": "column",
    "gap": 16,
    "padding": 16,
    "align": "center",
    "bg": "#1e1e2e",
    "border": true,
    "rounded": true,
    "minWidth": 200,
    "maxWidth": 400
  }
}
```

| プロパティ | 型 | 説明 |
|---|---|---|
| `direction` | `"row"` / `"column"` | 子要素の並び方向 |
| `gap` | number | 子要素間のスペース（px） |
| `padding` | number | 内側の余白（px） |
| `align` | string | 子要素の配置（`"start"` / `"center"` / `"end"`） |
| `bg` | string | 背景色 |
| `border` | boolean | 枠線を表示するか |
| `rounded` | boolean | 角を丸めるか |
| `minWidth` / `maxWidth` | number | 幅の制限（px） |

---

#### `grid`

グリッドレイアウト。ゲーム盤や画像一覧に使います。

```json
{
  "primitive": "grid",
  "props": {
    "cols": 3,
    "gap": 8,
    "cellWidth": 100,
    "cellHeight": 100
  }
}
```

---

#### `scroll`

スクロール可能な領域。

```json
{
  "primitive": "scroll",
  "props": { "maxHeight": 300, "direction": "vertical" }
}
```

---

#### `divider`

区切り線。

```json
{ "primitive": "divider", "props": { "direction": "horizontal" } }
```

---

### 表示系

#### `text`

テキスト表示。Markdown もレンダリングできます。

```json
{
  "primitive": "text",
  "props": {
    "content": "**Hello** World",
    "size": "lg",
    "weight": "bold",
    "color": "#cdd6f4",
    "align": "center",
    "markdown": true
  }
}
```

| プロパティ | 値 | 説明 |
|---|---|---|
| `size` | `"xs"` / `"sm"` / `"md"` / `"lg"` / `"xl"` | フォントサイズ |
| `weight` | `"normal"` / `"bold"` | 太さ |
| `color` | string | テキスト色 |
| `markdown` | boolean | Markdown をレンダリングするか |

---

#### `icon`

絵文字アイコン。

```json
{ "primitive": "icon", "props": { "emoji": "🎯", "size": 32 } }
```

---

#### `badge`

バッジ・ラベル。

```json
{
  "primitive": "badge",
  "props": { "content": "NEW", "color": "#fff", "bg": "#7c3aed" }
}
```

---

#### `image`

画像表示。

```json
{
  "primitive": "image",
  "props": { "url": "https://...", "alt": "説明", "width": 200, "fit": "cover" }
}
```

---

#### `progress-bar`

プログレスバー。

```json
{
  "primitive": "progress-bar",
  "props": { "value": 75, "max": 100, "color": "#7c3aed", "showLabel": true }
}
```

---

### インタラクション系

#### `button`

ボタン。クリックするとアクション ID が AI に送信されます。

```json
{
  "primitive": "button",
  "props": {
    "label": "実行",
    "actionId": "run",
    "variant": "primary",
    "disabled": false
  }
}
```

| `variant` | 説明 |
|---|---|
| `"primary"` | 主要アクション（紫・強調） |
| `"secondary"` | 補助アクション（グレー） |
| `"danger"` | 破壊的アクション（赤） |

---

#### `input`

テキスト入力欄。

```json
{
  "primitive": "input",
  "props": { "placeholder": "名前を入力...", "multiline": false },
  "bind": "form.name"
}
```

---

#### `select`

ドロップダウン選択。

```json
{
  "primitive": "select",
  "props": {
    "placeholder": "選択してください",
    "options": ["選択肢A", "選択肢B", "選択肢C"]
  },
  "bind": "form.choice"
}
```

---

#### `checkbox`

チェックボックス。

```json
{
  "primitive": "checkbox",
  "props": { "label": "同意する" },
  "bind": "form.agreed"
}
```

---

#### `slider`

スライダー。

```json
{
  "primitive": "slider",
  "props": { "min": 0, "max": 100, "step": 5 },
  "bind": "form.budget"
}
```

---

#### `chips`

タグ選択。複数選択（`multi: true`）も可能。

```json
{
  "primitive": "chips",
  "props": {
    "options": ["グルメ", "観光", "自然", "ショッピング"],
    "multi": true
  },
  "bind": "form.interests"
}
```

---

#### `clickable`

クリック可能な任意の領域。子ノードをラップします。

```json
{
  "primitive": "clickable",
  "props": { "actionId": "select_item", "cursor": "pointer", "hoverBg": "rgba(255,255,255,0.1)" },
  "children": [ ... ]
}
```

---

## 通常モードとライブモード

### 通常モード（`mode: "default"`）

ユーザーが送信ボタンを押すと入力内容がユーザーメッセージとして送信されます。
送信後、UI は「送信済み」状態になり操作不可になります。

一般的なフォームやアンケートに使います。

### ライブモード（`mode: "live"`）

ユーザーの操作がリアルタイムで AI に送信され、AI が state を更新して UI を再描画します。
チャット履歴には残らず、サイレントな IPC で通信します。

ゲーム、インタラクティブなツール、リアルタイムな可視化に使います。

```json
{
  "id": "counter",
  "mode": "live",
  "state": { "count": 0 },
  "root": {
    "primitive": "box",
    "props": { "direction": "row", "gap": 16, "align": "center" },
    "children": [
      { "primitive": "button", "props": { "label": "-", "actionId": "decrement" } },
      { "primitive": "text", "props": { "content": "{state.count}" } },
      { "primitive": "button", "props": { "label": "+", "actionId": "increment" } }
    ]
  }
}
```

---

## サンドボックス HTML

プリミティブでは表現しにくい複雑な UI は、HTML/CSS/JavaScript を直接書けます。

````markdown
​```interactive-ui
{
  "id": "chart-1",
  "type": "sandbox",
  "html": "<!DOCTYPE html><html>...</html>"
}
​```
````

- iframe 内で安全に隔離されて実行されます
- `postMessage` で親ウィンドウ（ArsChat）と通信できます
- Canvas、WebGL、外部ライブラリ（CDN 経由）が使えます

---

## 使用例

### アンケートフォーム

```json
{
  "id": "survey-1",
  "title": "旅行プラン入力",
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 16, "padding": 16 },
    "children": [
      {
        "primitive": "select",
        "props": { "placeholder": "行き先を選択", "options": ["国内", "アジア", "ヨーロッパ", "北米"] },
        "bind": "destination"
      },
      {
        "primitive": "slider",
        "props": { "min": 5, "max": 100, "step": 5 },
        "bind": "budget"
      },
      {
        "primitive": "chips",
        "props": { "options": ["グルメ", "観光", "自然", "ショッピング"], "multi": true },
        "bind": "interests"
      }
    ]
  },
  "actions": [
    { "type": "submit", "label": "プランを提案して", "variant": "primary" }
  ]
}
```

### 選択肢の提示

```json
{
  "id": "choice-1",
  "root": {
    "primitive": "box",
    "props": { "direction": "column", "gap": 8 },
    "children": [
      { "primitive": "text", "props": { "content": "どちらのアプローチを使いますか？", "weight": "bold" } },
      { "primitive": "button", "props": { "label": "A: REST API", "actionId": "choose_rest", "variant": "secondary" } },
      { "primitive": "button", "props": { "label": "B: GraphQL", "actionId": "choose_graphql", "variant": "secondary" } }
    ]
  }
}
```
