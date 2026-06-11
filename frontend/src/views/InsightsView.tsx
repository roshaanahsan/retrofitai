import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Lightbulb, Target, Lock } from 'lucide-react';
import { getInsights, recalculateInsights } from '@/lib/api';
import type { RejectionPattern } from '@/types';

interface InsightsViewProps {
  pattern: RejectionPattern | null;
  setPattern: (p: RejectionPattern | null) => void;
  addMessage: (role: 'user' | 'agent', text: string) => void;
}

const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 18,
  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
};

const PATTERN_META: Record<string, {
  label: string;
  color: string;
  bg: string;
  border: string;
  headerGradient: string;
  Icon: React.ElementType;
  desc: string;
}> = {
  PRE_INTERVIEW: {
    label: 'Pre-Interview Filtering',
    color: '#DC2626',
    bg: '#FEF2F2',
    border: '#FECACA',
    headerGradient: 'linear-gradient(to bottom, #FEF2F2, #FFFFFF 60%)',
    Icon: AlertTriangle,
    desc: "You're getting filtered before your resume reaches a human.",
  },
  POST_INTERVIEW: {
    label: 'Post-Interview Conversion Problem',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    headerGradient: 'linear-gradient(to bottom, #FFFBEB, #FFFFFF 60%)',
    Icon: Target,
    desc: "You're passing the screen but losing momentum in interviews.",
  },
  FINAL_ROUND: {
    label: 'Final Round Closing Problem',
    color: '#D97706',
    bg: '#FFFBEB',
    border: '#FDE68A',
    headerGradient: 'linear-gradient(to bottom, #FFFBEB, #FFFFFF 60%)',
    Icon: Target,
    desc: "You're making it to the end but not closing the offer.",
  },
  INSUFFICIENT_DATA: {
    label: 'Insufficient Data',
    color: '#DC2626',
    bg: '#FEF2F2',
    border: '#FECACA',
    headerGradient: 'linear-gradient(to bottom, #FEF2F2, #FFFFFF 60%)',
    Icon: Lightbulb,
    desc: 'More data points needed for a confident diagnosis.',
  },
};

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: '#16A34A',   // safe — high confidence in the diagnosis
  MEDIUM: '#D97706', // normal — moderate confidence
  LOW: '#DC2626',    // critical — not enough data to trust the result
};

const BREAKDOWN_LABELS: Record<string, string> = {
  noResponse: 'No Response',
  phoneScreen: 'Phone Screen',
  firstInterview: 'Interview',
  finalRound: 'Final Round',
};

