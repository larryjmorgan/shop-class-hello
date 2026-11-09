/** Crisp drawn icons (emoji get blurry when shown very large). */
export function FilmIcon({ size = '100%' }: { size?: number | string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      <rect x="20" y="44" width="160" height="112" rx="16" fill="#33284d" />
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <rect x={32 + i * 30} y="52" width="16" height="12" rx="3" fill="#ffe27a" />
          <rect x={32 + i * 30} y="136" width="16" height="12" rx="3" fill="#ffe27a" />
        </g>
      ))}
      <rect x="32" y="72" width="136" height="56" rx="8" fill="#7fd6ff" />
      <polygon points="88,84 88,116 120,100" fill="#fff" />
    </svg>
  );
}
