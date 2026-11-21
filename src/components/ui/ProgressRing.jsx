/* SVG 环形进度：用 stroke-dasharray 控制圆弧长度 */

export default function ProgressRing({ pct, size = 148, stroke = 11 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = (pct / 100) * c

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`总进度 ${pct}%`}>
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4C82FF" />
          <stop offset="100%" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(127,179,255,0.18)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${filled} ${c - filled}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}