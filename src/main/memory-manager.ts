import * as fs from 'fs';
import * as path from 'path';

export function createMemoryManager(dataDir: string) {
  function getMemoryPath(personaId: string): string {
    return path.join(dataDir, 'personas', personaId, 'user-memory.md');
  }

  function ensurePersonaDir(personaId: string): void {
    const dir = path.join(dataDir, 'personas', personaId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  return {
    /** ペルソナのユーザーメモリを返す（存在しなければ null） */
    getMemory(personaId: string): string | null {
      const filePath = getMemoryPath(personaId);
      if (!fs.existsSync(filePath)) return null;
      try {
        return fs.readFileSync(filePath, 'utf-8');
      } catch {
        return null;
      }
    },

    /** ユーザーメモリを上書き保存 */
    setMemory(personaId: string, content: string): void {
      ensurePersonaDir(personaId);
      fs.writeFileSync(getMemoryPath(personaId), content, 'utf-8');
    },

    /** ユーザーメモリを削除 */
    clearMemory(personaId: string): void {
      const filePath = getMemoryPath(personaId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    },
  };
}

export type MemoryManager = ReturnType<typeof createMemoryManager>;
