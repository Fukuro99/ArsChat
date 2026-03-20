# ArsChat メモリ・AIスキル自己編集 設計書

## 概要

### 対象機能
1. **ユーザー情報記録（User Memory）** — ペルソナがユーザーの性格・好み・印象を自由記述テキストで覚える
2. **AIスキル自己編集・作成** — AIがスキルをCRUDできる。ユーザースキルとAIスキルを分離管理

### 用語の定義

| 用語 | 意味 | 実装 |
|------|------|------|
| **User Memory** | ペルソナがユーザーの「印象・性格・好み・習慣」を記憶したもの。ペルソナ視点でのユーザー理解 | `user-memory.md`（自由記述テキスト） |
| **MemOS / Chat History** | チャット履歴を SQLite+Vector で保存し意味的に検索できるようにしたもの。別フェーズで実装予定 | `memory.db`（SQLite + embedding） |

> **注意**: User Memory は配列や構造化データではなく、ペルソナが自然言語で書く「メモ帳」。
> チャット履歴の意味検索（MemOS相当機能）は別ブランチ・別フェーズで実装する。

---

## ストレージ設計

```
arschat-data/personas/{personaId}/
  skills/           ← 既存のまま = ユーザースキル（後方互換・マイグレーション不要）
    {skillId}.md
  ai-skills/        ← NEW: AIが作成・管理するスキル
    {skillId}.md
  user-memory.md    ← NEW: ペルソナがユーザーについて書く自由記述テキスト
```

---

## 機能1: ユーザー情報記録（User Memory）

### コンセプト

- ペルソナが「ユーザーについての手書きのメモ帳」を持つ
- 配列ではなく**自然言語の自由記述テキスト**として保持
- ペルソナ単位で独立（`personas/{personaId}/user-memory.md`）
- AIが会話中に `update_user_memory` ツールを呼んで自ら更新する

### 新規ファイル: `src/main/memory-manager.ts`

```typescript
export class MemoryManager {
  constructor(private dataDir: string) {}

  getMemoryPath(personaId: string): string
  // → {dataDir}/personas/{personaId}/user-memory.md

  getMemory(personaId: string): string | null
  // → ファイルが存在しなければ null を返す

  setMemory(personaId: string, content: string): void
  // → ファイルに上書き保存

  clearMemory(personaId: string): void
  // → ファイルを削除
}
```

### システムプロンプトへの注入

`getEffectiveSystemPrompt()` の注入順序（変更後）:

```
1. ペルソナ名 + systemPrompt
2. [NEW] ## ユーザーについての記憶  ← user-memory.md の内容（存在する場合のみ）
3. ## あなたが持つスキル           ← 既存スキルテーブル
4. ファイルブラウザ情報             ← 既存
5. 現在日時                        ← 既存
```

注入フォーマット:
```
## ユーザーについての記憶
{user-memory.md の内容}
```

### AIツール: `update_user_memory`

`claude.ts` に追加するツール定義:

```typescript
{
  name: "update_user_memory",
  description:
    "ユーザーについて覚えておくべき情報を記録・更新する。" +
    "会話から得たユーザーの好み・背景・状況・習慣などを自由な文章で書き込む。" +
    "既存の記憶は完全に上書きされるため、既存内容を保持したい場合は含めること。",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "ユーザーについての記憶テキスト（自由記述）"
      }
    },
    required: ["content"]
  }
}
```

ツール実行ハンドラー:
```typescript
case 'update_user_memory': {
  memoryManager.setMemory(personaId, input.content);
  return { success: true, message: "記憶を更新しました" };
}
```

### バックグラウンド自動抽出（オプション）

設定 `autoExtractMemory: boolean`（デフォルト: false）が有効な場合、
会話ターン終了後にサイレントAI呼び出しで自動更新する。

