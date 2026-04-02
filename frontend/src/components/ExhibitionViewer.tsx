import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../services/api';
import './ExhibitionViewer.css';

type Phase = 'loading' | 'three-up' | 'merging' | 'merged' | 'error';

interface RawSet {
  color: string | null;
  depth: string | null;
  edge: string | null;
}

interface MergedImage {
  filename: string;
  timestamp: Date;
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}.${m}.${d}  ${h}:${min}:${s}`;
}

interface OrientationStats {
  hubUp: number;
  flangeUp: number;
  tilted: number;
}

interface AnalysisStats {
  coveragePercent: number;
  depthScore: number;
  orientationStats: OrientationStats;
}

interface ExhibitionViewerProps {
  onExit: () => void;
  latestMergedFilename?: string | null;
  analysisStats?: AnalysisStats | null;
}

/** 0 → target 카운터 애니메이션 (duration ms) */
function useCountUp(target: number, duration: number, active: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) { setValue(0); return; }
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return value;
}

const PHASE_DURATION: Record<Exclude<Phase, 'loading' | 'error'>, number> = {
  'three-up': 8000,   // 3장 나란히 표시
  'merging':  9500,   // 합쳐지는 애니메이션 (edge→color 순차)
  'merged':   11000,  // 합성 완료 이미지 단독 표시
};

export function ExhibitionViewer({ onExit, latestMergedFilename, analysisStats }: ExhibitionViewerProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [rawSet, setRawSet] = useState<RawSet>({ color: null, depth: null, edge: null });
  const [mergedImage, setMergedImage] = useState<MergedImage | null>(null);
  const [cycleCount, setCycleCount] = useState(0);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMergedRef = useRef<string | null>(null);

  const clearPhaseTimer = () => {
    if (phaseTimer.current) {
      clearTimeout(phaseTimer.current);
      phaseTimer.current = null;
    }
  };

  const startCycle = useCallback(async () => {
    clearPhaseTimer();
    setPhase('loading');

    try {
      const [rawResult, latestMerged] = await Promise.all([
        api.getLatestRawSet(),
        api.getLatestMergedImage(),
      ]);

      if (!rawResult.color || !rawResult.depth || !rawResult.edge) {
        setPhase('error');
        return;
      }

      setRawSet({ color: rawResult.color, depth: rawResult.depth, edge: rawResult.edge });
      setMergedImage(latestMerged);
      setCycleCount((n) => n + 1);

      // Phase 1: 3장 표시
      setPhase('three-up');
      phaseTimer.current = setTimeout(() => {
        // Phase 2: 합치기 애니메이션
        setPhase('merging');
        phaseTimer.current = setTimeout(() => {
          // Phase 3: 합성 완료 이미지
          setPhase('merged');
          // Phase 4: 자동 반복은 새 이벤트가 올 때 트리거
        }, PHASE_DURATION['merging']);
      }, PHASE_DURATION['three-up']);
    } catch (err) {
      console.error('Exhibition cycle error:', err);
      setPhase('error');
    }
  }, []);

  // Initial load
  useEffect(() => {
    startCycle();
    return clearPhaseTimer;
  }, [startCycle]);

  // New picking cycle detected → restart after "merged" phase is done
  useEffect(() => {
    if (!latestMergedFilename) return;
    if (latestMergedFilename === lastMergedRef.current) return;
    lastMergedRef.current = latestMergedFilename;

    // If currently showing merged or error, restart immediately; otherwise queue
    if (phase === 'merged' || phase === 'error') {
      startCycle();
    } else if (phase === 'three-up') {
      // Restart after current three-up phase ends naturally
      clearPhaseTimer();
      phaseTimer.current = setTimeout(() => startCycle(), 500);
    }
  }, [latestMergedFilename, phase, startCycle]);

  // ESC to exit
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onExit]);

  const colorUrl  = rawSet.color  ? api.getRawImageUrl(rawSet.color,  'color') : '';
  const depthUrl  = rawSet.depth  ? api.getRawImageUrl(rawSet.depth,  'depth') : '';
  const edgeUrl   = rawSet.edge   ? api.getRawImageUrl(rawSet.edge,   'edge')  : '';
  const mergedUrl = mergedImage   ? api.getImageUrl(mergedImage.filename, '3d') : '';

  const statsActive = phase === 'merged' && !!analysisStats;
  const countedCoverage = useCountUp(Math.round((analysisStats?.coveragePercent ?? 0) * 10), 2000, statsActive);
  const countedDepth    = useCountUp(analysisStats?.depthScore   ?? 0, 2200, statsActive);

  return (
    <div className={`exhibition-viewer phase-${phase}`}>
      {/* Header */}
      <div className="ex-header">
        <div className="ex-title">3D Bin Picking Vision</div>
        <div className="ex-badges">
          {cycleCount > 0 && (
            <span className="ex-badge badge-cycle">Cycle #{cycleCount}</span>
          )}
        </div>
        <button className="ex-exit-btn" onClick={onExit} title="Exit (ESC)">✕</button>
      </div>

      {/* Main Stage */}
      <div className="ex-stage">
        {/* Loading */}
        {phase === 'loading' && (
          <div className="ex-loading">
            <div className="ex-spinner" />
            <div>Loading images...</div>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="ex-error">
            <div className="ex-error-icon">⚠</div>
            <div>No image data available</div>
            <button className="ex-retry-btn" onClick={startCycle}>Retry</button>
          </div>
        )}

        {/* Three-up phase & merging phase */}
        {(phase === 'three-up' || phase === 'merging') && (
          <div className={`ex-three-up ${phase === 'merging' ? 'is-merging' : ''}`}>
            {/* 좌: Edge — 먼저 depth 위로 합쳐짐 */}
            <div className="ex-card card-edge">
              <div className="ex-card-img-wrap">
                {edgeUrl && <img src={edgeUrl} alt="Surface Edge" className="ex-raw-img" />}
              </div>
              <div className="ex-card-label">
                <span className="label-en">Surface Edge</span>
                <span className="label-ko">표면 윤곽</span>
              </div>
            </div>

            {/* 중: Depth (+ edge/color 레이어 오버레이) */}
            <div className="ex-card card-depth">
              <div className="ex-card-img-wrap ex-composite">
                {depthUrl && <img src={depthUrl} alt="Depth Map"  className="ex-raw-img layer-depth" />}
                {edgeUrl  && <img src={edgeUrl}  alt="Edge Layer" className="ex-raw-img layer-edge"  />}
                {colorUrl && <img src={colorUrl} alt="Color Layer" className="ex-raw-img layer-color" />}
              </div>
              <div className="ex-card-label">
                <span className="label-en">3D Depth Map</span>
                <span className="label-ko">깊이 지도</span>
              </div>
            </div>

            {/* 우: Color — 나중에 최상위 레이어로 합쳐짐 */}
            <div className="ex-card card-color">
              <div className="ex-card-img-wrap">
                {colorUrl && <img src={colorUrl} alt="Color Segmentation" className="ex-raw-img" />}
              </div>
              <div className="ex-card-label">
                <span className="label-en">Object Recognition</span>
                <span className="label-ko">객체 인식</span>
              </div>
            </div>
          </div>
        )}

        {/* Merged result */}
        {phase === 'merged' && (
          <div className="ex-merged">
            {mergedUrl ? (
              <img src={mergedUrl} alt="Merged 3D Vision" className="ex-merged-img" />
            ) : (
              <div className="ex-no-merged">합성 이미지 없음</div>
            )}
            <div className="ex-merged-label">
              <span className="label-en">3D Vision Result</span>
              <span className="label-ko">3D 비전 결과</span>
            </div>

            {/* Analysis Stats Panel */}
            {analysisStats && (
              <div className="ex-stats-panel">
                <div className="ex-stats-title">ANALYSIS RESULTS</div>

                {/* Orientation Distribution */}
                <div className="ex-orient-section">
                  <div className="ex-orient-title">ORIENTATION DISTRIBUTION · 자세 분포</div>
                  {(() => {
                    const { hubUp, flangeUp, tilted } = analysisStats.orientationStats;
                    const total = hubUp + flangeUp + tilted || 1;
                    const rows: { label: string; sub: string; value: number; color: string }[] = [
                      { label: 'Hub Up',    sub: '정방향',  value: hubUp,    color: '#50c8ff' },
                      { label: 'Flange Up', sub: '역방향',  value: flangeUp, color: '#a78bfa' },
                      { label: 'Tilted',    sub: '기울어짐', value: tilted,   color: '#fb923c' },
                    ];
                    return rows.map(({ label, sub, value, color }) => (
                      <div key={label} className="ex-orient-row">
                        <div className="ex-orient-labels">
                          <span className="ex-orient-label-en">{label}</span>
                          <span className="ex-orient-label-ko">{sub}</span>
                        </div>
                        <div className="ex-orient-bar-wrap">
                          <div
                            className="ex-orient-bar"
                            style={{
                              width: statsActive ? `${(value / total) * 100}%` : '0%',
                              background: color,
                            }}
                          />
                        </div>
                        <div className="ex-orient-count" style={{ color }}>{value}</div>
                      </div>
                    ));
                  })()}
                </div>

                <div className="ex-stats-divider" />

                {/* Coverage & Depth */}
                <div className="ex-stats-grid">
                  <div className="ex-stat-item">
                    <div className="ex-stat-value">{(countedCoverage / 10).toFixed(1)}<span className="ex-stat-unit">%</span></div>
                    <div className="ex-stat-label">Coverage</div>
                    <div className="ex-stat-sub">검출 커버리지</div>
                  </div>
                  <div className="ex-stat-item">
                    <div className="ex-stat-bar-wrap">
                      <div className="ex-stat-bar" style={{ width: `${countedDepth}%` }} />
                    </div>
                    <div className="ex-stat-value ex-stat-value-sm">{countedDepth}<span className="ex-stat-unit">/100</span></div>
                    <div className="ex-stat-label">Depth Distribution</div>
                    <div className="ex-stat-sub">깊이 분포 지수</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="ex-footer">
        <span>idooRMS+ · iRVision 3D Bin Picking</span>
        {mergedImage && (
          <span className="ex-footer-time">{formatTimestamp(new Date(mergedImage.timestamp))}</span>
        )}
      </div>
    </div>
  );
}
