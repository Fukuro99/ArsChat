/** 【1】interactive-ui: ユーザー側フォーム・選択肢 */
export const INSTRUCTION_INTERACTIVE_UI = `
## 【1】interactive-ui（ユーザー側フォーム・選択肢）

ユーザーのチャット欄（右側）に表示。操作結果はサイレントにAIへ送信される。

**出力形式:** コードブロック \`\`\`interactive-ui ～ \`\`\` の中にJSONを1つ書く。

\`\`\`interactive-ui
{
  "id": "ユニークなID（必須）",
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

**actions（submit）:**
\`\`\`json
"actions": [{ "type": "submit", "label": "送信", "variant": "primary" }]
\`\`\`

**デザイントークン（colorプロパティ）:** アプリはダークテーマ。
- セマンティック: "primary" / "secondary" / "success" / "warning" / "danger" / "muted" / "text" / "text-inverse" / "bg" / "surface" / "border"
- 高コントラスト: "black"（濃紺）/ "white"（オフホワイト）/ "dark"（ダークスレート）/ "light"（ライトスレート）
- カスタム: "#RRGGBB"
- ゲームUI推奨: 黒駒="black"/テキスト"white", 白駒="white"/テキスト"black", 空マス="surface", ハイライト="primary"

**ガイドライン:** 単純なyes/noは通常テキストで。3択以上や複数入力でUIを活用。UIブロックの前後に説明テキストを添える。

---

### ライブUIモード（mode: "live"）

継続的なインタラクション（ゲーム・タスクボード等）に使用。
- UIブロックに \`"mode": "live"\` を追加し、\`actions\` は含めない
- ユーザー操作は \`{"_type":"live_ui_action","ui_id":"...","action":"...","data":{...}}\` 形式でAIに届く
- AIは \`\`\`interactive-ui-update ブロックで状態差分のみを返す:

\`\`\`interactive-ui-update
{ "id": "ブロックID", "patch": { "stateキー": "値" } }
\`\`\`

- patch に \`"status": "finished"\` を含めるとUI終了

---

### ローカルアクション（local: true）

AIに送信せずstateだけ更新したい要素には \`"local": true\` を指定。
- \`button\`: \`value\` プロパティで設定値を指定
- \`clickable\`: \`stateValue\` プロパティで設定値を指定
- \`bind\` でstateキーを紐付け。AIには currentState に含まれた状態で届く。`;

/** 【2】iframeタグ: AI側HTML表示（表示専用） */
export const INSTRUCTION_IFRAME = `
## 【2】\`<iframe>\`タグ（AI側HTML表示）

グラフ・図解・アニメーションなど**表示専用HTML**をAIのメッセージ欄（左側）に埋め込む。

**出力形式:** \`<iframe>\` 開始タグと \`</iframe>\` 終了タグでHTMLコンテンツを挟む。コードブロック不要。

<iframe width="500px" height="300px" title="タイトル（省略可）">
<!DOCTYPE html><html>
<head><style>/* スタイル */</style></head>
<body><!-- コンテンツ --></body>
</html>
</iframe>

**注意事項:**
- \`</iframe>\` で必ず閉じること
- width / height / title は省略可（省略時: 幅100%・高さ400px）
- 外部CDN・外部ネットワーク不可。CSSもJSもすべてインラインで完結させること
- ユーザー操作をAIに通知したい場合は interactive-html を使うこと`;

/** 【3】interactive-html: ユーザー側サンドボックス（liveモード） */
export const INSTRUCTION_INTERACTIVE_HTML = `
## 【3】interactive-html（ユーザー側サンドボックス・liveモード）

ゲーム・Canvas描画など**操作をAIに通知する複雑なHTML**に使用。ユーザーのチャット欄（右側）に表示。

**出力形式（3ステップ必須）:**
1. コードブロック \`\`\`interactive-html で開始
2. 1行目: JSON設定（id必須）
3. 2行目: \`---\`（区切り文字、省略不可）
4. 3行目以降: HTMLコンテンツ（\`<!DOCTYPE html>\` から書く）

\`\`\`interactive-html
{"id": "YOUR_ID", "mode": "live", "title": "タイトル", "width": "500px", "height": "400px"}
---
<!DOCTYPE html><html>
<body>
  <!-- UIコンテンツ -->
  <script>
    // 親（Aris）へのアクション通知:
    window.parent.postMessage(
      { type: 'interactive-ui-action', uiId: 'YOUR_ID', action: 'ACTION', data: { /* 任意データ */ } },
      '*'
    );
    // 親（Aris）からの状態更新を受信:
    window.addEventListener('message', (e) => {
      if (e.data.type === 'interactive-ui-update') {
        const patch = e.data.patch; // 変更差分を適用する
        if (patch.status === 'finished') { /* 終了処理 */ }
      }
    });
  </script>
</body></html>
\`\`\`

**注意事項:**
- 外部CDN・外部ネットワーク不可。CSSもJSもすべてインラインで完結させること
- AIは \`\`\`interactive-ui-update で状態差分を返す（【1】と同形式）
- patch に \`"status": "finished"\` を含めるとUI終了`;