サイレント呼び出しのシステムプロンプト:
```
あなたは{ペルソナ名}です。
以下の会話を読み、ユーザーについて覚えておくべき新しい情報があれば
update_user_memory ツールを呼んでください。
不要であれば何もしなくて構いません。

現在の記憶:
{既存メモリ or "（まだ何も覚えていません）"}
```

---

## 機能2: AIスキル自己編集・作成

### 権限マトリクス

| 操作 | ユーザースキル (`skills/`) | AIスキル (`ai-skills/`) |
|------|--------------------------|------------------------|
| AI が作成 | ❌（常に `ai-skills/` に作る） | ✅ |
| AI が編集 | 🔒 `allowAIEditUserSkills` 設定次第（デフォルト: false） | ✅ |
| AI が削除 | ❌ **設定不可・永久ブロック** | ✅ |
| ユーザーが編集 | ✅ | ✅ |
| ユーザーが削除 | ✅ | ✅ |

### `Persona` 型の変更

```typescript
export interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  avatarPath: string | null;
  // NEW
  allowAIEditUserSkills: boolean;  // デフォルト: false
}
```

### `Skill` 型の変更

```typescript
export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger?: string;
  script?: SkillScript;
  filePath: string;
  source: 'user' | 'ai' | 'builtin';  // NEW
}
```

### `skill-manager.ts` の変更

```typescript
type SkillSource = 'user' | 'ai';

// ディレクトリ解決
getUserSkillsDir(personaId: string): string
// → personas/{personaId}/skills/

getAISkillsDir(personaId: string): string
// → personas/{personaId}/ai-skills/

// 既存 listSkills を拡張: 両ディレクトリを走査して source を付与
listSkills(personaId: string): (Skill & { source: SkillSource })[]

// 保存先を source で振り分け
saveSkill(personaId: string, skill: SkillData, source: SkillSource): Skill

// スキルを ID で検索（両ディレクトリを探索）
findSkill(personaId: string, skillId: string): (Skill & { source: SkillSource }) | null
```

### システムプロンプトのスキルテーブル（変更後）

```
| ID | 名前 | 説明 | 作成者 |
|----|------|------|--------|
| code-review | コードレビュー | ... | user |
| rust-opt | Rust最適化提案 | ... | ai |
```

`source` カラムを追加することで AI 自身が「これはユーザースキルだから削除できない」と文脈理解できる。

### AIツール: `create_skill`

```typescript
{
  name: "create_skill",
  description:
    "新しいスキルを作成して永続化する。" +
    "ユーザーから繰り返し依頼されるタスクや手順を再利用可能なスキルとして保存する際に使う。" +
    "作成したスキルは ai-skills/ に保存され、次回以降の会話でも利用できる。",
  input_schema: {
    type: "object",
    properties: {
      name:        { type: "string", description: "スキル名（短く明確に）" },
      description: { type: "string", description: "スキルの説明（システムプロンプトに表示）" },
      body:        { type: "string", description: "スキルの詳細手順・指示（Markdown）" },
      trigger:     { type: "string", description: "トリガーキーワード（例: /review）省略可" }
    },
    required: ["name", "description", "body"]
  }
}
```

ハンドラー:
```typescript
case 'create_skill': {
  const skill = await skillManager.saveSkill(personaId, {
    id: generateId(),
    name: input.name,
    description: input.description,
    body: input.body,
    trigger: input.trigger
  }, 'ai');
  mainWindow.webContents.send('skills:updated', personaId);
  return { success: true, skill_id: skill.id, message: `スキル「${skill.name}」を作成しました` };
}
```

### AIツール: `edit_skill`

```typescript
{
  name: "edit_skill",
  description: "既存スキルの内容を更新する。改善・修正が必要なときに使う。",
  input_schema: {
    type: "object",
    properties: {
      skill_id:    { type: "string" },
      name:        { type: "string" },
      description: { type: "string" },
      body:        { type: "string" }
    },
    required: ["skill_id"]
  }
}
```

