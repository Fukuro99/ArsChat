/**
 * デフォルトアイコン生成スクリプト
 * SVGからPNGアイコンを生成する
 *
 * 使い方: node scripts/generate-icons.js
 * 前提: sharp パッケージがインストールされていること
 */

const fs = require('fs');
const path = require('path');

// SVGでデフォルトアイコンを定義
const defaultIconSVG = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#4f46e5"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <text x="128" y="160" font-family="Arial, sans-serif" font-size="120" font-weight="bold"
        fill="white" text-anchor="middle">A</text>
</svg>`;

const darkIconSVG = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e1b4b"/>
      <stop offset="100%" style="stop-color:#0f0f23"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="56" fill="url(#bg)"/>
  <text x="128" y="160" font-family="Arial, sans-serif" font-size="120" font-weight="bold"
        fill="#6366f1" text-anchor="middle">A</text>
</svg>`;

const minimalIconSVG = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="56" fill="white"/>
  <text x="128" y="160" font-family="Arial, sans-serif" font-size="120" font-weight="bold"
        fill="#1a1a3e" text-anchor="middle">A</text>
</svg>`;

const iconsDir = path.join(__dirname, '../assets/icons');
const trayDir = path.join(__dirname, '../assets/tray');

// ディレクトリ作成
[iconsDir, trayDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// SVGファイルとして保存（sharpがなくても使える）
fs.writeFileSync(path.join(iconsDir, 'default.svg'), defaultIconSVG.trim());
fs.writeFileSync(path.join(iconsDir, 'dark.svg'), darkIconSVG.trim());
fs.writeFileSync(path.join(iconsDir, 'minimal.svg'), minimalIconSVG.trim());

console.log('SVG icons generated in assets/icons/');

// sharpがあればPNGも生成
async function generatePNG() {
  try {
    const sharp = require('sharp');

    const sizes = {
      icons: [256],
      tray: [16, 24, 32, 48],
    };

    for (const [name, svg] of [['default', defaultIconSVG], ['dark', darkIconSVG], ['minimal', minimalIconSVG]]) {
      // アプリアイコン
      for (const size of sizes.icons) {
        await sharp(Buffer.from(svg))
          .resize(size, size)
          .png()
          .toFile(path.join(iconsDir, `${name}.png`));
      }

      // トレイアイコン
      for (const size of sizes.tray) {
        await sharp(Buffer.from(svg))
          .resize(size, size)
          .png()
          .toFile(path.join(trayDir, `${name}-${size}.png`));
      }
    }

    console.log('PNG icons generated successfully!');
  } catch (e) {
    console.log('sharp not available, skipping PNG generation. SVGs are ready.');
  }
}

generatePNG();
