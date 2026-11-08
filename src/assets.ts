// Built-in art. Everything is drawn in code so the app works offline with no image files.
// Characters/props are SVG strings (viewBox 0 0 200 200); backgrounds are canvas painters.

export interface FaceState {
  mouthOpen: boolean;
  blink: boolean;
}

export interface ArtAsset {
  id: string;
  label: string;
  emoji: string;
  kind: 'character' | 'prop';
  colors: string[]; // first is default
  svg: (color: string, face: FaceState) => string;
}

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${inner}</svg>`;

// ---- shared face parts ----
const eyes = (y: number, dx: number, f: FaceState, r = 9) =>
  f.blink
    ? `<path d="M${100 - dx - r} ${y} Q${100 - dx} ${y + 6} ${100 - dx + r} ${y}" stroke="#2b2233" stroke-width="4" fill="none" stroke-linecap="round"/>
       <path d="M${100 + dx - r} ${y} Q${100 + dx} ${y + 6} ${100 + dx + r} ${y}" stroke="#2b2233" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : `<circle cx="${100 - dx}" cy="${y}" r="${r}" fill="#2b2233"/><circle cx="${100 + dx}" cy="${y}" r="${r}" fill="#2b2233"/>
       <circle cx="${100 - dx + 3}" cy="${y - 3}" r="3.2" fill="#fff"/><circle cx="${100 + dx + 3}" cy="${y - 3}" r="3.2" fill="#fff"/>`;

const mouth = (y: number, f: FaceState) =>
  f.mouthOpen
    ? `<ellipse cx="100" cy="${y + 4}" rx="11" ry="10" fill="#7a2230"/><ellipse cx="100" cy="${y + 9}" rx="6.5" ry="4" fill="#ff7b8a"/>`
    : `<path d="M89 ${y} Q100 ${y + 12} 111 ${y}" stroke="#4a2a2a" stroke-width="4" fill="none" stroke-linecap="round"/>`;

const cheeks = (y: number, dx: number) =>
  `<circle cx="${100 - dx}" cy="${y}" r="9" fill="#ff8fa3" opacity=".45"/><circle cx="${100 + dx}" cy="${y}" r="9" fill="#ff8fa3" opacity=".45"/>`;

