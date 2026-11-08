import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// One id per build. It names the offline cache (so a new deploy cleans out the old one) and is shown in Help.
const BUILD_ID = Date.now().toString(36);

/** After building, list every file in dist/ and bake the list + build id into dist/sw.js so the whole app is cached on first visit. */
function offlineManifest(): Plugin {
  let outDir = 'dist';
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  return {
    name: 'storybox-offline-manifest',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const swPath = join(outDir, 'sw.js');
      const files = walk(outDir)
        .map((p) => relative(outDir, p).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const urls = ['./', ...files];
      const sw = readFileSync(swPath, 'utf8').replace('__BUILD_ID__', BUILD_ID).replace('"__PRECACHE__"', JSON.stringify(urls));
      // Fail the build rather than ship a service worker with an empty offline cache.
      if (sw.includes('__BUILD_ID__') || sw.includes('__PRECACHE__') || !sw.includes('"index.html"') || !/"assets\/index-[^"]+\.js"/.test(sw)) {
        throw new Error('storybox-offline-manifest: could not fill in dist/sw.js');
      }
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  // Relative URLs so the same build works at https://name.github.io/repo/, in a sub-folder, or at a site root.
  base: './',
  plugins: [react(), offlineManifest()],
  define: { __BUILD_ID__: JSON.stringify(process.env.VITEST ? 'test' : BUILD_ID) },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
