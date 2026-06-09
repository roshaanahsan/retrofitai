import { useEffect, useState } from 'react';
import { Download, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { getLatestBriefing, generateBriefing, downloadBriefingPdf } from '@/lib/api';
import { cn, getMomentumColor } from '@/lib/utils';
import type { WeeklyBriefing } from '@/types';

interface BriefingViewProps {
  briefing: WeeklyBriefing | null;
  setBriefing: (b: WeeklyBriefing | null) => void;
  addMessage: (role: 'user' | 'agent', text: string) => void;
}

export default function BriefingView({ briefing, setBriefing, addMessage }: BriefingViewProps) {
  const [loading, setLoading] = useState(!briefing);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (briefing) {
      setLoading(false);
      return;
    }
    getLatestBriefing()
      .then(({ data }) => {
        if (data.available) setBriefing(data.briefing);
      })
      .catch(() => {
        // Backend unavailable — show empty state
      })
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
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `hireiq-briefing-week${briefing.weekNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      addMessage('agent', 'Failed to download PDF. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2" style={{ color: '#71717A' }}>
        <Loader2 size={14} className="animate-spin" /> Loading briefing...
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="p-6 max-w-2xl">
        <h1
          className="text-xl font-semibold tracking-tight"
          style={{ color: '#FAFAFA', letterSpacing: '-0.02em' }}
        >
          Weekly Strategy Briefing
        </h1>
        <p className="text-xs mt-1 mb-6" style={{ color: '#52525B' }}>
          Compiled from your pipeline data every 7 days — momentum score, response rates, priority actions
        </p>

        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{
            background: 'rgba(24,24,27,0.70)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          <div className="px-6 py-5">
            <p className="text-sm font-semibold mb-1" style={{ color: '#FAFAFA' }}>
              No briefing generated yet
            </p>
            <p className="text-xs mb-5" style={{ color: '#52525B', lineHeight: 1.7 }}>
              Generate your first weekly briefing to get your Momentum Score, compare your response rate
              against industry averages, and see your top 3 priority actions ranked by impact.
            </p>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
              style={{ background: '#00e5ff', color: '#09090B' }}
            >
              {generating ? (
                <><Loader2 size={12} className="animate-spin" /> Generating...</>
              ) : (
                "Generate This Week's Briefing"
              )}
            </button>
          </div>
        </div>

        <div
          className="rounded-xl p-5"
          style={{
            background: 'rgba(24,24,27,0.60)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 6px 0 rgba(0,0,0,0.16)',
          }}
        >
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: '#3F3F46' }}>
            What's in each briefing
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Momentum Score', desc: '0–100 composite health of your search' },
              { label: 'Response Rate', desc: 'Yours vs. 15% industry average' },
              { label: 'Priority Actions', desc: 'Top 3 moves ranked by expected impact' },
              { label: 'PDF Report', desc: 'Downloadable document to share or review' },
            ].map((item) => (
              <div
                key={item.label}
                className="p-3 rounded-md"
                style={{
                  background: 'rgba(9,9,11,0.40)',
                  boxShadow: '0 2px 8px 0 rgba(0,0,0,0.25)',
                }}
              >
                <p className="text-[11px] font-medium" style={{ color: '#A1A1AA' }}>{item.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: '#3F3F46' }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Preview row */}
        <div
          className="rounded-xl p-5 mt-3"
          style={{
            background: 'rgba(24,24,27,0.55)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 6px 0 rgba(0,0,0,0.16)',
            opacity: 0.42,
          }}
        >
          <p className="text-[10px] uppercase tracking-widest font-semibold mb-4" style={{ color: '#3F3F46' }}>
            Preview
          </p>

          {/* Semicircle gauge */}
          <div className="flex flex-col items-center mb-5">
            <svg width="120" height="64" viewBox="0 0 120 64" fill="none">
              {/* Track */}
              <path d="M10 60 A50 50 0 0 1 110 60" stroke="#27272A" strokeWidth="8" strokeLinecap="round" fill="none" />
              {/* Fill — 72/100 = 72% of 180deg arc */}
              <path d="M10 60 A50 50 0 0 1 110 60" stroke="#10B981" strokeWidth="8" strokeLinecap="round" fill="none"
                strokeDasharray="157" strokeDashoffset={`${157 - (157 * 72) / 100}`} />
            </svg>
            <div style={{ marginTop: -16 }}>
              <p className="text-2xl font-bold tabular-nums text-center" style={{ color: '#FAFAFA', letterSpacing: '-0.03em' }}>72</p>
              <p className="text-[10px] text-center uppercase tracking-widest" style={{ color: '#52525B' }}>momentum</p>
            </div>
          </div>

          {/* Mock priority actions */}
          <div className="space-y-2.5">
            {[
              'Send follow-ups to 3 applications with no response after 8+ days',
              'Add 2 missing keywords (Kubernetes, CI/CD) to your resume before next application',
              'Apply to 5 new roles this week — your pace is below target',
            ].map((action, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold mt-0.5"
                  style={{ background: '#001a22', color: '#00e5ff', boxShadow: '0 0 0 1px rgba(63,63,70,0.4)' }}
                >
                  {i + 1}
                </span>
                <p className="text-xs" style={{ color: '#A1A1AA' }}>{action}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const TrendIcon =
    briefing.momentumTrend === 'UP'
      ? TrendingUp
      : briefing.momentumTrend === 'DOWN'
      ? TrendingDown
      : Minus;

  const trendColor =
    briefing.momentumTrend === 'UP'
      ? '#10B981'
      : briefing.momentumTrend === 'DOWN'
      ? '#EF4444'
      : '#52525B';

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight" style={{ color: '#FAFAFA' }}>
            Week {briefing.weekNumber} Briefing
          </h1>
          <p className="text-xs mt-0.5" style={{ color: '#71717A' }}>
            Generated {new Date(briefing.generatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-1.5 text-xs rounded-md transition-colors disabled:opacity-40"
            style={{
              background: 'transparent',
              color: '#71717A',
              boxShadow: '0 0 0 1px rgba(63,63,70,0.5)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#27272A';
              (e.currentTarget as HTMLButtonElement).style.color = '#A1A1AA';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              (e.currentTarget as HTMLButtonElement).style.color = '#71717A';
            }}
          >
            {generating ? 'Generating...' : 'Regenerate'}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors disabled:opacity-50"
            style={{ background: '#00e5ff', color: '#09090B' }}
          >
            <Download size={12} />
            {downloading ? 'Downloading...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div
          className="col-span-1 rounded-xl p-3 text-center"
          style={{
            background: 'rgba(24,24,27,0.65)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          <div
            className={cn(
              'text-xl font-semibold px-2 py-0.5 rounded-md inline-block',
              getMomentumColor(briefing.momentumScore)
            )}
          >
            {briefing.momentumScore}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: '#52525B' }}>
            Momentum
          </p>
          <div
            className="flex items-center justify-center gap-0.5 mt-0.5 text-[10px]"
            style={{ color: trendColor }}
          >
            <TrendIcon size={10} />
            <span>{briefing.momentumTrend}</span>
          </div>
        </div>
        <MetricCard label="Apps This Week" value={briefing.applicationsSentThisWeek} />
        <MetricCard
          label="Response Rate"
          value={`${(briefing.responseRate * 100).toFixed(0)}%`}
          sub={`avg ${(briefing.industryAvgResponseRate * 100).toFixed(0)}%`}
          highlight={briefing.responseRate > briefing.industryAvgResponseRate}
        />
        <MetricCard
          label="Interview Rate"
          value={`${(briefing.interviewRate * 100).toFixed(0)}%`}
        />
      </div>

      {/* Categories */}
      {(briefing.bestPerformingCategory || briefing.worstPerformingCategory) && (
        <div className="grid grid-cols-2 gap-3">
          {briefing.bestPerformingCategory && (
            <div
              className="p-4 rounded-xl"
              style={{
                background: 'rgba(24,24,27,0.65)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
              }}
            >
              <p
                className="text-[11px] uppercase tracking-wide font-medium mb-1.5"
                style={{ color: '#10B981' }}
              >
                Best performing
              </p>
              <p className="text-sm" style={{ color: '#A1A1AA' }}>
                {briefing.bestPerformingCategory}
              </p>
            </div>
          )}
          {briefing.worstPerformingCategory && (
            <div
              className="p-4 rounded-xl"
              style={{
                background: 'rgba(24,24,27,0.65)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
              }}
            >
              <p
                className="text-[11px] uppercase tracking-wide font-medium mb-1.5"
                style={{ color: '#EF4444' }}
              >
                Worst performing
              </p>
              <p className="text-sm" style={{ color: '#A1A1AA' }}>
                {briefing.worstPerformingCategory}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Priority actions */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(24,24,27,0.65)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
        }}
      >
        <div className="px-5 py-4" style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}>
          <p
            className="text-[11px] uppercase tracking-wide font-medium"
            style={{ color: '#52525B' }}
          >
            Priority actions this week
          </p>
        </div>
        <div className="px-5 pb-5 space-y-3" style={{ background: 'rgba(9,9,11,0.25)' }}>
          {briefing.priorityActions.map((action, i) => (
            <li key={i} className="flex items-start gap-3 list-none pt-3">
              <span
                className="shrink-0 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-semibold mt-0.5"
                style={{ background: '#001a22', color: '#00e5ff', boxShadow: '0 0 0 1px rgba(63,63,70,0.4)' }}
              >
                {i + 1}
              </span>
              <div className="flex-1">
                <p className="text-sm" style={{ color: '#A1A1AA' }}>
                  {action.action}
                </p>
                {action.dueDate && (
                  <p className="text-[10px] mt-0.5" style={{ color: '#52525B' }}>
                    Due {action.dueDate}
                  </p>
                )}
              </div>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0"
                style={
                  action.impact === 'HIGH'
                    ? {
                        background: 'rgba(69,10,10,0.4)',
                        color: '#F87171',
                        boxShadow: '0 0 0 1px rgba(127,29,29,0.3)',
                      }
                    : action.impact === 'MEDIUM'
                    ? {
                        background: 'rgba(28,20,0,0.6)',
                        color: '#FBBF24',
                        boxShadow: '0 0 0 1px rgba(120,53,15,0.3)',
                      }
                    : {
                        background: '#27272A',
                        color: '#71717A',
                        boxShadow: '0 0 0 1px rgba(63,63,70,0.4)',
                      }
                }
              >
                {action.impact}
              </span>
            </li>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: 'rgba(24,24,27,0.65)',
        backdropFilter: 'blur(12px)',
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
      }}
    >
      <p className="text-xl font-semibold" style={{ color: '#FAFAFA' }}>
        {value}
      </p>
      <p className="text-[10px] mt-0.5" style={{ color: '#52525B' }}>
        {label}
      </p>
      {sub && (
        <p
          className={cn('text-[10px] mt-0.5')}
          style={{ color: highlight ? '#10B981' : '#3F3F46' }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
