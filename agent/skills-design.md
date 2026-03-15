# ArisChat Skills 機能 設計書

## 概要

各ペルソナに「スキル」を紐付け、AIが必要に応じてスキルの詳細情報を取得・活用できる仕組み。
スキルはファイルとして保存し、外部エディタで自由に編集可能。

---

## ファイル構成

スキルはペルソナごとのディレクトリにMarkdownファイルとして保存する。

```
%APPDATA%/ArisChat/arischat-data/
├── settings.json          # 既存: アプリ設定（ペルソナ一覧含む）
├── sessions/              # 既存: チャットセッション
└── personas/
    └── {persona-id}/
        └── skills/
            ├── code-review.md
            ├── translate.md
            └── db-query.md
```

### スキルファイル形式（Markdown + frontmatter）

```markdown
---
name: コードレビュー
description: コードの品質・セキュリティ・可読性を評価します
trigger: /review
script:
  type: command
  value: "code ."
---

# コードレビュースキル

以下の観点でコードをレビューしてください：

## チェック項目
- セキュリティ脆弱性（SQLインジェクション、XSS等）
- パフォーマンス上の問題
- 可読性・命名規則
- エラーハンドリングの漏れ
- テストカバレッジ

## 出力形式
問題点は重要度（高/中/低）と共に一覧で示し、改善案を提示してください。
```

### frontmatter フィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `name` | ✓ | スキルの表示名 |
| `description` | ✓ | システムプロンプトに載せる概要（1〜2行） |
| `trigger` | - | スラッシュコマンド（例: `/review`） |
| `script.type` | - | `file` / `command` / `url` |
| `script.value` | - | ファイルパス / コマンド文字列 / URL |

---

## 型定義

### `src/shared/types.ts` への追加

```typescript
/** スクリプト設定 */
export interface SkillScript {
  type: 'file' | 'command' | 'url';
  value: string;
}

/** スキル（メタ情報のみ。本文はファイルから読む） */
export interface Skill {
  id: string;           // ファイル名（拡張子なし）をIDとして使用
  name: string;         // frontmatter.name
  description: string;  // frontmatter.description
  trigger?: string;     // frontmatter.trigger（例: "/review"）
  script?: SkillScript; // frontmatter.script
  filePath: string;     // 絶対ファイルパス（エディタで開くために使用）
}
```

`Persona` 型は**変更しない**。スキルはファイルシステムから動的に読み込む。

---

## システムプロンプトへの注入

`getEffectiveSystemPrompt()` を拡張し、アクティブペルソナのスキル概要を付加する。

### 注入フォーマット

```
## あなたが持つスキル

以下のスキルを活用できます。ユーザーの要求にスキルが役立つと判断した場合は、
get_skill_details ツールでスキルの詳細を取得してから回答してください。

| ID | 名前 | 概要 |
|----|------|------|
| code-review | コードレビュー | コードの品質・セキュリティ・可読性を評価します |
| translate | 翻訳 | 日英・英日翻訳を行います |
| db-query | DB操作 | SQLiteデータベースを操作します |
```

---

## AI によるスキル詳細取得（ツール呼び出し）

### ツール定義（`src/main/claude.ts`）

Claude の tool use 機能を使い、AIがスキル詳細を要求できるようにする。

```typescript
// スキル詳細取得ツール
{
  name: 'get_skill_details',
  description: 'スキルの詳細なプロンプト・手順を取得します。スキルを活用する前に呼び出してください。',
  input_schema: {
    type: 'object',
    properties: {
      skill_id: {
        type: 'string',
        description: 'スキルのID（スキル一覧のIDカラムの値）'
      }
    },
    required: ['skill_id']
  }
}

// スクリプト実行ツール
{
  name: 'invoke_skill_script',
  description: 'スキルに紐付けられたスクリプト・ファイル・URLを実行または開きます。',
  input_schema: {
    type: 'object',
    properties: {
      skill_id: {
        type: 'string',
        description: 'スキルのID'
      }
    },
    required: ['skill_id']
  }
}
```

### ツール処理フロー（`src/main/index.ts`）

```
1. AIが get_skill_details(skill_id) を呼び出す
2. main プロセスが該当スキルファイルを読み込み、本文（frontmatter以降）を返す
3. AIが詳細を受け取り、それを踏まえた回答を生成する

1. AIが invoke_skill_script(skill_id) を呼び出す
2. script.type に応じて処理:
   - file    → shell.openPath(script.value)
   - command → exec(script.value)
   - url     → shell.openExternal(script.value)
3. 結果をAIに返す
```

---

## スラッシュコマンドによる手動発火

