import { useState, useEffect } from 'react';
import './AnalysisStatsPanel.css';

export interface OrientationStats {
  hubUp: number;
  flangeUp: number;
  tilted: number;
}

export interface AnalysisStats {
  coveragePercent: number;
  depthScore: number;
  orientationStats: OrientationStats;
}

interface Props {
  stats: AnalysisStats;
}

function useCountUp(target: number, duration: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    setValue(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export function AnalysisStatsPanel({ stats }: Props) {
  const countedCoverage = useCountUp(Math.round(stats.coveragePercent * 10), 1600);
  const countedDepth    = useCountUp(stats.depthScore, 1800);

  const { hubUp, flangeUp, tilted } = stats.orientationStats;
  const total = hubUp + flangeUp + tilted || 1;

  const rows: { label: string; sub: string; value: number; color: string }[] = [
    { label: 'Hub Up',    sub: '정방향',   value: hubUp,    color: '#50c8ff' },
    { label: 'Flange Up', sub: '역방향',   value: flangeUp, color: '#a78bfa' },
    { label: 'Tilted',    sub: '기울어짐',  value: tilted,   color: '#fb923c' },
  ];

  return (
    <div className="asp-panel">
      <div className="asp-title">ANALYSIS RESULTS</div>

      <div className="asp-orient-section">
        <div className="asp-orient-title">ORIENTATION DISTRIBUTION · 자세 분포</div>
        {rows.map(({ label, sub, value, color }) => (
          <div key={label} className="asp-orient-row">
            <div className="asp-orient-labels">
              <span className="asp-label-en">{label}</span>
              <span className="asp-label-ko">{sub}</span>
            </div>
            <div className="asp-bar-wrap">
              <div className="asp-bar" style={{ width: `${(value / total) * 100}%`, background: color }} />
            </div>
            <div className="asp-count" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="asp-divider" />

      <div className="asp-grid">
        <div className="asp-stat">
          <div className="asp-stat-value">{(countedCoverage / 10).toFixed(1)}<span className="asp-stat-unit">%</span></div>
          <div className="asp-stat-label">Coverage</div>
          <div className="asp-stat-sub">검출 커버리지</div>
        </div>
        <div className="asp-stat">
          <div className="asp-bar-wrap asp-depth-bar-wrap">
            <div className="asp-bar asp-depth-bar" style={{ width: `${countedDepth}%` }} />
          </div>
          <div className="asp-stat-value asp-stat-value-sm">{countedDepth}<span className="asp-stat-unit">/100</span></div>
          <div className="asp-stat-label">Depth Distribution</div>
          <div className="asp-stat-sub">깊이 분포 지수</div>
        </div>
      </div>
    </div>
  );
}
