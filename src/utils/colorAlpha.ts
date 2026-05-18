/**
 * Apply opacity to a #RRGGBB color for map strokes (react-native-maps accepts rgba strings).
 */
export function hexToRgba(hex: string, alpha: number): string {
  const n = hex.replace('#', '').trim();
  if (n.length !== 6) return hex;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}