export default function InsightsView({ pattern, setPattern, addMessage }: InsightsViewProps) {
  const [loading, setLoading]           = useState(!pattern);
  const [recalculating, setRecalculating] = useState(false);
  const [notEnoughData, setNotEnoughData] = useState(false);
  const [currentCount, setCurrentCount]  = useState(0);

  useEffect(() => {
    if (pattern) { setLoading(false); return; }
    getInsights()
      .then(({ data }) => {
        if (data.available) {
          setPattern(data.pattern);
        } else {
          setNotEnoughData(true);
          setCurrentCount(data.current || 0);
        }
      })
      .catch(() => { setNotEnoughData(true); setCurrentCount(0); })
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
      <div style={{ padding: '32px', display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', fontSize: 13, fontFamily: 'Poppins, sans-serif' }}>
        <Loader2 size={14} className="animate-spin" style={{ color: '#16A34A' }} />
        Loading insights…
      </div>
    );
  }

  /* ── Not enough data ── */
  if (notEnoughData || !pattern) {
    const needed = Math.max(0, 3 - currentCount);
    return (
      <div className="p-8 space-y-4 max-w-2xl">

        {/* Page header */}
        <div className="mb-6">
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Rejection Intelligence
          </h1>
          <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', marginTop: 6 }}>
            Pattern analysis across all your rejections — unlocks after 3 data points
          </p>
        </div>

        {/* Progress card */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                {needed === 0 ? 'Ready to analyze' : `${needed} more rejection${needed !== 1 ? 's' : ''} needed`}
              </p>
              <span style={{
                fontSize: 10, fontWeight: 700,
                background: '#DCFCE7', color: '#16A34A',
                padding: '2px 8px', borderRadius: 6,
              }}>
                {currentCount} / 3
              </span>
            </div>
            {/* Pip bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{
                  flex: 1, height: 6, borderRadius: 999,
                  background: i < currentCount
                    ? 'linear-gradient(to right, #16A34A, #15803D)'
                    : '#E2E8F0',
                  transition: 'background 300ms',
                }} />
              ))}
            </div>
            <p style={{ fontSize: 12, fontWeight: 300, color: '#64748B', lineHeight: 1.7 }}>
              Mark applications as <strong style={{ fontWeight: 600, color: '#0F172A' }}>Rejected</strong> or{' '}
              <strong style={{ fontWeight: 600, color: '#0F172A' }}>No Response</strong> in your Pipeline. After 3 data
              points, RetrofitAI detects whether you're failing at the ATS stage, interview stage, or final round —
              and tells you exactly why.
            </p>
          </div>
          <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={handleRecalculate}
              disabled={recalculating}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 38, padding: '0 18px',
                borderRadius: 18, border: 'none', cursor: recalculating ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
                background: recalculating ? '#F1F5F9' : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: recalculating ? '#94A3B8' : '#FFFFFF',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { if (!recalculating) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
              onMouseLeave={(e) => { if (!recalculating) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
            >
              {recalculating
                ? <><Loader2 size={12} className="animate-spin" /> Checking…</>
                : <><RefreshCw size={12} /> Check Now</>}
            </button>
            <span style={{ fontSize: 11, fontWeight: 300, color: '#94A3B8' }}>
              Auto-updates when you mark rejections in the Pipeline
            </span>
          </div>
        </div>

        {/* What you'll unlock */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)' }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Lock size={10} /> What you'll unlock
            </p>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              {
                title: 'Pattern Detection',
                desc: 'Pre-interview vs. post-interview vs. final round failure patterns — know exactly where your funnel breaks',
                color: '#DC2626', bg: '#FEF2F2', border: '#FECACA',
              },
              {
                title: 'Missing Keywords',
                desc: 'Exact terms that ATS systems filter you on across all your rejections — add them and watch your response rate climb',
                color: '#D97706', bg: '#FEF3C7', border: '#FDE68A',
              },
              {
                title: 'Root Cause Diagnosis',
                desc: "Specific, data-driven insight into why you're failing — not generic advice, your actual pattern",
                color: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0',
              },
            ].map((item) => (
              <div key={item.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: item.bg, border: `1px solid ${item.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}>{item.title}</p>
                  <p style={{ fontSize: 12, fontWeight: 300, color: '#64748B', marginTop: 2, lineHeight: 1.6 }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    );
  }

  /* ── Pattern available ── */
  const meta = PATTERN_META[pattern.dominantPattern] ?? PATTERN_META['INSUFFICIENT_DATA'];
  const PatternIcon = meta.Icon;
  const confidenceColor = CONFIDENCE_COLOR[pattern.patternConfidence] ?? '#94A3B8';

  return (
    <div className="p-8 space-y-4 max-w-2xl">

      {/* Page header */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Rejection Intelligence
          </h1>
          <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', marginTop: 6 }}>
            <span style={{ color: '#DC2626', fontWeight: 600 }}>{pattern.totalRejections}</span> rejections analyzed · Updated {new Date(pattern.lastCalculated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            height: 36, padding: '0 14px',
            borderRadius: 18, border: 'none', cursor: recalculating ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
            background: recalculating ? '#F1F5F9' : '#16A34A',
            color: recalculating ? '#94A3B8' : '#FFFFFF',
            transition: 'background 150ms',
          }}
          onMouseEnter={(e) => {
            if (!recalculating) (e.currentTarget as HTMLButtonElement).style.background = '#15803D';
          }}
          onMouseLeave={(e) => {
            if (!recalculating) (e.currentTarget as HTMLButtonElement).style.background = '#16A34A';
          }}
        >
          <RefreshCw size={11} className={recalculating ? 'animate-spin' : ''} />
          {recalculating ? 'Recalculating…' : 'Recalculate'}
        </button>
      </div>

      {/* Main pattern card */}
      <div style={{ ...CARD, overflow: 'hidden' }}>

        {/* Pattern header */}
        <div style={{
          padding: '20px 20px',
          borderBottom: '1px solid #E2E8F0',
          background: meta.headerGradient,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: meta.bg, border: `1px solid ${meta.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <PatternIcon size={18} style={{ color: meta.color }} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: meta.color, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                {meta.label}
              </p>
              <p style={{ fontSize: 12, fontWeight: 300, color: '#64748B', marginTop: 3 }}>
                {meta.desc}
              </p>
            </div>
          </div>
          {/* Confidence + data points */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>Confidence</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                background: confidenceColor + '20', color: confidenceColor,
              }}>
                {pattern.patternConfidence}
              </span>
            </div>
            <div style={{ width: 1, height: 12, background: '#E2E8F0' }} />
            <span style={{ fontSize: 11, fontWeight: 300, color: '#94A3B8' }}>
              <span style={{ color: '#DC2626', fontWeight: 600 }}>{pattern.totalRejections}</span> rejection{pattern.totalRejections !== 1 ? 's' : ''} analyzed
            </span>
          </div>
        </div>

        {/* Insight quote */}
        <div style={{ padding: '20px 20px', borderBottom: '1px solid #E2E8F0' }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lightbulb size={10} /> What this means
          </p>
          <div style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderLeft: `3px solid ${meta.color}`,
          }}>
            <p style={{ fontSize: 13, fontWeight: 300, color: '#374151', lineHeight: 1.8 }}>
              {pattern.insight}
            </p>
          </div>
        </div>

        {/* Missing keywords */}
        {pattern.missingKeywordsAcrossRejections.length > 0 && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0' }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10 }}>
              Keywords Missing Across Rejections
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {pattern.missingKeywordsAcrossRejections.map((kw) => (
                <span key={kw} style={{
                  fontSize: 12, fontWeight: 500, padding: '4px 10px', borderRadius: 8,
                  background: '#F8FAFC', color: '#0F172A',
                  border: '1px solid #E2E8F0',
                }}>
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recommended actions */}
        {pattern.recommendedActions.length > 0 && (
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 14 }}>
              Recommended Actions
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pattern.recommendedActions.map((action, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#FFFFFF',
                  }}>
                    {i + 1}
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 400, color: '#374151', lineHeight: 1.6, marginTop: 2 }}>
                    {action}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Breakdown mini-cards */}
      {pattern.rejectionBreakdown && Object.keys(pattern.rejectionBreakdown).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {Object.entries(pattern.rejectionBreakdown).map(([key, count]) => {
            const isMax = (count as number) === Math.max(...Object.values(pattern.rejectionBreakdown) as number[]);
            return (
              <div
                key={key}
                style={{
                  background: isMax ? meta.bg : '#FFFFFF',
                  border: `1px solid ${isMax ? meta.border : '#E2E8F0'}`,
                  borderRadius: 18,
                  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
                  padding: '16px 14px',
                  textAlign: 'center',
                }}
              >
                <p style={{
                  fontSize: 28, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1,
                  color: isMax ? meta.color : '#0F172A',
                  marginBottom: 6,
                }}>
                  {count as number}
                </p>
                <p style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', lineHeight: 1.4 }}>
                  {BREAKDOWN_LABELS[key] ?? key}
                </p>
                {isMax && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#16A34A' }}>
                      dominant
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
