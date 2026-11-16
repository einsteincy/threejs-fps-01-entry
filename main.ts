// DUSKLINE entrypoint (Node 22, standard library only): hand the game in.
// Copies this directory's game/ and screenshots/ to /output and writes
// /output/dossier.json with the vendored make.fun library, which is the
// summary the judge reads. Deterministic: two runs write byte-identical
// output (no dates, no randomness). Run locally with:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Serve the game locally with `node serve.ts` (http://localhost:8080).

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): text_max_bytes shapes the
// dossier text; the other limits refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; game/ over 993 files or
// 48 MiB in all).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
