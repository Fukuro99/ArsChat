import { app, type NativeImage, nativeImage } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { ArsChatSettings } from '../shared/types';

const ICONS_DIR = path.join(app.getPath('userData'), 'arschat-data', 'custom-icons');
const ASSETS_DIR = path.join(__dirname, '../../assets');

export function createIconManager() {
  // ディレクトリ確保
  if (!fs.existsSync(ICONS_DIR)) {
    fs.mkdirSync(ICONS_DIR, { recursive: true });
  }

  function loadIcon(filePath: string | null, fallback: string): NativeImage {
    try {
      if (filePath && fs.existsSync(filePath)) {
        const img = nativeImage.createFromPath(filePath);
        if (!img.isEmpty()) {
          return img.resize({ width: 256, height: 256 });
        }
      }
    } catch (err) {
      console.error('Failed to load custom icon:', err);
    }
    // フォールバック
    const fallbackPath = path.join(ASSETS_DIR, 'icons', fallback);
    if (fs.existsSync(fallbackPath)) {
      return nativeImage.createFromPath(fallbackPath);
    }
    // 最終フォールバック：空のアイコン生成
    return nativeImage.createEmpty();
  }

  return {
    getAppIcon(settings: ArsChatSettings): NativeImage {
      return loadIcon(settings.customIconPath, 'default.png');
    },

    getTrayIcon(settings: ArsChatSettings): NativeImage {
      const icon = loadIcon(settings.customTrayIconPath || settings.customIconPath, 'default.png');
      // トレイアイコンは小さくリサイズ
      return icon.resize({ width: 24, height: 24 });
    },

    getAvatarPath(settings: ArsChatSettings): string | null {
      if (settings.customAvatarPath && fs.existsSync(settings.customAvatarPath)) {
        return settings.customAvatarPath;
      }
      const defaultAvatar = path.join(ASSETS_DIR, 'icons', 'default.png');
      return fs.existsSync(defaultAvatar) ? defaultAvatar : null;
    },

    async saveCustomIcon(sourcePath: string, target: 'app' | 'tray' | 'avatar'): Promise<string> {
      const ext = path.extname(sourcePath);
      const destFileName = `${target}-custom${ext}`;
      const destPath = path.join(ICONS_DIR, destFileName);

      // ファイルコピー
      fs.copyFileSync(sourcePath, destPath);

      return destPath;
    },
  };
}
