// ===== デザイントークン定義・バリデーション =====

/** 許可されたサイズトークン */
export const ALLOWED_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
export type SizeToken = typeof ALLOWED_SIZES[number];

/** 許可されたセマンティックカラートークン */
export const ALLOWED_COLORS = [
  'primary', 'secondary', 'success', 'warning', 'danger', 'muted',
  'text', 'text-inverse', 'bg', 'surface', 'border',
  'black', 'white', 'dark', 'light',
] as const;
export type ColorToken = typeof ALLOWED_COLORS[number];

/** 許可されたスペーシング値 */
export const ALLOWED_GAP = [0, 2, 4, 8, 12, 16, 24, 32] as const;
export const ALLOWED_PADDING = [0, 4, 8, 12, 16, 24] as const;

/** 許可されたボーダー丸め */
export const ALLOWED_ROUNDED = ['none', 'sm', 'md', 'lg', 'full'] as const;
export type RoundedToken = typeof ALLOWED_ROUNDED[number];

/** 許可されたボーダー太さ */
export const ALLOWED_BORDER = ['none', 'thin', 'medium'] as const;

/** 許可されたフォントウェイト */
export const ALLOWED_WEIGHT = ['normal', 'medium', 'bold'] as const;
export type WeightToken = typeof ALLOWED_WEIGHT[number];

/** 許可されたテキスト整列 */
export const ALLOWED_ALIGN = ['left', 'center', 'right'] as const;

/** rawColor: #RRGGBB 形式のみ許可 */
const RAW_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * サイズトークンを CSS 値に変換する
 */
export const sizeMap: Record<SizeToken, string> = {
  xs: '0.75rem',
  sm: '0.875rem',
  md: '1rem',
  lg: '1.125rem',
  xl: '1.25rem',
};

/**
 * セマンティックカラートークンを CSS 変数に変換する
 */
export const colorMap: Record<ColorToken, string> = {
  primary: 'var(--aria-primary)',
  secondary: 'var(--aria-text-muted)',
  muted: 'var(--aria-text-muted)',
  text: 'var(--aria-text)',
  'text-inverse': '#ffffff',
  bg: 'var(--aria-bg)',
  surface: 'var(--aria-surface)',
  border: 'var(--aria-border)',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  // ダークテーマでも高コントラストな色
  black: '#0f172a',
  white: '#f1f5f9',
  dark: '#1e293b',
  light: '#cbd5e1',
};

/**
 * ボーダー丸めトークンを CSS クラスに変換する
 */
export const roundedMap: Record<RoundedToken, string> = {
  none: '0',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  full: '9999px',
};

/**
 * 色トークンを解決する。
 * - セマンティックカラー → CSS変数
 * - rawColor (#RRGGBB) → そのまま
 * - それ以外 → undefined（無効）
 */
export function resolveColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  if (ALLOWED_COLORS.includes(color as ColorToken)) {
    return colorMap[color as ColorToken];
  }
  if (RAW_COLOR_REGEX.test(color)) {
    return color;
  }
  // rgba() や他のCSS関数は拒否
  return undefined;
}

/**
 * サイズトークンを解決する。
 * - 許可トークン → rem値
 * - 数値文字列 → pxとして扱う（ただしホワイトリスト外）
 * - それ以外 → undefined
 */
export function resolveSize(size: string | undefined): string | undefined {
  if (!size) return undefined;
  if (ALLOWED_SIZES.includes(size as SizeToken)) {
    return sizeMap[size as SizeToken];
  }
  return undefined;
}

/**
 * スペーシング値を解決する（数値 → px文字列）
 * ホワイトリスト値のみ許可
 */
export function resolveSpacing(value: number | undefined, allowed: readonly number[]): string | undefined {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  if ((allowed as readonly number[]).includes(num)) {
    return `${num}px`;
  }
  // ホワイトリスト外の場合は最近傍値にクランプ
  const clamped = [...allowed].sort((a, b) => Math.abs(a - num) - Math.abs(b - num))[0];
  return `${clamped}px`;
}

/**
 * ボーダー丸めを解決する
 */
export function resolveRounded(rounded: string | undefined): string | undefined {
  if (!rounded) return undefined;
  if (ALLOWED_ROUNDED.includes(rounded as RoundedToken)) {
    return roundedMap[rounded as RoundedToken];
  }
  return undefined;
}

/**
 * フォントウェイトを解決する
 */
export function resolveFontWeight(weight: string | undefined): string | undefined {
  if (!weight) return undefined;
  const weightMap: Record<WeightToken, string> = {
    normal: '400',
    medium: '500',
    bold: '700',
  };
  if (ALLOWED_WEIGHT.includes(weight as WeightToken)) {
    return weightMap[weight as WeightToken];
  }
  return undefined;
}
