import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getInsights, recalculateInsights } from '@/lib/api';
import type { RejectionPattern, Application } from '@/types';

interface InsightsViewProps {
  pattern: RejectionPattern | null;
  setPattern: (p: RejectionPattern | null) => void;
  applications: Application[];
  addMessage: (role: 'user' | 'agent', text: string) => void;
}

export default function InsightsView({ pattern, setPattern, addMessage }: InsightsViewProps) {
  const [loading, setLoading] = useState(!pattern);
  const [recalculating, setRecalculating] = useState(false);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);

  useEffect(() => {
    if (pattern) {
      setLoading(false);
      return;
    }
    getInsights()
      .then(({ data }) => {
        if (data.available) {
          setPattern(data.pattern);
        } else {
          setNotEnoughData(true);
          setCurrentCount(data.current || 0);
        }
      })
      .catch(() => {
        setNotEnoughData(true);
        setCurrentCount(0);
      })
      .finally(() => setLoading(false));
  }, [pattern, setPattern]);

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      const { data } = await recalculateInsights();
      if (data.available) {
        setPattern(data.pattern);
        setNotEnoughData(false);
        addMessage('agent', data.reply || 'Pattern analysis updated.');
      } else {
        setNotEnoughData(true);
        setCurrentCount(data.current || 0);
      }
    } catch {
      addMessage('agent', 'Failed to calculate pattern. Please try again.');
    } finally {
      setRecalculating(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2" style={{ color: '#71717A' }}>
        <Loader2 size={14} className="animate-spin" /> Loading insights...
      </div>
    );
  }

  if (notEnoughData || !pattern) {
    const needed = Math.max(0, 3 - currentCount);
    return (
      <div className="p-6 max-w-2xl">
        <h1
          className="text-xl font-semibold tracking-tight"
          style={{ color: '#FAFAFA', letterSpacing: '-0.02em' }}
        >
          Rejection Intelligence
        </h1>
        <p className="text-xs mt-1 mb-6" style={{ color: '#52525B' }}>
          Pattern analysis across all your rejections — available after 3 data points
        </p>

        {/* Progress toward unlock */}
        <div
          className="rounded-xl overflow-hidden mb-4 relative"
          style={{
            background: 'rgba(24,24,27,0.70)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-16 pointer-events-none rounded-t-lg"
            style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.08), transparent)' }}
          />
          <div className="px-6 pt-6 pb-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold" style={{ color: '#FAFAFA' }}>
                {needed === 0 ? 'Ready to analyze' : `${needed} more rejection${needed !== 1 ? 's' : ''} needed`}
              </p>
              <span
                className="text-[11px] px-2 py-0.5 rounded-md"
                style={{
                  background: '#27272A',
                  color: '#00e5ff',
                  boxShadow: '0 0 0 1px rgba(0,229,255,0.2)',
                }}
              >
                {currentCount} / 3
              </span>
            </div>

            {/* Pip indicators */}
            <div className="flex gap-2 mb-5">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex-1 h-1.5 rounded-full"
                  style={{ background: i < currentCount ? '#00e5ff' : '#27272A' }}
                />
              ))}
            </div>

            <p className="text-xs leading-relaxed" style={{ color: '#52525B' }}>
              Mark rejected or no-response applications in your pipeline. After 3 data points, HireIQ detects
              whether you're failing at the ATS stage, interview stage, or final round — and tells you exactly why.
            </p>
          </div>
          <div
            className="px-6 py-4 flex items-center gap-3"
            style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.04)' }}
          >
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              className="px-4 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
              style={{ background: '#00e5ff', color: '#09090B' }}
            >
              {recalculating ? 'Checking...' : 'Check Now'}
            </button>
            <span className="text-[11px]" style={{ color: '#3F3F46' }}>
              Updates automatically when you mark rejections in the pipeline
            </span>
          </div>
        </div>

        {/* What you'll unlock */}
        <div
          className="rounded-xl p-5"
          style={{
            background: 'rgba(24,24,27,0.60)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 6px 0 rgba(0,0,0,0.16)',
          }}
        >
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: '#3F3F46' }}>
            What you'll unlock
          </p>
          <div className="space-y-3">
            {[
              { label: 'Pattern Detection', desc: 'Pre-interview vs. post-interview vs. final round failure patterns' },
              { label: 'Missing Keywords', desc: 'Exact terms that ATS systems filter you on — across all rejections' },
              { label: 'Root Cause Diagnosis', desc: 'Why you\'re failing and precisely what to change' },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-3">
                <div
                  className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                  style={{ background: '#3F3F46' }}
                />
                <div>
                  <p className="text-xs font-medium" style={{ color: '#A1A1AA' }}>{item.label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#52525B' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const patternLabel = {
    PRE_INTERVIEW: 'Pre-Interview Filtering Detected',
    POST_INTERVIEW: 'Post-Interview Conversion Problem',
    FINAL_ROUND: 'Final Round Closing Problem',
    INSUFFICIENT_DATA: 'Insufficient Data',
  }[pattern.dominantPattern];

  const patternColor = {
    PRE_INTERVIEW: '#EF4444',
    POST_INTERVIEW: '#F59E0B',
    FINAL_ROUND: '#00e5ff',
    INSUFFICIENT_DATA: '#71717A',
  }[pattern.dominantPattern];

  const confidenceTextColor = {
    HIGH: '#10B981',
    MEDIUM: '#F59E0B',
    LOW: '#71717A',
  }[pattern.patternConfidence];

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: '#FAFAFA' }}>
            Pattern Analysis
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#71717A' }}>
            Based on {pattern.totalRejections} rejections — Updated{' '}
            {new Date(pattern.lastCalculated).toLocaleDateString()}
          </p>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="px-3 py-1.5 text-xs rounded-md transition-colors disabled:opacity-50"
          style={{
            background: 'transparent',
            color: '#71717A',
            boxShadow: '0 0 0 1px rgba(63,63,70,0.5)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#A1A1AA';
            (e.currentTarget as HTMLButtonElement).style.background = '#27272A';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = '#71717A';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {recalculating ? 'Recalculating...' : 'Recalculate'}
        </button>
      </div>

      {/* Main card */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(24,24,27,0.70)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
        }}
      >
        {/* Pattern type */}
        <div className="px-5 py-5" style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5 mb-2">
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: patternColor }}
            />
            <p className="text-base font-semibold" style={{ color: patternColor }}>
              {patternLabel}
            </p>
          </div>
          <p className="text-xs" style={{ color: '#71717A' }}>
            Confidence:{' '}
            <span className="font-medium" style={{ color: confidenceTextColor }}>
              {pattern.patternConfidence}
            </span>
            <span style={{ color: '#3F3F46' }}> · {pattern.totalRejections} data points</span>
          </p>
        </div>

        {/* What it means */}
        <div
          className="px-5 py-5"
          style={{ background: 'rgba(9,9,11,0.30)', boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}
        >
          <p
            className="text-[11px] uppercase tracking-wide font-medium mb-2"
            style={{ color: '#52525B' }}
          >
            What this means
          </p>
          <p className="text-sm leading-relaxed" style={{ color: '#A1A1AA' }}>
            "{pattern.insight}"
          </p>
        </div>

        {/* Missing keywords */}
        {pattern.missingKeywordsAcrossRejections.length > 0 && (
          <div className="px-5 py-5" style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}>
            <p
              className="text-[11px] uppercase tracking-wide font-medium mb-2.5"
              style={{ color: '#52525B' }}
            >
              Keywords missing across rejections
            </p>
            <div className="flex flex-wrap gap-1.5">
              {pattern.missingKeywordsAcrossRejections.map((kw) => (
                <span
                  key={kw}
                  className="text-xs px-2 py-0.5 rounded-md"
                  style={{
                    background: 'rgba(69,10,10,0.4)',
                    color: '#F87171',
                    boxShadow: '0 0 0 1px rgba(127,29,29,0.3)',
                  }}
                >
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-5" style={{ background: 'rgba(9,9,11,0.30)' }}>
          <p
            className="text-[11px] uppercase tracking-wide font-medium mb-3"
            style={{ color: '#52525B' }}
          >
            Recommended actions
          </p>
          <ol className="space-y-3">
            {pattern.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm" style={{ color: '#A1A1AA' }}>
                <span
                  className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold mt-0.5"
                  style={{ background: '#001a22', color: '#00e5ff', boxShadow: '0 0 0 1px rgba(63,63,70,0.4)' }}
                >
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-4 gap-2.5">
        {Object.entries(pattern.rejectionBreakdown).map(([key, count]) => {
          const labels: Record<string, string> = {
            noResponse: 'No Response',
            phoneScreen: 'Phone Screen',
            firstInterview: 'Interview',
            finalRound: 'Final Round',
          };
          return (
            <div
              key={key}
              className="rounded-xl p-3 text-center"
              style={{
                background: 'rgba(24,24,27,0.60)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 1px 4px 0 rgba(0,0,0,0.16)',
              }}
            >
              <p
                className="text-lg font-semibold"
                style={{ color: '#FAFAFA' }}
              >
                {count}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: '#52525B' }}>
                {labels[key]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
