export function Sparkline({ values, color = 'hsl(var(--brand))' }: { values: number[]; color?: string }) {
  if (!values.some((v) => v > 0)) return null;
  const w = 100;
  const h = 30;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1 || 1);
  const pts = values.map((v, i) => [+(i * step).toFixed(1), +(h - (v / max) * (h - 6) - 3).toFixed(1)] as const);
  const line = pts.map((p) => p.join(',')).join(' ');
  const areaPts = `0,${h} ${line} ${w},${h}`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 block h-[30px] w-full">
      <polygon points={areaPts} fill={color} opacity={0.12} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={2.6} fill={color} />
    </svg>
  );
}
