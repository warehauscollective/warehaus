export { scalars, tokens } from './scalars.mjs';

/** Render the scalar tokens as a CSS `:root { … }` block. */
export function toCssRoot(scalars) {
  const lines = Object.entries(scalars).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}