ハンドラー（権限チェックあり）:
```typescript
case 'edit_skill': {
  const existing = skillManager.findSkill(personaId, input.skill_id);
  if (!existing) return { success: false, message: "スキルが見つかりません" };

  if (existing.source === 'user') {
    const persona = settings.personas.find(p => p.id === personaId);
    if (!persona?.allowAIEditUserSkills) {
      return {
        success: false,
        message:
          "ユーザー作成スキルの編集は許可されていません。" +
          "ユーザーが設定で「AIによるユーザースキル編集を許可」を有効にした場合のみ編集できます。"
      };
    }
  }

  await skillManager.saveSkill(personaId, { ...existing, ...input }, existing.source);
  mainWindow.webContents.send('skills:updated', personaId);
  return { success: true };
}
```

### AIツール: `delete_skill`

```typescript
{
  name: "delete_skill",
  description:
    "AIが作成したスキル（ai-skills/）を削除する。" +
    "ユーザーが作成したスキルは削除できない。",
  input_schema: {
    type: "object",
    properties: {
      skill_id: { type: "string" },
      reason:   { type: "string", description: "削除理由（ユーザーへの説明用）" }
    },
    required: ["skill_id"]
  }
}
```

ハンドラー（ユーザースキル永久ブロック）:
```typescript
case 'delete_skill': {
  const existing = skillManager.findSkill(personaId, input.skill_id);
  if (!existing) return { success: false, message: "スキルが見つかりません" };

  // ユーザースキルは設定に関わらず絶対に削除不可
  if (existing.source === 'user') {
    return {
      success: false,
      message:
        "ユーザー作成スキルはAIが削除できません。" +
        "削除が必要な場合はユーザーにお願いしてください。"
    };
  }

  await skillManager.deleteSkill(personaId, input.skill_id);
  mainWindow.webContents.send('skills:updated', personaId);
  return { success: true };
}
```

---

## Settings UI

### スキルタブ（ペルソナ設定内）

```
[ペルソナ: アリア ▼]

┌─ スキル ──────────────────────────────────────────┐
│                                                   │
│  👤 ユーザーのスキル              [+ 新規作成]     │
│  ┌──────────────────────────────────────────┐    │
│  │ 📄 コードレビュー    コードを丁寧にレビュー │    │
│  │ 📄 議事録作成       会議内容を整理する     │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  🤖 AIのスキル                                    │
│  ┌──────────────────────────────────────────┐    │
│  │ 📄 Rust最適化提案   Rustコードを最適化する │    │
│  │ 📄 エラー解析       エラーを詳しく分析     │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  ⚙ AI権限設定                                    │
│  □ AIがユーザースキルを編集できるようにする        │
│    （有効にするとAIがユーザースキルを改良できます） │
└───────────────────────────────────────────────────┘
```

### メモリ表示（ペルソナ設定内）

```
┌─ ユーザーの記憶 ────────────────────────────────────┐
│ アリアが覚えているユーザー情報:                      │
│ ┌──────────────────────────────────────────────┐  │
│ │ Rustが好き。Electronで個人ツールを開発中。      │  │
│ │ コードコメントは少なめを好む。...               │  │
│ └──────────────────────────────────────────────┘  │
│ [編集]  [クリア]                                    │
│ □ 会話後に自動更新する（autoExtractMemory）          │
└─────────────────────────────────────────────────────┘
```

---

## 新規 IPC チャンネル

```typescript
// src/shared/types.ts IPC_CHANNELS への追加
MEMORY_GET:   'memory:get',    // (personaId) → string | null
MEMORY_SET:   'memory:set',    // (personaId, content) → void
MEMORY_CLEAR: 'memory:clear',  // (personaId) → void
SKILLS_UPDATED: 'skills:updated', // push通知 (personaId) → void
```

---

## `ArsChatSettings` への追加フィールド

```typescript
interface ArsChatSettings {
  // 既存フィールド...

  // NEW: メモリ設定（グローバル）
  autoExtractMemory: boolean;  // デフォルト: false
}
```

---

