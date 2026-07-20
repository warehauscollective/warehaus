// Generates dist/tokens.css from the JS token source.
// Run: `npm run tokens -w @warehaus/tokens`
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scalars, colorThemes, toCssRoot, toCssThemes } from '../src/index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '../dist/tokens.css');

const banner =
  '/* AUTO-GENERATED from @warehaus/tokens — do not edit by hand. Run `npm run tokens -w @warehaus/tokens`. */\n\n';

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, banner + toCssRoot(scalars) + '\n' + toCssThemes(colorThemes), 'utf8');
console.log('✓ wrote', out);
