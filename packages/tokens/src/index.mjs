export { scalars, tokens } from './scalars.mjs';
export { colorThemes } from './colors.mjs';

/** Render a flat token map as a CSS rule for the given selector. */
function block(selector, map) {
  const lines = Object.entries(map).map(([k, v]) => `  --${k}: ${v};`);
  return `${selector} {\n${lines.join('\n')}\n}\n`;
}

/** Render the scalar tokens as a CSS `:root { … }` block. */
export function toCssRoot(scalars) {
  return block(':root', scalars);
}

/** Render the color themes as `:root { …dark… }` + `:root.light { …light… }`. */
export function toCssThemes(themes) {
  return `${block(':root', themes.dark)}\n${block(':root.light', themes.light)}`;
}