チャット入力で `/skill-name` と入力した場合も対応する。

### フロー

```
1. ユーザーが "/review コードをレビューして" と入力
2. ChatWindow.tsx がメッセージ送信前に先頭の "/review" を検出
3. 対応するスキルを検索し、スキルの description をメッセージ先頭に付加
4. 通常通り送信（AIはシステムプロンプトのスキル一覧から詳細取得ツールを呼べる）
```

---

## Settings UI

### スキル管理パネル（Settings.tsx）

```
[ペルソナ設定] タブ内に「スキル」セクションを追加

┌─────────────────────────────────────────┐
│ スキル                    [+ 新規作成]  │
├─────────────────────────────────────────┤
│ ● コードレビュー  /review               │
│   コードの品質・セキュリティを評価      │
│   [✏️ エディタで開く]  [🗑️ 削除]        │
├─────────────────────────────────────────┤
│ ● 翻訳            /translate            │
│   日英・英日翻訳を行います              │
│   [✏️ エディタで開く]  [🗑️ 削除]        │
├─────────────────────────────────────────┤
│ [📁 スキルフォルダを開く]               │
└─────────────────────────────────────────┘
```

### 操作

| 操作 | 動作 |
|------|------|
| **新規作成** | テンプレートファイルを生成し、OSの既定エディタで開く |
| **エディタで開く** | `shell.openPath(filePath)` で既定エディタ起動 |
| **削除** | 確認ダイアログ後、ファイルを削除 |
| **スキルフォルダを開く** | `shell.openPath(skillsDir)` でエクスプローラーを開く |

---

## IPC チャンネル追加

```typescript
// src/shared/types.ts IPC_CHANNELS への追加
SKILL_LIST: 'skill:list',           // ペルソナIDを受け取り Skill[] を返す
SKILL_GET_CONTENT: 'skill:get-content', // skill_id を受け取り本文を返す
SKILL_CREATE: 'skill:create',       // 新規テンプレート生成 + エディタで開く
SKILL_DELETE: 'skill:delete',       // ファイル削除
SKILL_OPEN_EDITOR: 'skill:open-editor', // エディタで開く
SKILL_OPEN_FOLDER: 'skill:open-folder', // フォルダをエクスプローラーで開く
```

---

## ファイル変更の検知（オプション）

`fs.watch` でスキルディレクトリを監視し、ファイル変更時にレンダラーへ通知する。
チャット中にスキルを編集しても即座に反映される。

```typescript
// skill:watch チャンネルでレンダラーに変更通知
fs.watch(skillsDir, { recursive: false }, () => {
  mainWindow.webContents.send('skill:changed', personaId);
});
```

---

## 実装ステップ

| ステップ | 内容 | 変更ファイル |
|---------|------|-------------|
| 1 | `Skill` / `SkillScript` 型定義追加 | `src/shared/types.ts` |
| 2 | IPC チャンネル定数追加 | `src/shared/types.ts` |
| 3 | スキルファイル読み書き関数（`skill-manager.ts`） | `src/main/skill-manager.ts`（新規） |
| 4 | IPC ハンドラ登録 | `src/main/index.ts` |
| 5 | `get_skill_details` / `invoke_skill_script` ツール追加 | `src/main/claude.ts` |
| 6 | `getEffectiveSystemPrompt()` にスキル概要注入 | `src/shared/types.ts` |
| 7 | preload に IPC メソッド公開 | `src/main/preload.ts` |
| 8 | Settings にスキル管理 UI 追加 | `src/renderer/components/Settings.tsx` |
| 9 | チャット入力のスラッシュコマンド検出 | `src/renderer/components/ChatWindow.tsx` |
| 10 | ファイル変更検知（オプション） | `src/main/skill-manager.ts` |

---

## スキルテンプレート（新規作成時の初期内容）

```markdown
---
name: 新しいスキル
description: スキルの概要を1〜2行で記述してください
trigger: /skill-name
# script:
#   type: command        # file / command / url
#   value: "echo hello"
---

# スキル名

ここにAIへの詳細な指示を記述してください。

## 目的

このスキルが何をするかを説明します。

## 手順

1. ステップ1
2. ステップ2
3. ステップ3

## 出力形式

期待する出力の形式や構造を記述します。
```

---

## 注意事項

- スキルファイルの `description` は**システムプロンプトに毎回含まれる**ため、簡潔に保つこと（トークン節約）
- `fullContent`（本文）は AI が `get_skill_details` を呼んだときのみ送信される
- スクリプト実行（`command` タイプ）はユーザーの確認ダイアログを表示することを推奨
- ペルソナを切り替えると、そのペルソナのスキルセットに切り替わる
