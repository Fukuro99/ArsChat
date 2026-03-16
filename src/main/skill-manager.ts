import * as fs from 'fs';
import * as path from 'path';
import { shell } from 'electron';
import { exec } from 'child_process';
import { Skill, SkillScript } from '../shared/types';
import {
  INSTRUCTION_INTERACTIVE_UI,
  INSTRUCTION_IFRAME,
  INSTRUCTION_INTERACTIVE_HTML,
} from '../shared/interactiveUiInstructions';

// =========================================================
// ビルトインスキル（Interactive UI 関連）
// =========================================================

/** ビルトインスキルの定義（ファイルシステム不要・常に利用可能） */
const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'interactive-ui',
    name: 'Interactive UI コンポーネント',
    description: 'ユーザー側にボタン・フォーム・スライダー等のUIを表示し操作結果をAIに送信する（liveモード・ローカルアクション対応）',
    filePath: '__builtin__',
  },
  {
    id: 'iframe',
    name: 'iframe HTML表示',
    description: 'グラフ・図解・アニメーション等の表示専用HTMLをAIメッセージ欄に埋め込む',
    filePath: '__builtin__',
  },
  {
    id: 'interactive-html',
    name: 'Interactive HTML サンドボックス',
    description: 'ゲーム・Canvasなど複雑なHTMLをユーザー側に表示し操作をAIに通知する（liveモード）',
    filePath: '__builtin__',
  },
];

/** ビルトインスキルの本文コンテンツ */
const BUILTIN_SKILL_CONTENT: Record<string, string> = {
  'interactive-ui': INSTRUCTION_INTERACTIVE_UI,
  'iframe': INSTRUCTION_IFRAME,
  'interactive-html': INSTRUCTION_INTERACTIVE_HTML,
};

/** frontmatter を解析して { meta, body } を返す */
function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const metaRaw = match[1];
  const body = match[2] ?? '';
  const meta: Record<string, any> = {};

  // 簡易 YAML パーサー（ネスト1階層まで対応）
  let currentKey: string | null = null;
  for (const line of metaRaw.split(/\r?\n/)) {
    // ネストキー（2スペースインデント）
    const nested = line.match(/^  (\w+):\s*(.*)$/);
    if (nested && currentKey) {
      if (typeof meta[currentKey] !== 'object' || Array.isArray(meta[currentKey])) {
        meta[currentKey] = {};
      }
      meta[currentKey][nested[1]] = nested[2].trim();
      continue;
    }
    // トップレベルキー
    const top = line.match(/^(\w+):\s*(.*)$/);
    if (top) {
      currentKey = top[1];
      const val = top[2].trim();
      // 空 → オブジェクトになる可能性があるので一旦空文字
      meta[currentKey] = val || '';
    }
  }

  return { meta, body };
}

/** .md ファイルを Skill オブジェクトに変換 */
function parseSkillFile(filePath: string): Skill | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { meta } = parseFrontmatter(content);

    const name = String(meta.name ?? '').trim();
    const description = String(meta.description ?? '').trim();
    if (!name || !description) return null;

    const id = path.basename(filePath, '.md');

    let script: SkillScript | undefined;
    if (meta.script && typeof meta.script === 'object') {
      const scriptType = String(meta.script.type ?? '').trim();
      const scriptValue = String(meta.script.value ?? '').trim();
      if ((scriptType === 'file' || scriptType === 'command' || scriptType === 'url') && scriptValue) {
        script = { type: scriptType as SkillScript['type'], value: scriptValue };
      }
    }

    return {
      id,
      name,
      description,
      trigger: meta.trigger ? String(meta.trigger).trim() : undefined,
      script,
      filePath,
    };
  } catch {
    return null;
  }
}

/** スキルファイルの本文（frontmatter 以降）を取得 */
function readSkillBody(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { body } = parseFrontmatter(content);
    return body.trim();
  } catch {
    return '';
  }
}

/** 新規スキルのテンプレート文字列 */
const SKILL_TEMPLATE = `---
name: 新しいスキル
description: スキルの概要を1〜2行で記述してください
trigger: /skill-name
# script:
#   type: command        # file / command / url のいずれか
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
`;