## 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/main/memory-manager.ts` | **新規** | メモリの読み書き、パス管理 |
| `src/shared/types.ts` | 変更 | `Skill`に`source`追加、`Persona`に`allowAIEditUserSkills`追加、`getEffectiveSystemPrompt()`にメモリ引数追加、IPC定数追加、Settings拡張 |
| `src/main/skill-manager.ts` | 変更 | `ai-skills/`ディレクトリ対応、`source`付きリスト取得、`findSkill()`追加 |
| `src/main/claude.ts` | 変更 | `update_user_memory` + `create_skill` + `edit_skill` + `delete_skill` ツール追加、各ハンドラー実装 |
| `src/main/index.ts` | 変更 | `memory:get/set/clear` IPCハンドラー登録、`MemoryManager`インスタンス化 |
| `src/main/preload.ts` | 変更 | memory系IPCメソッドをcontextBridgeに公開 |
| `src/renderer/components/Settings.tsx` | 変更 | スキルタブをuser/AIで分割、AI権限チェックボックス、メモリ表示・編集UI追加 |

---

## 実装ステップ（✅ = 完了）

| # | 内容 | ファイル | 状態 |
|---|------|---------|------|
| 1 | `Skill.source`・`Persona.allowAIEditUserSkills`・メモリ関連型定義追加 | `src/shared/types.ts` | ✅ |
| 2 | IPC定数追加、`getEffectiveSystemPrompt()`にメモリ注入追加 | `src/shared/types.ts` | ✅ |
| 3 | `MemoryManager` 実装 | `src/main/memory-manager.ts` | ✅ |
| 4 | `skill-manager.ts` に `ai-skills/` 対応・`findSkill()` 追加 | `src/main/skill-manager.ts` | ✅ |
| 5 | `claude.ts` に4ツール追加（`update_user_memory`, `create_skill`, `edit_skill`, `delete_skill`） | `src/main/claude.ts` | ✅ |
| 6 | IPCハンドラー・`MemoryManager`インスタンス化 | `src/main/index.ts` | ✅ |
| 7 | contextBridgeにmemory系メソッド追加 | `src/main/preload.ts` | ✅ |
| 8 | Settings UIにスキル分割・メモリ表示・AI権限設定を追加 | `src/renderer/components/Settings.tsx` | ✅ |

---

## 次フェーズ: MemOS 相当機能（チャット履歴の意味検索）

> User Memory（ペルソナのユーザー印象メモ）とは別の機能。
> チャット履歴を SQLite + Vector Embedding で保存し、会話前に関連する過去履歴を自動注入する。

### 設計方針

```
personas/{personaId}/memory.db  ← SQLite ファイル

テーブル:
┌─ memories ─────────────────────────────────────┐
│ id           TEXT PRIMARY KEY                   │
│ type         TEXT  ('episodic')                 │
│ content      TEXT  会話の要約・スニペット         │
│ embedding    BLOB  Float32Array                 │
│ importance   REAL  0.0〜1.0                     │
│ access_count INTEGER                            │
│ created_at   INTEGER                            │
│ accessed_at  INTEGER                            │
└─────────────────────────────────────────────────┘
```

### Embedding の選択肢

| 方式 | 推奨度 | 理由 |
|------|--------|------|
| LM Studio `/v1/embeddings` | ⭐⭐⭐ | 既存クライアント流用・無料・ローカル |
| Anthropic API | ⭐⭐ | 品質高いがコスト発生 |
| `@xenova/transformers` | ⭐ | 完全オフラインだがバンドル肥大化 |

### ベクトル検索

純粋 JS の cosine similarity（〜1万件は十分高速）。
件数増加時は `sqlite-vec` 拡張（HNSW）へ移行可能。

### 追加ツール（claude.ts）

- `store_memory(content, importance?)` — 会話スニペットを保存
- `search_memories(query)` → Top-K 類似メモリを返す（AI向け）

### 実装ブランチ

`feat/memos-chat-history`（別ブランチで実装予定）
