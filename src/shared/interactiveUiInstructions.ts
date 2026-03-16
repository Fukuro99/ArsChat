/** 【1】interactive-ui: ユーザー側フォーム・選択肢 */
export const INSTRUCTION_INTERACTIVE_UI = `
## 【1】interactive-ui（ユーザー側フォーム・選択肢）

ユーザーのチャット欄（右側）に表示。操作結果はサイレントにAIへ送信されます。

\`\`\`interactive-ui
{
  "id": "ユニークなID",
  "title": "タイトル（省略可）",
  "root": { ...UIノードツリー },
  "actions": [ ...submitボタン等 ]
}
\`\`\`

**利用可能プリミティブ:**
- レイアウト: \`box\`(direction/gap/padding/align/bg/rounded), \`grid\`(cols/rows/cellWidth/cellHeight), \`scroll\`, \`divider\`
- 表示: \`text\`(content/size/weight/color), \`icon\`(emoji/size), \`badge\`(content/color/bg), \`progress-bar\`(value/max/color/showLabel, bindでstate参照可), \`image\`(src/alt/width/height/rounded/fit, src=data:またはblob:のみ)
- 入力: \`button\`(label/actionId/variant), \`input\`(inputId/placeholder/multiline), \`select\`(inputId/options), \`checkbox\`(inputId/label), \`slider\`(inputId/min/max/step), \`chips\`(inputId/options/multi), \`clickable\`(actionId)

**ノード構造:**
\`\`\`json
{ "primitive": "名前", "props": { ... }, "bind": "stateキー（入力系のみ）", "children": [ ... ] }
\`\`\`

**actions submit:**
\`\`\`json
"actions": [{ "type": "submit", "label": "送信", "variant": "primary" }]
\`\`\`

**デザイントークン（colorプロパティ）:** アプリはダークテーマ。
- セマンティック: "primary" / "secondary" / "success" / "warning" / "danger" / "muted" / "text" / "text-inverse" / "bg" / "surface" / "border"
- 高コントラスト: "black"（濃紺）/ "white"（オフホワイト）/ "dark"（ダークスレート）/ "light"（ライトスレート）
- カスタム: "#RRGGBB"
- ゲームUI推奨: 黒駒="black"/テキスト"white", 白駒="white"/テキスト"black", 空マス="surface", ハイライト="primary"

**ガイドライン:** 単純なyes/noは通常テキストで。3択以上や複数入力でUIを活用。UIブロックの前後に説明テキストを添える。

### ライブUIモード（mode: "live"）

継続的なインタラクション（ゲーム・タスクボード等）に使用。操作はAIに直接送信され、AIは \`\`\`interactive-ui-update で状態のみ返す:

\`\`\`interactive-ui-update
{ "id": "ブロックID", "patch": { "stateキー": "値" } }
\`\`\`

- patch に "status": "finished" でUI終了
- ライブUIには actions を含めない
- 操作は \`{"_type":"live_ui_action","ui_id":"...","action":"...","data":{...}}\` 形式で届く

### ローカルアクション（local: true）

AIに送信せずstateだけ更新したい要素には \`"local": true\` を指定。button は \`value\` プロパティ、clickable は \`stateValue\` プロパティで設定値を指定。bindでstateキーを紐付け。AIには currentState に含まれた状態で届く。`;

/** 【2】iframeタグ: AI側HTML表示（表示専用） */
export const INSTRUCTION_IFRAME = `
## 【2】\`<iframe>\`タグ（AI側HTML表示）

グラフ・図解・アニメーションなど**表示専用HTML**をAIのメッセージ欄（左側）に埋め込む。

\`<iframe width="500px" height="300px" title="タイトル（省略可）">\`
\`<!DOCTYPE html><html>...</html>\`
\`</iframe>\`

- 外部ネットワーク不可（CDN等は動作しない）
- width/height/title省略時: 幅100%・高さ400px
- ユーザー操作をAIに通知したい場合は interactive-html を使うこと`;

/** 【3】interactive-html: ユーザー側サンドボックス（liveモード） */
export const INSTRUCTION_INTERACTIVE_HTML = `
## 【3】interactive-html（ユーザー側サンドボックス・liveモード）

ゲーム・Canvas描画など**操作をAIに通知する複雑なHTML**に使用。ユーザーのチャット欄（右側）に表示。

\`\`\`interactive-html
{"id": "YOUR_ID", "mode": "live", "title": "タイトル", "width": "500px", "height": "400px"}
---
<!DOCTYPE html><html>
<body>
  <!-- UIコンテンツ -->
  <script>
    // 親への通知:
    window.parent.postMessage({ type: 'interactive-ui-action', uiId: 'YOUR_ID', action: 'ACTION', data: {...} }, '*');
    // 親からの更新受信:
    window.addEventListener('message', e => { if (e.data.type === 'interactive-ui-update') { /* e.data.patch を適用 */ } });
  </script>
</body></html>
\`\`\`

- 最初はJSON（id必須）、次行 \`---\`、その後HTML
- 外部CDN不可（ネットワーク切断環境）
- live モードで patch に "status": "finished" を含めると終了`;

