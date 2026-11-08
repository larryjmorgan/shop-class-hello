// Turns the normal build (dist/) into ONE self-contained file, standalone/StoryBox.html, that works when
// double-clicked (opened from disk, no web server, nothing to install).
//   npm run build:standalone
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');

// Inline text so it can sit inside <script>/<style> without ending them early.
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const safeCss = (s) => s.replace(/<\/style/gi, '<\\/style');

let scripts = 0;
let styles = 0;
html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/g, (_, src) => {
  scripts++;
  return `<script type="module">${safeJs(readFileSync(join(dist, src), 'utf8'))}</script>`;
});
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/g, (_, href) => {
  styles++;
  return `<style>${safeCss(readFileSync(join(dist, href), 'utf8'))}</style>`;
});

// A single file can't have sibling icon/manifest files: embed the icon, drop the install-only tags.
const icon = readFileSync(join(dist, 'icon.svg'), 'base64');
html = html
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${icon}" />`)
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="apple-touch-icon"[^>]*>/, '');

if (scripts !== 1 || styles !== 1 || /(?:src|href)="\.?\/?assets\//.test(html)) {
  throw new Error(`inline-build: expected 1 script + 1 stylesheet inlined and no leftover asset links (got ${scripts}/${styles})`);
}

mkdirSync('standalone', { recursive: true });
writeFileSync('standalone/StoryBox.html', html);
console.log(`standalone/StoryBox.html written (${(html.length / 1024).toFixed(0)} KB)`);
