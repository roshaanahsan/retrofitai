import { useEffect, useState } from 'react';
import { Download, Loader2, TrendingUp, TrendingDown, Minus, RefreshCw, Sparkles, Zap } from 'lucide-react';
import { getLatestBriefing, generateBriefing, downloadBriefingPdf } from '@/lib/api';
import type { WeeklyBriefing } from '@/types';

interface BriefingViewProps {
  briefing: WeeklyBriefing | null;
  setBriefing: (b: WeeklyBriefing | null) => void;
  addMessage: (role: 'user' | 'agent', text: string) => void;
}

const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 18,
  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
};

const STAT_CARD: React.CSSProperties = {
  background: 'linear-gradient(to right, #FFFFFF 0%, #C8D0DE 100%)',
  border: '1px solid #E2E8F0',
  borderRadius: 18,
  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
  padding: '20px 24px',
};

function useCountUp(target: number, duration = 700) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const eased = 1 - Math.pow(1 - frame / totalFrames, 3);
      setCount(Math.round(eased * target));
      if (frame >= totalFrames) { setCount(target); clearInterval(timer); }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function momentumColor(score: number) {
  if (score >= 70) return '#16A34A';
  if (score >= 45) return '#D97706';
  return '#DC2626';
}

function impactStyle(impact: string): React.CSSProperties {
  if (impact === 'HIGH')   return { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' };
  if (impact === 'MEDIUM') return { background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' };
  return                          { background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0' };
}

export default function BriefingView({ briefing, setBriefing, addMessage }: BriefingViewProps) {
  const [loading, setLoading]       = useState(!briefing);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Must be called unconditionally before any early returns (Rules of Hooks)
  const scoreDisplay = useCountUp(briefing?.momentumScore ?? 0);

  useEffect(() => {
    if (briefing) { setLoading(false); return; }
    getLatestBriefing()
      .then(({ data }) => { if (data.available) setBriefing(data.briefing); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [briefing, setBriefing]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const { data } = await generateBriefing();
      setBriefing(data.briefing);
      addMessage('agent', data.reply || 'Weekly briefing generated.');
    } catch {
      addMessage('agent', 'Failed to generate briefing. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload() {
    if (!briefing || downloading) return;
    setDownloading(true);
    try {
      const { data } = await downloadBriefingPdf(briefing._id);
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `retrofitai-briefing-week${briefing.weekNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch {
      addMessage('agent', 'Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 8, color: '#94A3B8', fontSize: 13, fontFamily: 'Poppins, sans-serif' }}>
        <Loader2 size={14} className="animate-spin" style={{ color: '#16A34A' }} />
        Loading briefing…
      </div>
    );
  }

  /* ── No briefing yet ── */
  if (!briefing) {
    return (
      <div className="p-8 space-y-4 max-w-2xl">

        {/* Page header */}
        <div className="mb-6">
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Weekly Briefing
          </h1>
          <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', marginTop: 6 }}>
            Momentum score, response rates, and priority actions — compiled from your pipeline every 7 days
          </p>
        </div>

        {/* Generate card */}
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Zap size={16} style={{ color: '#FFFFFF' }} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}>No briefing generated yet</p>
                <p style={{ fontSize: 12, fontWeight: 300, color: '#94A3B8', marginTop: 1 }}>Takes about 10 seconds</p>
              </div>
            </div>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 13, fontWeight: 300, color: '#64748B', lineHeight: 1.7, marginBottom: 16 }}>
              Generate your first weekly briefing to get your <strong style={{ fontWeight: 600, color: '#0F172A' }}>Momentum Score</strong>,
              see how your response rate compares to the 15% industry average, and receive your top 3 priority
              actions ranked by expected impact.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                height: 44, padding: '0 22px',
                borderRadius: 18, border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
                background: generating ? '#F1F5F9' : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: generating ? '#94A3B8' : '#FFFFFF',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { if (!generating) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
              onMouseLeave={(e) => { if (!generating) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
            >
              {generating
                ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
                : <><Sparkles size={12} /> Generate This Week's Briefing</>}
            </button>
          </div>
        </div>

        {/* What's included */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Momentum Score', desc: '0–100 composite health score of your job search', color: '#16A34A', bg: '#DCFCE7', border: '#BBF7D0' },
            { label: 'Response Rate', desc: 'Your rate vs. 15% industry average — see where you stand', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A' },
            { label: 'Priority Actions', desc: 'Top 3 moves this week ranked by expected impact', color: '#0F172A', bg: '#F1F5F9', border: '#E2E8F0' },
            { label: 'PDF Report', desc: 'Downloadable document to review, share, or archive', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
          ].map((item) => (
            <div key={item.label} style={{ ...CARD, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                background: item.color,
              }} />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{item.label}</p>
                <p style={{ fontSize: 11, fontWeight: 300, color: '#64748B', marginTop: 2, lineHeight: 1.6 }}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Ghost preview */}
        <div style={{ position: 'relative' }}>
          <div className="pointer-events-none select-none" style={{ opacity: 0.25, filter: 'blur(3px)', ...CARD, overflow: 'hidden' }}>
            {/* Ghost: momentum header */}
            <div style={{ padding: '20px 20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)', display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <p style={{ fontSize: 64, fontWeight: 700, color: '#16A34A', letterSpacing: '-0.05em', lineHeight: 1 }}>72</p>
                <p style={{ fontSize: 11, color: '#CBD5E1', marginTop: 2 }}>/ 100</p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>Momentum Score</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>↑ UP from last week</p>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#F1F5F9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '72%', borderRadius: 999, background: 'linear-gradient(to right, #16A34A66, #16A34A)' }} />
                </div>
              </div>
            </div>
            {/* Ghost: stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid #E2E8F0' }}>
              {[['4', 'Apps This Week'], ['22%', 'Response Rate'], ['8%', 'Interview Rate']].map(([val, label], i) => (
                <div key={label} style={{ padding: '16px 20px', borderRight: i < 2 ? '1px solid #E2E8F0' : 'none' }}>
                  <p style={{ fontSize: 24, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1 }}>{val}</p>
                  <p style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</p>
                </div>
              ))}
            </div>
            {/* Ghost: priority actions */}
            <div style={{ padding: '16px 20px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 14 }}>Priority Actions</p>
              {['Send follow-ups to 3 stale applications — 8+ days, no response', 'Add Kubernetes and CI/CD to your resume before next apply', 'Apply to 5 new roles this week — your pace is below target'].map((action, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#FFFFFF' }}>{i + 1}</div>
                  <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, marginTop: 3 }}>{action}</p>
                </div>
              ))}
            </div>
          </div>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: '#64748B', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', padding: '10px 20px', borderRadius: 18, border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(0,0,0,0.06)' }}>
              Generate your first briefing to see your data here
            </p>
          </div>
        </div>

      </div>
    );
  }

  /* ── Briefing available ── */
  const scoreColor = momentumColor(briefing.momentumScore);
  const TrendIcon = briefing.momentumTrend === 'UP' ? TrendingUp : briefing.momentumTrend === 'DOWN' ? TrendingDown : Minus;
  const trendColor = briefing.momentumTrend === 'UP' ? '#16A34A' : briefing.momentumTrend === 'DOWN' ? '#DC2626' : '#94A3B8';
  const responseRatePct = Math.round((briefing.responseRate ?? 0) * 100);
  const industryPct = Math.round((briefing.industryAvgResponseRate ?? 0.15) * 100);
  const interviewPct = Math.round((briefing.interviewRate ?? 0) * 100);

  return (
    <div className="p-8 space-y-4 max-w-2xl">

      {/* Page header */}
      <div className="mb-2 flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Week {briefing.weekNumber} Briefing
          </h1>
          <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', marginTop: 6 }}>
            Generated {new Date(briefing.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              height: 40, padding: '0 16px',
              borderRadius: 18, border: 'none', cursor: generating ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
              background: generating ? '#F1F5F9' : '#16A34A',
              color: generating ? '#94A3B8' : '#FFFFFF',
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => { if (!generating) (e.currentTarget as HTMLButtonElement).style.background = '#15803D'; }}
            onMouseLeave={(e) => { if (!generating) (e.currentTarget as HTMLButtonElement).style.background = '#16A34A'; }}
          >
            <RefreshCw size={11} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 40, padding: '0 18px',
              borderRadius: 18, border: 'none', cursor: downloading ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
              background: downloading ? '#F1F5F9' : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              color: downloading ? '#94A3B8' : '#FFFFFF',
              transition: 'background 150ms',
            }}
            onMouseEnter={(e) => { if (!downloading) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
            onMouseLeave={(e) => { if (!downloading) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
          >
            <Download size={13} />
            {downloading ? 'Downloading…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Main briefing card */}
      <div style={{ ...CARD, overflow: 'hidden' }}>

        {/* Momentum score hero */}
        <div style={{ padding: '20px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 24, background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <p style={{ fontSize: 64, fontWeight: 700, color: scoreColor, letterSpacing: '-0.05em', lineHeight: 1 }}>
              {scoreDisplay}
            </p>
            <p style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 400, marginTop: 2 }}>/ 100</p>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>
                Momentum Score
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: trendColor }}>
                <TrendIcon size={11} />
                <span style={{ fontSize: 11, fontWeight: 600 }}>
                  {briefing.momentumTrend === 'UP' ? 'Rising' : briefing.momentumTrend === 'DOWN' ? 'Falling' : 'Stable'} from last week
                </span>
              </div>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: '#F1F5F9', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${scoreDisplay}%`, borderRadius: 999, background: `linear-gradient(to right, ${scoreColor}66, ${scoreColor})`, transition: 'width 700ms ease-out' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 10, color: '#CBD5E1' }}>0</span>
              <span style={{ fontSize: 10, fontWeight: 500, color: scoreColor }}>
                {briefing.momentumScore >= 70 ? 'Strong momentum' : briefing.momentumScore >= 45 ? 'Building momentum' : 'Momentum needs work'}
              </span>
              <span style={{ fontSize: 10, color: '#CBD5E1' }}>100</span>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid #E2E8F0' }}>
          {[
            {
              value: briefing.applicationsSentThisWeek,
              suffix: '',
              label: 'Apps This Week',
              sub: briefing.applicationsSentThisWeek > 0 ? 'sent this week' : 'none sent',
              subColor: briefing.applicationsSentThisWeek > 0 ? '#16A34A' : '#94A3B8',
            },
            {
              value: responseRatePct,
              suffix: '%',
              label: 'Response Rate',
              sub: responseRatePct > industryPct ? `+${responseRatePct - industryPct}pp above avg` : `${industryPct - responseRatePct}pp below avg (${industryPct}% avg)`,
              subColor: responseRatePct >= industryPct ? '#16A34A' : '#DC2626',
            },
            {
              value: interviewPct,
              suffix: '%',
              label: 'Interview Rate',
              sub: interviewPct > 0 ? 'reached interview' : 'no interviews yet',
              subColor: interviewPct > 0 ? '#16A34A' : '#94A3B8',
            },
          ].map((stat, i) => (
            <div key={stat.label} style={{ padding: '16px 20px', borderRight: i < 2 ? '1px solid #E2E8F0' : 'none' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 8 }}>
                {stat.label}
              </p>
              <p style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6 }}>
                {stat.value}<span style={{ fontSize: 14, fontWeight: 300, color: '#94A3B8' }}>{stat.suffix}</span>
              </p>
              <p style={{ fontSize: 11, fontWeight: 300, color: stat.subColor }}>{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Best / worst performing */}
        {(briefing.bestPerformingCategory || briefing.worstPerformingCategory) && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
            {briefing.bestPerformingCategory && (
              <div style={{ padding: '14px 20px', borderRight: briefing.worstPerformingCategory ? '1px solid #E2E8F0' : 'none' }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#16A34A', marginBottom: 6 }}>
                  Best Performing
                </p>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{briefing.bestPerformingCategory}</p>
              </div>
            )}
            {briefing.worstPerformingCategory && (
              <div style={{ padding: '14px 20px' }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#DC2626', marginBottom: 6 }}>
                  Needs Attention
                </p>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>{briefing.worstPerformingCategory}</p>
              </div>
            )}
          </div>
        )}

        {/* Priority actions */}
        {briefing.priorityActions.length > 0 && (
          <div style={{ padding: '16px 20px' }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 14 }}>
              Priority Actions This Week
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {briefing.priorityActions.map((action, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: '#FFFFFF',
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, marginTop: 2 }}>
                    <p style={{ fontSize: 13, fontWeight: 400, color: '#374151', lineHeight: 1.6 }}>
                      {action.action}
                    </p>
                    {action.dueDate && (
                      <p style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>Due {action.dueDate}</p>
                    )}
                  </div>
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 8, flexShrink: 0,
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 3,
                    ...impactStyle(action.impact),
                  }}>
                    {action.impact}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
