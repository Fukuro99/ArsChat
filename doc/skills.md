**[English](en/skills.md) | 日本語**

# スキルシステム

スキルはペルソナごとに定義できる**再利用可能な AI プロンプトテンプレート**です。
Markdown ファイルに YAML frontmatter を付けたシンプルな形式で、外部エディタで自由に編集できます。

---

## 目次

- [概要](#概要)
- [ファイル構成](#ファイル構成)
- [スキルファイルの形式](#スキルファイルの形式)
- [Frontmatter フィールド](#frontmatter-フィールド)
- [スクリプト連携](#スクリプト連携)
- [スラッシュコマンド](#スラッシュコマンド)
- [作成例](#作成例)

---

## 概要

スキルの仕組み:

1. ペルソナの設定ディレクトリ内の `skills/` フォルダに Markdown ファイルを配置
2. アプリ起動時にスキル一覧が読み込まれ、AI のシステムプロンプトに概要が注入される
3. ユーザーがスラッシュコマンド（例: `/review`）を入力するか、AI が自律的にスキルの詳細を取得して活用する
4. スキルのフルテキストが AI に渡され、詳細な指示として機能する

---

## ファイル構成

```
%APPDATA%/ArsChat/arschat-data/
└── personas/
    └── {persona-id}/
        └── skills/
            ├── code-review.md
            ├── translate.md
            └── db-query.md
```

ファイル名（拡張子なし）がスキル ID になります。

---

## スキルファイルの形式

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

---

## Frontmatter フィールド

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | string | ✓ | スキルの表示名 |
| `description` | string | ✓ | システムプロンプトに載せる概要（1〜2行） |
| `trigger` | string | — | スラッシュコマンド（例: `/review`） |
| `script.type` | string | — | スクリプト種別: `file` / `command` / `url` |
| `script.value` | string | — | スクリプトの値（パス/コマンド/URL） |

---

## スクリプト連携

`script` フィールドを設定すると、スキル呼び出し時に外部コマンドやファイルを実行できます。

### `type: command`

シェルコマンドを実行し、出力を AI への追加コンテキストとして使います。

```yaml
script:
  type: command
  value: "git diff HEAD"
```

### `type: file`

指定したファイルの内容を読み込んで AI に渡します。

```yaml
script:
  type: file
  value: "C:/Users/user/project/schema.sql"
```

### `type: url`

URL のコンテンツを取得して AI に渡します。

```yaml
script:
  type: url
  value: "https://api.example.com/docs"
```

---

## スラッシュコマンド

`trigger: /command-name` を設定すると、チャット入力欄でスラッシュコマンドとして呼び出せます。

```
/review この関数のセキュリティを確認して
/translate 以下のテキストを英語に
```

スラッシュコマンドを入力するとスキルのフルテキストがシステムプロンプトに追加され、
続けて入力したテキストがユーザーメッセージとして送信されます。

---

## 作成例

### コードレビュースキル

```markdown
---
name: コードレビュー
description: コードの品質・セキュリティ・可読性を評価します
trigger: /review
---

以下の観点でコードをレビューし、問題点を重要度（高/中/低）で分類してください:

**セキュリティ**
- インジェクション脆弱性（SQL、コマンド、XSS）
- 認証・認可の問題
- 機密情報のハードコード

**品質**
- エラーハンドリングの漏れ
- 命名規則の一貫性
- 重複コード（DRY 原則）

**パフォーマンス**
- N+1 クエリ
- 不要なループや再計算
```

### 翻訳スキル

```markdown
---
name: 日英翻訳
description: 日本語を自然な英語に翻訳します
trigger: /translate
---

以下のテキストを英語に翻訳してください。

- 技術文書の場合は専門用語を正確に訳す
- カジュアルな文章は自然な英語表現を使う
- 翻訳のみを返し、説明は不要
```

### Git Diff レビュースキル

```markdown
---
name: Git差分レビュー
description: git diff の内容をレビューします
trigger: /diff-review
script:
  type: command
  value: "git diff HEAD"
---

上記の git diff を確認し、以下の点をレビューしてください:

1. 変更の意図が明確か
2. テストが必要な変更があるか
3. リグレッションのリスクはあるか
4. コミットメッセージに含めるべき内容
```

### DB スキーマ参照スキル

```markdown
---
name: DB スキーマ参照
description: データベーススキーマを参照しながらクエリを作成します
trigger: /sql
script:
  type: file
  value: "C:/Users/user/project/schema.sql"
---

上記のデータベーススキーマを参照して、ユーザーの要求に応じた SQL クエリを作成してください。

- テーブル名・カラム名は正確に使用する
- パフォーマンスを考慮してインデックスを活用する
- 必要に応じて JOIN の選択理由を説明する
```

---

## スキルの管理

アプリの Settings パネルからスキルの一覧表示・作成・削除が行えます。
また、ファイルマネージャーや任意のエディタで直接 Markdown ファイルを編集することもできます。
ファイルの変更はアプリ再起動後に反映されます。
