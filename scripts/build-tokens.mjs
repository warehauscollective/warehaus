// Generates src/styles/tokens.generated.css from @warehaus/tokens.
// Run: `npm run tokens`. The generated file is imported by global.css.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scalars, colorThemes, toCssRoot, toCssThemes } from '@warehaus/tokens';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = resolve(__dirname, '../src/styles/tokens.generated.css');

const banner =
  '/* AUTO-GENERATED from @warehaus/tokens — do not edit by hand. Run `npm run tokens`. */\n\n';

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, banner + toCssRoot(scalars) + '\n' + toCssThemes(colorThemes), 'utf8');
console.log('✓ wrote', out);