export function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  const r = c((n >> 16) & 255);
  const g = c((n >> 8) & 255);
  const b = c(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export const CHARACTERS: ArtAsset[] = [
  {
    id: 'bunny', label: 'Bunny', emoji: '🐰', kind: 'character',
    colors: ['#f4f0f7', '#ffd6e7', '#d9c4a5', '#bcd7ff', '#c9f0c4'],
    svg: (c, f) => svg(`
      <ellipse cx="72" cy="42" rx="16" ry="40" fill="${c}"/><ellipse cx="72" cy="46" rx="8" ry="30" fill="#ffadc6"/>
      <ellipse cx="128" cy="42" rx="16" ry="40" fill="${c}"/><ellipse cx="128" cy="46" rx="8" ry="30" fill="#ffadc6"/>
      <ellipse cx="100" cy="158" rx="46" ry="38" fill="${c}"/><ellipse cx="100" cy="162" rx="27" ry="24" fill="#fff" opacity=".65"/>
      <ellipse cx="68" cy="190" rx="20" ry="9" fill="${shade(c, -0.06)}"/><ellipse cx="132" cy="190" rx="20" ry="9" fill="${shade(c, -0.06)}"/>
      <circle cx="100" cy="102" r="47" fill="${c}"/>
      ${cheeks(112, 30)}${eyes(96, 19, f)}
      <ellipse cx="100" cy="108" rx="7" ry="5" fill="#ff7b9a"/>${mouth(114, f)}`),
  },
  {
    id: 'bear', label: 'Bear', emoji: '🐻', kind: 'character',
    colors: ['#b97a4a', '#8d5a3a', '#f0c27b', '#e8e8f0', '#7aa8ff'],
    svg: (c, f) => svg(`
      <ellipse cx="100" cy="166" rx="46" ry="32" fill="${c}"/><ellipse cx="100" cy="168" rx="26" ry="20" fill="${shade(c, 0.18)}"/>
      <circle cx="56" cy="56" r="21" fill="${c}"/><circle cx="56" cy="56" r="11" fill="${shade(c, 0.2)}"/>
      <circle cx="144" cy="56" r="21" fill="${c}"/><circle cx="144" cy="56" r="11" fill="${shade(c, 0.2)}"/>
      <circle cx="100" cy="100" r="51" fill="${c}"/>
      <ellipse cx="100" cy="118" rx="25" ry="19" fill="${shade(c, 0.28)}"/>
      ${cheeks(114, 40)}${eyes(90, 24, f)}
      <ellipse cx="100" cy="109" rx="9" ry="6.5" fill="#3a2323"/>${mouth(120, f)}`),
  },
  {
    id: 'kitty', label: 'Kitty', emoji: '🐱', kind: 'character',
    colors: ['#ffb877', '#9aa0b5', '#f3f3f3', '#3b3b4f', '#ffd966'],
    svg: (c, f) => svg(`
      <path d="M150 170 Q196 150 178 100" stroke="${c}" stroke-width="16" fill="none" stroke-linecap="round"/>
      <ellipse cx="100" cy="164" rx="42" ry="30" fill="${c}"/><ellipse cx="100" cy="168" rx="22" ry="18" fill="${shade(c, 0.2)}"/>
      <polygon points="52,78 56,24 98,58" fill="${c}"/><polygon points="62,68 63,40 85,58" fill="#ffadc6"/>
      <polygon points="148,78 144,24 102,58" fill="${c}"/><polygon points="138,68 137,40 115,58" fill="#ffadc6"/>
      <ellipse cx="100" cy="104" rx="54" ry="46" fill="${c}"/>
      <path d="M64 60 Q70 72 78 78 M136 60 Q130 72 122 78" stroke="${shade(c, -0.15)}" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${cheeks(114, 36)}${eyes(96, 23, f, 10)}
      <polygon points="94,107 106,107 100,115" fill="#ff7b9a"/>${mouth(118, f)}
      <g stroke="#555" stroke-width="2" stroke-linecap="round" opacity=".6">
        <line x1="40" y1="108" x2="12" y2="102"/><line x1="40" y1="116" x2="12" y2="120"/>
        <line x1="160" y1="108" x2="188" y2="102"/><line x1="160" y1="116" x2="188" y2="120"/></g>`),
  },
  {
    id: 'robot', label: 'Robo', emoji: '🤖', kind: 'character',
    colors: ['#7fb2ff', '#ff9a7a', '#8fe3a8', '#ffd24d', '#c9a0ff'],
    svg: (c, f) => svg(`
      <line x1="100" y1="22" x2="100" y2="44" stroke="#555" stroke-width="5"/><circle cx="100" cy="18" r="9" fill="#ff5d73"/>
      <rect x="62" y="136" width="76" height="52" rx="14" fill="${shade(c, -0.08)}"/>
      <circle cx="100" cy="162" r="10" fill="#fff" opacity=".7"/>
      <rect x="38" y="140" width="22" height="14" rx="7" fill="${c}"/><rect x="140" y="140" width="22" height="14" rx="7" fill="${c}"/>
      <rect x="44" y="42" width="112" height="92" rx="26" fill="${c}"/>
      <rect x="56" y="56" width="88" height="62" rx="16" fill="#1f2a44"/>
      ${f.blink
        ? `<path d="M68 84 h22 M110 84 h22" stroke="#7df9ff" stroke-width="5" stroke-linecap="round"/>`
        : `<circle cx="79" cy="82" r="11" fill="#7df9ff"/><circle cx="121" cy="82" r="11" fill="#7df9ff"/><circle cx="82" cy="79" r="3.5" fill="#fff"/><circle cx="124" cy="79" r="3.5" fill="#fff"/>`}
      ${f.mouthOpen
        ? `<rect x="86" y="97" width="28" height="14" rx="7" fill="#7df9ff"/>`
        : `<path d="M84 102 Q100 112 116 102" stroke="#7df9ff" stroke-width="5" fill="none" stroke-linecap="round"/>`}
      <circle cx="48" cy="88" r="6" fill="${shade(c, -0.15)}"/><circle cx="152" cy="88" r="6" fill="${shade(c, -0.15)}"/>`),
  },
  {
    id: 'dino', label: 'Dino', emoji: '🦖', kind: 'character',
    colors: ['#6fcf7f', '#ff9f5a', '#7fb2ff', '#c18bff', '#ffd24d'],
    svg: (c, f) => svg(`
      <path d="M150 150 Q196 150 190 112 Q176 140 148 130Z" fill="${c}"/>
      <polygon points="62,52 76,20 90,50" fill="#ff9f5a"/><polygon points="92,44 106,10 120,42" fill="#ff9f5a"/><polygon points="122,52 136,22 148,56" fill="#ff9f5a"/>
      <ellipse cx="100" cy="118" rx="62" ry="64" fill="${c}"/>
      <ellipse cx="100" cy="142" rx="38" ry="40" fill="${shade(c, 0.28)}"/>
      <ellipse cx="66" cy="186" rx="22" ry="10" fill="${shade(c, -0.1)}"/><ellipse cx="134" cy="186" rx="22" ry="10" fill="${shade(c, -0.1)}"/>
      <circle cx="52" cy="132" r="9" fill="${c}"/><circle cx="148" cy="132" r="9" fill="${c}"/>
      ${cheeks(112, 42)}${eyes(92, 26, f, 10)}
      <circle cx="93" cy="106" r="2.5" fill="#2b2233" opacity=".6"/><circle cx="107" cy="106" r="2.5" fill="#2b2233" opacity=".6"/>
      ${mouth(118, f)}`),
  },
  {
    id: 'princess', label: 'Princess', emoji: '👸', kind: 'character',
    colors: ['#ff8fc7', '#8fb8ff', '#b99cff', '#ffd36b', '#7fe0b0'],
    svg: (c, f) => svg(`
      <ellipse cx="100" cy="82" rx="47" ry="50" fill="#8a5a3c"/>
      <path d="M60 110 Q40 160 56 186 L144 186 Q160 160 140 110Z" fill="#8a5a3c"/>
      <path d="M72 120 L128 120 L160 192 L40 192Z" fill="${c}"/><path d="M72 120 L128 120 L122 134 L78 134Z" fill="${shade(c, -0.12)}"/>
      <circle cx="100" cy="124" r="6" fill="#ffe27a"/>
      <circle cx="100" cy="84" r="36" fill="#ffd9bf"/>
      <path d="M64 80 Q70 44 100 46 Q130 44 136 80 Q116 62 100 64 Q84 62 64 80Z" fill="#8a5a3c"/>
      <polygon points="76,48 80,26 90,40 100,22 110,40 120,26 124,48" fill="#ffd54a" stroke="#e0a800" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="100" cy="30" r="4" fill="#ff5d9b"/>
      ${cheeks(98, 22)}${eyes(86, 14, f, 7)}${mouth(100, { ...f })}`),
  },
];

const prop = (id: string, label: string, emoji: string, colors: string[], body: (c: string) => string): ArtAsset => ({
  id, label, emoji, kind: 'prop', colors, svg: (c) => svg(body(c)),
});

export const PROPS: ArtAsset[] = [
  prop('sun', 'Sun', '☀️', ['#ffd23f', '#ffb347'], (c) =>
    `<g stroke="${c}" stroke-width="10" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return `<line x1="${100 + Math.cos(a) * 58}" y1="${100 + Math.sin(a) * 58}" x2="${100 + Math.cos(a) * 82}" y2="${100 + Math.sin(a) * 82}"/>`;
    }).join('')}</g><circle cx="100" cy="100" r="46" fill="${c}"/>
    <circle cx="84" cy="94" r="5" fill="#7a4b00"/><circle cx="116" cy="94" r="5" fill="#7a4b00"/>
    <path d="M82 112 Q100 128 118 112" stroke="#7a4b00" stroke-width="4.5" fill="none" stroke-linecap="round"/>`),
  prop('cloud', 'Cloud', '☁️', ['#ffffff', '#dfe9f7'], (c) =>
    `<g fill="${c}"><circle cx="64" cy="112" r="34"/><circle cx="102" cy="90" r="42"/><circle cx="142" cy="112" r="32"/><rect x="40" y="112" width="124" height="34" rx="17"/></g>`),
  prop('tree', 'Tree', '🌳', ['#4cc26b', '#ff9f5a', '#7fb2ff'], (c) =>
    `<rect x="88" y="110" width="24" height="82" rx="8" fill="#8a5a3c"/><circle cx="100" cy="76" r="54" fill="${c}"/><circle cx="68" cy="100" r="34" fill="${shade(c, 0.05)}"/><circle cx="134" cy="98" r="36" fill="${shade(c, -0.05)}"/>
     <circle cx="82" cy="64" r="7" fill="#ff5d73"/><circle cx="120" cy="82" r="7" fill="#ff5d73"/><circle cx="100" cy="104" r="7" fill="#ff5d73"/>`),
  prop('flower', 'Flower', '🌸', ['#ff7eb6', '#ffd23f', '#b78bff', '#ff9f5a'], (c) =>
    `<rect x="96" y="100" width="8" height="90" rx="4" fill="#3aa655"/><ellipse cx="122" cy="150" rx="22" ry="9" fill="#4cc26b" transform="rotate(-25 122 150)"/>
     ${Array.from({ length: 6 }, (_, i) => `<ellipse cx="100" cy="52" rx="19" ry="26" fill="${c}" transform="rotate(${i * 60} 100 82)"/>`).join('')}
     <circle cx="100" cy="82" r="17" fill="#ffd23f"/>`),
  prop('heart', 'Heart', '💖', ['#ff5d8f', '#b78bff', '#ffd23f'], (c) =>
    `<path d="M100 172 C20 112 24 50 66 46 C86 44 98 56 100 68 C102 56 114 44 134 46 C176 50 180 112 100 172Z" fill="${c}"/><ellipse cx="68" cy="68" rx="12" ry="8" fill="#fff" opacity=".5" transform="rotate(-30 68 68)"/>`),
  prop('star', 'Star', '⭐', ['#ffd23f', '#ff9f5a', '#8fe3ff'], (c) =>
    `<polygon points="100,16 123,72 184,76 137,114 152,174 100,142 48,174 63,114 16,76 77,72" fill="${c}" stroke="${shade(c, -0.12)}" stroke-width="6" stroke-linejoin="round"/>
     <circle cx="86" cy="98" r="4.5" fill="#7a4b00"/><circle cx="114" cy="98" r="4.5" fill="#7a4b00"/><path d="M88 114 Q100 126 112 114" stroke="#7a4b00" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  prop('balloon', 'Balloon', '🎈', ['#ff5d73', '#5db5ff', '#ffd23f', '#6fdc8c'], (c) =>
    `<path d="M100 186 Q88 160 100 140" stroke="#888" stroke-width="3" fill="none"/><ellipse cx="100" cy="82" rx="46" ry="58" fill="${c}"/><polygon points="92,138 108,138 100,128" fill="${shade(c, -0.1)}"/><ellipse cx="80" cy="58" rx="9" ry="16" fill="#fff" opacity=".45" transform="rotate(20 80 58)"/>`),
  prop('house', 'House', '🏠', ['#ff9f7a', '#7fb2ff', '#ffd966', '#8fe3a8'], (c) =>
    `<rect x="34" y="92" width="132" height="92" rx="6" fill="${c}"/><polygon points="22,96 100,32 178,96" fill="#c4553a"/><rect x="84" y="128" width="32" height="56" rx="5" fill="#7a4b2a"/><circle cx="108" cy="158" r="3" fill="#ffd23f"/>
     <rect x="46" y="110" width="28" height="26" rx="4" fill="#bfe6ff" stroke="#fff" stroke-width="4"/><rect x="126" y="110" width="28" height="26" rx="4" fill="#bfe6ff" stroke="#fff" stroke-width="4"/>`),
  prop('rainbow', 'Rainbow', '🌈', ['#ff5d73'], () =>
    ['#ff5d73', '#ff9f5a', '#ffd23f', '#6fdc8c', '#5db5ff', '#a07cff']
      .map((col, i) => `<path d="M${14 + i * 11} 160 A${86 - i * 11} ${86 - i * 11} 0 0 1 ${186 - i * 11} 160" stroke="${col}" stroke-width="12" fill="none"/>`).join('')),
  prop('ball', 'Ball', '⚽', ['#ff5d73', '#5db5ff', '#ffd23f'], (c) =>
    `<circle cx="100" cy="100" r="62" fill="${c}"/><path d="M42 100 Q100 60 158 100" stroke="#fff" stroke-width="10" fill="none"/><path d="M42 100 Q100 140 158 100" stroke="#fff" stroke-width="10" fill="none" opacity=".0"/><circle cx="76" cy="76" r="9" fill="#fff" opacity=".4"/>`),
  prop('butterfly', 'Butterfly', '🦋', ['#b78bff', '#ff8fc7', '#5db5ff'], (c) =>
    `<ellipse cx="64" cy="82" rx="42" ry="34" fill="${c}" transform="rotate(-20 64 82)"/><ellipse cx="136" cy="82" rx="42" ry="34" fill="${c}" transform="rotate(20 136 82)"/>
     <ellipse cx="72" cy="128" rx="28" ry="22" fill="${shade(c, 0.12)}" transform="rotate(20 72 128)"/><ellipse cx="128" cy="128" rx="28" ry="22" fill="${shade(c, 0.12)}" transform="rotate(-20 128 128)"/>
     <circle cx="62" cy="80" r="10" fill="#fff" opacity=".55"/><circle cx="138" cy="80" r="10" fill="#fff" opacity=".55"/>
     <rect x="94" y="62" width="12" height="82" rx="6" fill="#3b2f4a"/><path d="M98 64 Q86 36 74 34 M102 64 Q114 36 126 34" stroke="#3b2f4a" stroke-width="3" fill="none"/>`),
  prop('apple', 'Apple', '🍎', ['#ff4d5e', '#6fdc8c', '#ffd23f'], (c) =>
    `<path d="M100 60 C60 36 22 66 36 118 C46 160 78 184 100 170 C122 184 154 160 164 118 C178 66 140 36 100 60Z" fill="${c}"/><path d="M100 62 Q104 36 120 26" stroke="#6b4423" stroke-width="7" fill="none" stroke-linecap="round"/><ellipse cx="128" cy="38" rx="20" ry="10" fill="#4cc26b" transform="rotate(-25 128 38)"/><ellipse cx="66" cy="92" rx="9" ry="16" fill="#fff" opacity=".35" transform="rotate(20 66 92)"/>`),
  prop('moon', 'Moon', '🌙', ['#ffe9a6', '#dfe9f7'], (c) =>
    `<path d="M120 24 A78 78 0 1 0 176 130 A62 62 0 0 1 120 24Z" fill="${c}"/><circle cx="70" cy="110" r="8" fill="${shade(c, -0.08)}"/><circle cx="96" cy="150" r="6" fill="${shade(c, -0.08)}"/><circle cx="62" cy="76" r="5" fill="${shade(c, -0.08)}"/>`),
  prop('cake', 'Cake', '🎂', ['#ff9fc7', '#ffd966', '#9fd8ff'], (c) =>
    `<rect x="40" y="104" width="120" height="70" rx="10" fill="${c}"/><path d="M40 118 q15 18 30 0 q15 18 30 0 q15 18 30 0 q15 18 30 0 v-14 h-120z" fill="#fff"/>
     <rect x="96" y="66" width="8" height="38" rx="3" fill="#5db5ff"/><ellipse cx="100" cy="58" rx="8" ry="12" fill="#ffb347"/><ellipse cx="100" cy="60" rx="4" ry="7" fill="#ffe27a"/>`),
];

export const ART: ArtAsset[] = [...CHARACTERS, ...PROPS];
export const artById = (id: string) => ART.find((a) => a.id === id);

// ---------------- Backgrounds ----------------

export interface BackgroundDef {
  id: string;
  label: string;
  emoji: string;
  thumb: string; // css gradient for the picker
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
}

function sky(ctx: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, a = 1) {
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, 34 * s, 0, 7);
  ctx.arc(x + 40 * s, y - 18 * s, 42 * s, 0, 7);
  ctx.arc(x + 86 * s, y, 32 * s, 0, 7);
  ctx.fill();
  ctx.fillRect(x - 10 * s, y, 110 * s, 30 * s);
  ctx.restore();
}

function hills(ctx: CanvasRenderingContext2D, w: number, h: number, base: number, color: string, amp: number, freq: number, phase: number) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 20) ctx.lineTo(x, base + Math.sin(x * freq + phase) * amp);
  ctx.lineTo(w, h);
  ctx.fill();
}

function stars(ctx: CanvasRenderingContext2D, w: number, _h: number, t: number, count: number, ymax: number) {
  for (let i = 0; i < count; i++) {
    const x = (i * 7919) % w;
    const y = (i * 104729) % ymax;
    const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
    ctx.fillStyle = `rgba(255,255,255,${0.35 + tw * 0.65})`;
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + (i % 3) * 0.9 * tw, 0, 7);
    ctx.fill();
  }
}

export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'meadow', label: 'Sunny Meadow', emoji: '🌼', thumb: 'linear-gradient(#8fd3ff,#d9f2ff 50%,#7bd88f 51%,#4cc26b)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#7cc8ff', '#e3f6ff');
      cloud(ctx, ((t * 14 + 120) % (w + 300)) - 150, 120, 1.1, 0.95);
      cloud(ctx, ((t * 9 + 700) % (w + 300)) - 150, 200, 0.8, 0.9);
      hills(ctx, w, h, 470, '#8fdc8f', 26, 0.006, 1);
      hills(ctx, w, h, 540, '#5fc86e', 22, 0.008, 3);
      hills(ctx, w, h, 610, '#46b45a', 16, 0.011, 0);
      for (let i = 0; i < 14; i++) {
        const x = (i * 211) % w;
        const y = 560 + ((i * 97) % 140);
        ctx.fillStyle = ['#fff', '#ffd23f', '#ff8fc7'][i % 3];
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, 7);
        ctx.fill();
      }
    },
  },
  {
    id: 'bedroom', label: 'Cozy Bedroom', emoji: '🛏️', thumb: 'linear-gradient(#ffe0c2,#ffd0a0 70%,#c58b5a 71%)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#ffe7cf', '#ffd6b0');
      ctx.fillStyle = '#c99362';
      ctx.fillRect(0, 560, w, h - 560);
      ctx.fillStyle = '#b57e50';
      for (let x = 0; x < w; x += 160) ctx.fillRect(x, 560, 4, h - 560);
      // window with night sky
      ctx.fillStyle = '#fff';
      ctx.fillRect(880, 90, 280, 260);
      const g = ctx.createLinearGradient(0, 100, 0, 340);
      g.addColorStop(0, '#2b3a7a');
      g.addColorStop(1, '#6a7fd0');
      ctx.fillStyle = g;
      ctx.fillRect(894, 104, 252, 232);
      ctx.save();
      ctx.beginPath();
      ctx.rect(894, 104, 252, 232);
      ctx.clip();
      ctx.translate(894, 104);
      stars(ctx, 252, 232, t, 22, 232);
      ctx.restore();
      ctx.fillStyle = '#fff';
      ctx.fillRect(1018, 104, 8, 232);
      ctx.fillRect(894, 214, 252, 8);
      // rug
      ctx.fillStyle = '#ff9fc7';
      ctx.beginPath();
      ctx.ellipse(500, 640, 340, 58, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#ffd1e6';
      ctx.beginPath();
      ctx.ellipse(500, 640, 250, 38, 0, 0, 7);
      ctx.fill();
      // bed
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(80, 410, 300, 150);
      ctx.fillStyle = '#7fb2ff';
      ctx.fillRect(80, 440, 300, 90);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.roundRect(96, 410, 110, 50, 20);
      ctx.fill();
    },
  },
  {
    id: 'night', label: 'Starry Night', emoji: '🌙', thumb: 'linear-gradient(#141c4a,#3b2f7a 70%,#1c5a4a 71%)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#0f1745', '#4a3a8a');
      stars(ctx, w, h, t, 90, 440);
      hills(ctx, w, h, 540, '#1d4a5c', 30, 0.006, 2);
      hills(ctx, w, h, 610, '#153a48', 20, 0.009, 4);
    },
  },
  {
    id: 'beach', label: 'Beach', emoji: '🏖️', thumb: 'linear-gradient(#8fd3ff,#d9f2ff 45%,#38b6d8 46%,#38b6d8 62%,#f6dfa3 63%)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#74c6ff', '#e6f7ff');
      cloud(ctx, ((t * 12 + 300) % (w + 300)) - 150, 130, 1, 0.95);
      ctx.fillStyle = '#35b3d6';
      ctx.fillRect(0, 360, w, 160);
      ctx.strokeStyle = 'rgba(255,255,255,.7)';
      ctx.lineWidth = 4;
      for (let r = 0; r < 4; r++) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 16) {
          const y = 390 + r * 34 + Math.sin(x * 0.02 + t * 1.5 + r) * 6;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#f6dfa3';
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(0, 540);
      ctx.quadraticCurveTo(w / 2, 480, w, 560);
      ctx.lineTo(w, h);
      ctx.fill();
    },
  },
  {
    id: 'forest', label: 'Forest', emoji: '🌲', thumb: 'linear-gradient(#b8e6a0,#6fc27a 60%,#3a8a4a)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#c8f0b0', '#f3ffd8');
      const tree = (x: number, base: number, s: number, c: string) => {
        ctx.fillStyle = '#7a5230';
        ctx.fillRect(x - 12 * s, base - 120 * s, 24 * s, 120 * s);
        ctx.fillStyle = c;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(x - (90 - i * 16) * s, base - (90 + i * 70) * s + 60 * s);
          ctx.lineTo(x, base - (170 + i * 70) * s + 60 * s);
          ctx.lineTo(x + (90 - i * 16) * s, base - (90 + i * 70) * s + 60 * s);
          ctx.fill();
        }
      };
      for (let i = 0; i < 7; i++) tree(60 + i * 200 + (i % 2) * 40, 470, 0.7, '#7cc98a');
      hills(ctx, w, h, 520, '#5fb06e', 18, 0.007, 1);
      for (let i = 0; i < 5; i++) tree(120 + i * 290, 600, 1.1 + (i % 2) * 0.2, '#3f9b55');
      hills(ctx, w, h, 640, '#47a05a', 12, 0.01, 5);
      // sun rays
      ctx.fillStyle = 'rgba(255,255,200,.14)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const x = 200 + i * 300 + Math.sin(t * 0.5 + i) * 20;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 120, 0);
        ctx.lineTo(x + 40, h);
        ctx.lineTo(x - 140, h);
        ctx.fill();
      }
    },
  },
  {
    id: 'underwater', label: 'Under the Sea', emoji: '🐠', thumb: 'linear-gradient(#5fd0ff,#1c7fc2 70%,#f0d890 71%)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#62d4ff', '#1a6fb8');
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        const x = 100 + i * 340 + Math.sin(t * 0.6 + i) * 30;
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 100, 0);
        ctx.lineTo(x - 20, h);
        ctx.lineTo(x - 200, h);
        ctx.fill();
      }
      ctx.fillStyle = '#f0d890';
      ctx.fillRect(0, 640, w, 80);
      hills(ctx, w, h, 650, '#e8c878', 10, 0.01, 0);
      for (let i = 0; i < 9; i++) {
        const x = 60 + i * 150;
        ctx.strokeStyle = ['#ff7eb6', '#7cf0a0', '#ffb347'][i % 3];
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x, 660);
        for (let y = 0; y < 90; y += 10) ctx.lineTo(x + Math.sin(t * 1.4 + y * 0.08 + i) * 14, 660 - y);
        ctx.stroke();
      }
      for (let i = 0; i < 16; i++) {
        const x = (i * 173) % w;
        const y = h - ((t * (24 + (i % 4) * 10) + i * 91) % (h + 40));
        ctx.strokeStyle = 'rgba(255,255,255,.65)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + Math.sin(t + i) * 10, y, 5 + (i % 4) * 3, 0, 7);
        ctx.stroke();
      }
    },
  },
  {
    id: 'space', label: 'Outer Space', emoji: '🪐', thumb: 'linear-gradient(#0a0a2a,#2a1a5a)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#07071f', '#2b1760');
      stars(ctx, w, h, t, 140, h);
      ctx.fillStyle = '#ff9f7a';
      ctx.beginPath();
      ctx.arc(1030, 170, 74, 0, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,230,200,.8)';
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(1030, 170, 118, 26, -0.4, 0, 7);
      ctx.stroke();
      ctx.fillStyle = '#7fb2ff';
      ctx.beginPath();
      ctx.arc(190, 540, 150, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#6fdc8c';
      ctx.beginPath();
      ctx.ellipse(160, 520, 60, 36, 0.5, 0, 7);
      ctx.ellipse(250, 590, 44, 22, -0.3, 0, 7);
      ctx.fill();
    },
  },
  {
    id: 'party', label: 'Party Room', emoji: '🎉', thumb: 'linear-gradient(#ffd6f0,#ffe9a6)',
    draw: (ctx, w, h, t) => {
      sky(ctx, w, h, '#ffd6f0', '#fff0c2');
      ctx.fillStyle = '#e9b0d8';
      ctx.fillRect(0, 580, w, h - 580);
      const cols = ['#ff5d73', '#ffd23f', '#5db5ff', '#6fdc8c', '#b78bff'];
      for (let i = 0; i < 18; i++) {
        const x = i * 76;
        ctx.fillStyle = cols[i % 5];
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 76, 0);
        ctx.lineTo(x + 38, 60 + Math.sin(t * 2 + i) * 6);
        ctx.fill();
      }
      for (let i = 0; i < 40; i++) {
        const x = (i * 331) % w;
        const y = (i * 53 + t * (30 + (i % 5) * 8)) % h;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 2 + i);
        ctx.fillStyle = cols[i % 5];
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
    },
  },
];
export const bgById = (id: string) => BACKGROUNDS.find((b) => b.id === id);