export function createSkillManager(dataDir: string) {
  /** ペルソナのスキルディレクトリパスを返す */
  function getSkillsDir(personaId: string): string {
    return path.join(dataDir, 'personas', personaId, 'skills');
  }

  /** スキルディレクトリが存在しなければ作成 */
  function ensureSkillsDir(personaId: string): string {
    const dir = getSkillsDir(personaId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  return {
    /** ビルトインスキル一覧を返す */
    getBuiltinSkills(): Skill[] {
      return BUILTIN_SKILLS;
    },

    /** ペルソナのスキル一覧を返す */
    listSkills(personaId: string): Skill[] {
      const dir = getSkillsDir(personaId);
      if (!fs.existsSync(dir)) return [];
      try {
        return fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.md'))
          .map((f) => parseSkillFile(path.join(dir, f)))
          .filter((s): s is Skill => s !== null);
      } catch {
        return [];
      }
    },

    /** スキルの本文（詳細プロンプト）を返す。ビルトインスキルも対応 */
    getSkillContent(personaId: string, skillId: string): string | null {
      // ビルトインスキルを優先チェック
      if (skillId in BUILTIN_SKILL_CONTENT) {
        return BUILTIN_SKILL_CONTENT[skillId];
      }
      const filePath = path.join(getSkillsDir(personaId), `${skillId}.md`);
      if (!fs.existsSync(filePath)) return null;
      return readSkillBody(filePath);
    },

    /** スキルをフロントマターと本文から保存 */
    saveSkill(personaId: string, skillId: string, fields: { name: string; description: string; trigger?: string; scriptType?: string; scriptValue?: string; body: string }): Skill | null {
      const filePath = path.join(getSkillsDir(personaId), `${skillId}.md`);
      if (!fs.existsSync(filePath)) return null;

      let frontmatter = `name: ${fields.name}\ndescription: ${fields.description}`;
      if (fields.trigger) frontmatter += `\ntrigger: ${fields.trigger}`;
      if (fields.scriptType && fields.scriptValue) {
        frontmatter += `\nscript:\n  type: ${fields.scriptType}\n  value: ${fields.scriptValue}`;
      }

      const content = `---\n${frontmatter}\n---\n\n${fields.body}`;
      fs.writeFileSync(filePath, content, 'utf-8');
      return parseSkillFile(filePath);
    },

    /** テンプレートファイルを生成してエディタで開く */
    createSkill(personaId: string): string {
      const dir = ensureSkillsDir(personaId);
      // 重複しない名前を生成
      let fileName = 'new-skill.md';
      let counter = 1;
      while (fs.existsSync(path.join(dir, fileName))) {
        fileName = `new-skill-${counter++}.md`;
      }
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, SKILL_TEMPLATE, 'utf-8');
      shell.openPath(filePath);
      return filePath;
    },

    /** スキルファイルを削除 */
    deleteSkill(personaId: string, skillId: string): void {
      const filePath = path.join(getSkillsDir(personaId), `${skillId}.md`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    },

    /** スキルファイルをエディタで開く */
    openSkillInEditor(filePath: string): void {
      shell.openPath(filePath);
    },

    /** スキルフォルダをエクスプローラーで開く */
    openSkillsFolder(personaId: string): void {
      const dir = ensureSkillsDir(personaId);
      shell.openPath(dir);
    },

    /** スキルに紐付けられたスクリプトを実行 */
    async invokeSkillScript(skill: Skill): Promise<string> {
      if (!skill.script) return 'このスキルにはスクリプトが設定されていません';
      const { type, value } = skill.script;

      if (type === 'url') {
        await shell.openExternal(value);
        return `URL を開きました: ${value}`;
      }

      if (type === 'file') {
        await shell.openPath(value);
        return `ファイルを開きました: ${value}`;
      }

      if (type === 'command') {
        return new Promise((resolve) => {
          exec(value, { encoding: 'utf-8' }, (error, stdout, stderr) => {
            if (error) {
              resolve(`コマンド実行エラー: ${error.message}\n${stderr}`.trim());
            } else {
              resolve(stdout.trim() || '（コマンドが正常に完了しました）');
            }
          });
        });
      }

      return '不明なスクリプトタイプです';
    },
  };
}

export type SkillManager = ReturnType<typeof createSkillManager>;
