import { useEffect, useState, type ReactNode } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb, ChevronRight, Clock, Zap, Search, BarChart3 } from 'lucide-react';
import { getApplications } from '@/lib/api';
import { cn, formatStatus, getMomentumColor } from '@/lib/utils';
import type { CareerProfile, Application, RejectionPattern, WeeklyBriefing, View } from '@/types';

interface DashboardViewProps {
  profile: Partial<CareerProfile> | null;
  applications: Application[];
  setApplications: (apps: Application[]) => void;
  pattern: RejectionPattern | null;
  briefing: WeeklyBriefing | null;
  uiHints: { showPatternAlert: boolean; highlightStaleApplications: string[]; staleCount: number };
  onNavigate: (view: View) => void;
}

const PIPELINE_COLUMNS = ['APPLIED', 'NO_RESPONSE', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER'] as const;

// Smooth count-up hook
function useCountUp(target: number, duration = 700) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const progress = frame / totalFrames;
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));
      if (frame >= totalFrames) { setCount(target); clearInterval(timer); }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

export default function DashboardView({
  profile, applications, setApplications, pattern, briefing, uiHints, onNavigate,
}: DashboardViewProps) {
  useEffect(() => {
    getApplications().then(({ data }) => setApplications(data)).catch(console.error);
  }, [setApplications]);

  const totalApps = applications.length;
  const responded = applications.filter((a) => !['APPLIED', 'NO_RESPONSE'].includes(a.status));
  const interviewed = applications.filter((a) => ['INTERVIEW', 'OFFER'].includes(a.status));
  const responseRate = totalApps > 0 ? Math.round((responded.length / totalApps) * 100) : 0;
  const momentumScore = briefing?.momentumScore ?? null;
  const thisWeekApps = applications.filter((a) => {
    const d = new Date(a.appliedDate);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return d >= weekAgo;
  }).length;

  const hasAlerts = uiHints.staleCount > 0 || uiHints.showPatternAlert;

  return (
    <div className="p-6 space-y-7 max-w-[940px]">

      {/* ── Brand header ──────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            style={{
              fontSize: '32px',
              lineHeight: 1,
              fontFamily: '"Pixelify Sans", monospace',
              fontWeight: 700,
            }}
          >
            <span style={{ color: '#FAFAFA' }}>Hire</span><span style={{ color: '#00e5ff' }}>IQ</span>
          </h1>
          <p className="text-[12px] mt-1" style={{ color: '#52525B' }}>
            {profile?.targetRole ? (
              <>
                Targeting{' '}
                <span style={{ color: '#A1A1AA' }}>{profile.targetRole}</span>
                {profile.targetIndustry && <span style={{ color: '#3F3F46' }}> · {profile.targetIndustry}</span>}
              </>
            ) : (
              'Tell the agent your target role to get started.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: '#3F3F46' }}>
          <Clock size={11} />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
        </div>
      </div>

      {/* ── Stat Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Applications"
          value={totalApps}
          sub={`${thisWeekApps > 0 ? `+${thisWeekApps}` : thisWeekApps} this week`}
          trend={thisWeekApps > 0 ? 'up' : 'neutral'}
          accentColor="#00e5ff"
        />
        <StatCard
          label="Response Rate"
          value={responseRate}
          suffix="%"
          sub={responseRate > 15 ? `+${responseRate - 15}pp vs avg` : `${15 - responseRate}pp below avg`}
          trend={responseRate >= 15 ? 'up' : totalApps > 0 ? 'down' : 'neutral'}
          accentColor={responseRate >= 15 ? '#10B981' : totalApps > 0 ? '#EF4444' : '#3F3F46'}
        />
        <StatCard
          label="Interviews"
          value={interviewed.length}
          sub="reached interview stage"
          trend={interviewed.length > 0 ? 'up' : 'neutral'}
          accentColor={interviewed.length > 0 ? '#10B981' : '#3F3F46'}
        />
        <MomentumCard
          score={momentumScore}
          trend={briefing?.momentumTrend ?? null}
        />
      </div>

      {/* ── Alerts ────────────────────────────────────────────── */}
      {hasAlerts && (
        <div className="space-y-2">
          {uiHints.staleCount > 0 && (
            <AlertBanner
              variant="amber"
              icon={<AlertTriangle size={13} />}
              title={`${uiHints.staleCount} application${uiHints.staleCount > 1 ? 's' : ''} going cold`}
              sub="No response after 7+ days — consider sending follow-ups"
            />
          )}
          {uiHints.showPatternAlert && pattern && (
            <AlertBanner
              variant="indigo"
              icon={<Lightbulb size={13} />}
              title="Pattern insight updated"
              sub={`${pattern.totalRejections} data points — ${pattern.dominantPattern.replace(/_/g, ' ').toLowerCase()} detected`}
              onClick={() => onNavigate('insights')}
              cta="View →"
            />
          )}
        </div>
      )}

      {/* ── Pipeline ──────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold" style={{ color: '#FAFAFA' }}>Pipeline</h2>
            <span
              className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(39,39,42,0.60)', color: '#52525B' }}
            >
              {totalApps}
            </span>
          </div>
          <button
            className="flex items-center gap-1 text-xs transition-colors"
            style={{ color: '#52525B' }}
            onClick={() => onNavigate('pipeline')}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#00e5ff'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#52525B'; }}
          >
            Full view <ChevronRight size={12} />
          </button>
        </div>

        {/* Stage funnel bar */}
        {totalApps > 0 && (
          <FunnelBar applications={applications} />
        )}

        <div className="flex gap-2.5 overflow-x-auto pb-1 mt-4">
          {PIPELINE_COLUMNS.map((status) => (
            <PipelineColumn
              key={status}
              status={status}
              apps={applications.filter((a) => a.status === status)}
              highlightIds={uiHints.highlightStaleApplications}
            />
          ))}
        </div>
      </div>

      {/* ── Empty state CTA ────────────────────────────────────── */}
      {totalApps === 0 && (
        <EmptyStateCTA profile={profile} onNavigate={onNavigate} />
      )}

      {/* ── Skills on file ────────────────────────────────────── */}
      {profile?.skills && profile.skills.length > 0 && (
        <div
          className="p-4 rounded-xl"
          style={{ background: 'rgba(18,18,27,0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)' }}
        >
          <p className="text-[11px] mb-3 uppercase tracking-widest font-medium" style={{ color: '#3F3F46' }}>
            Skills on file
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.skills.slice(0, 16).map((skill) => (
              <span
                key={skill}
                className="text-[11px] px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(39,39,42,0.60)', color: '#71717A' }}
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────


function StatCard({
  label, value, suffix = '', sub, trend, accentColor,
}: {
  label: string;
  value: number;
  suffix?: string;
  sub: string;
  trend: 'up' | 'down' | 'neutral';
  accentColor: string;
}) {
  const animated = useCountUp(value);

  return (
    <div
      className="rounded-xl p-4 flex flex-col relative overflow-hidden"
      style={{
        background: 'rgba(18,18,27,0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20), 0 0 18px rgba(0,229,255,0.08)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-16 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, ${accentColor}0d, transparent)` }}
      />

      <p className="text-[10px] uppercase tracking-widest font-semibold mb-4 relative" style={{ color: '#52525B', letterSpacing: '0.1em' }}>
        {label}
      </p>

      <p className="text-[38px] font-bold tabular-nums leading-none mb-3 relative" style={{ color: '#FAFAFA', letterSpacing: '-0.04em' }}>
        {animated}<span style={{ fontSize: 22, fontWeight: 600, color: '#3F3F46', marginLeft: 4 }}>{suffix}</span>
      </p>

      <div className="flex items-center gap-1.5 relative mt-auto pt-3" style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.05)' }}>
        {trend === 'up' && <TrendingUp size={11} className="text-emerald-500 shrink-0" />}
        {trend === 'down' && <TrendingDown size={11} className="text-red-400 shrink-0" />}
        <p
          className="text-[11px] font-medium"
          style={{
            color: trend === 'up' ? '#10B981' : trend === 'down' ? '#EF4444' : '#3F3F46',
          }}
        >
          {sub}
        </p>
      </div>
    </div>
  );
}

function MomentumCard({ score, trend }: { score: number | null; trend: string | null }) {
  const animated = useCountUp(score ?? 0);
  const accentColor = score === null ? '#3F3F46' : score <= 40 ? '#EF4444' : score <= 70 ? '#F59E0B' : '#10B981';

  return (
    <div
      className="rounded-xl p-4 flex flex-col relative overflow-hidden"
      style={{
        background: 'rgba(18,18,27,0.55)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20), 0 0 18px rgba(0,229,255,0.08)',
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-16 pointer-events-none"
        style={{ background: `linear-gradient(to bottom, ${accentColor}0d, transparent)` }}
      />

      <p className="text-[11px] uppercase tracking-widest font-medium mb-3 relative" style={{ color: '#52525B' }}>
        Momentum
      </p>

      {score !== null ? (
        <>
          <div className="flex items-end gap-2 mb-2 relative">
            <p className="text-[32px] font-semibold tabular-nums leading-none" style={{ color: '#FAFAFA', letterSpacing: '-0.03em' }}>
              {animated}
            </p>
            <p className="text-base font-medium mb-1" style={{ color: '#3F3F46' }}>/100</p>
          </div>
          {/* bar */}
          <div className="h-1 rounded-full overflow-hidden mb-2 relative" style={{ background: '#27272A' }}>
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width: `${score}%`, background: accentColor }}
            />
          </div>
          <p className="text-[11px] font-medium relative" style={{
            color: trend === 'UP' ? '#10B981' : trend === 'DOWN' ? '#EF4444' : '#3F3F46',
          }}>
            {trend === 'UP' ? '▲ trending up' : trend === 'DOWN' ? '▼ trending down' : '— stable'}
          </p>
        </>
      ) : (
        <p className="text-[32px] font-semibold tabular-nums leading-none mb-2 relative" style={{ color: '#27272A', letterSpacing: '-0.03em' }}>
          —
        </p>
      )}
    </div>
  );
}

function AlertBanner({
  variant, icon, title, sub, onClick, cta,
}: {
  variant: 'amber' | 'indigo';
  icon: ReactNode;
  title: string;
  sub: string;
  onClick?: () => void;
  cta?: string;
}) {
  const isAmber = variant === 'amber';
  const style = isAmber
    ? { bg: 'rgba(28,20,0,0.7)', border: 'rgba(245,158,11,0.15)', accent: '#F59E0B', title: '#FBBF24', sub: '#92400E' }
    : { bg: 'rgba(0,30,40,0.6)', border: 'rgba(0,229,255,0.2)', accent: '#00e5ff', title: '#67e8f9', sub: '#0891b2' };

  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      {...(onClick ? { onClick } : {})}
      className={cn('w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl transition-colors duration-150', onClick && 'cursor-pointer')}
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
      }}
      {...(onClick ? {
        onMouseEnter: (e: React.MouseEvent) => {
          (e.currentTarget as HTMLElement).style.filter = 'brightness(1.1)';
        },
        onMouseLeave: (e: React.MouseEvent) => {
          (e.currentTarget as HTMLElement).style.filter = '';
        },
      } : {})}
    >
      <span style={{ color: style.accent, marginTop: 1 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: style.title }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: style.sub }}>{sub}</p>
      </div>
      {cta && (
        <span className="text-xs self-center shrink-0 font-medium" style={{ color: style.accent }}>
          {cta}
        </span>
      )}
    </Tag>
  );
}

// Shows a visual funnel/ratio of pipeline stages
function FunnelBar({ applications }: { applications: Application[] }) {
  const total = applications.length;
  if (total === 0) return null;

  const stages = [
    { key: 'APPLIED', color: '#3F3F46' },
    { key: 'NO_RESPONSE', color: '#F59E0B' },
    { key: 'PHONE_SCREEN', color: '#00e5ff' },
    { key: 'INTERVIEW', color: '#10B981' },
    { key: 'OFFER', color: '#10B981' },
    { key: 'REJECTED', color: '#EF4444' },
  ];

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
      {stages.map(({ key, color }) => {
        const count = applications.filter((a) => a.status === key).length;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <div
            key={key}
            title={`${formatStatus(key)}: ${count}`}
            className="h-full transition-all duration-500"
            style={{ width: `${pct}%`, background: color, minWidth: 2 }}
          />
        );
      })}
    </div>
  );
}

const COLUMN_COLORS: Record<string, string> = {
  APPLIED: '#71717A',
  NO_RESPONSE: '#71717A',
  PHONE_SCREEN: '#71717A',
  INTERVIEW: '#71717A',
  OFFER: '#71717A',
};

function PipelineColumn({
  status, apps, highlightIds,
}: {
  status: string;
  apps: Application[];
  highlightIds: string[];
}) {
  const color = COLUMN_COLORS[status] ?? '#52525B';

  return (
    <div className="shrink-0 w-44">
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color }}>
          {formatStatus(status)}
        </span>
        <span
          className="text-[10px] tabular-nums font-semibold"
          style={{ color: '#FAFAFA' }}
        >
          {apps.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {apps.slice(0, 3).map((app) => (
          <PipelineCard key={app._id} app={app} highlight={highlightIds.includes(app._id)} />
        ))}
        {apps.length === 0 && (
          <div
            className="h-16 flex items-center justify-center rounded-lg"
            style={{ boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)' }}
          >
            <span className="text-[10px]" style={{ color: '#3F3F46' }}>Empty</span>
          </div>
        )}
        {apps.length > 3 && (
          <p className="text-[10px] text-center py-0.5" style={{ color: '#3F3F46' }}>
            +{apps.length - 3} more
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyStateCTA({ profile, onNavigate }: { profile: Partial<CareerProfile> | null; onNavigate: (v: View) => void }) {
  const hasProfile = !!profile?.targetRole;
  const steps = [
    {
      num: '1',
      icon: <Zap size={13} />,
      title: hasProfile ? 'Profile built' : 'Build your profile',
      sub: hasProfile ? `Targeting ${profile!.targetRole}` : 'Tell the agent your role, experience, and goals in the chat panel →',
      done: hasProfile,
    },
    {
      num: '2',
      icon: <Search size={13} />,
      title: 'Analyze a job',
      sub: 'Paste any job description for an instant match score and tailored cover letter',
      done: false,
      action: () => onNavigate('analyze'),
      cta: 'Open Analyzer →',
    },
    {
      num: '3',
      icon: <BarChart3 size={13} />,
      title: 'Track 3+ rejections',
      sub: 'Unlock Rejection Intelligence — the only tool that tells you why you\'re failing',
      done: false,
    },
  ];

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(18,18,27,0.55)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: '#52525B' }}>
          Getting started
        </p>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: '#27272A', color: '#52525B' }}
        >
          {steps.filter(s => s.done).length} / {steps.length}
        </span>
      </div>

      {/* Steps */}
      <div className="px-5 py-4 space-y-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex gap-4">
              {/* Left col: node + line */}
              <div className="flex flex-col items-center" style={{ width: 28 }}>
                {/* node circle */}
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[11px] font-bold"
                  style={{
                    background: step.done ? '#001a22' : '#27272A',
                    boxShadow: step.done ? '0 0 0 1.5px #00e5ff' : '0 0 0 1.5px rgba(255,255,255,0.08)',
                    color: step.done ? '#00e5ff' : '#52525B',
                    zIndex: 1,
                  }}
                >
                  {step.done ? (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M2 5.5L4.5 8L9 3" stroke="#00e5ff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    step.num
                  )}
                </div>
                {/* connector line */}
                {!isLast && (
                  <div
                    className="flex-1 w-px my-1"
                    style={{
                      background: step.done ? '#00e5ff' : '#3F3F46',
                      minHeight: 28,
                      opacity: step.done ? 0.4 : 1,
                    }}
                  />
                )}
              </div>

              {/* Right col: content */}
              <div className={cn('flex-1', isLast ? 'pb-1' : 'pb-4')}>
                <div className="flex items-center gap-2 mt-0.5">
                  <p
                    className="text-sm font-medium"
                    style={{ color: step.done ? '#71717A' : '#FAFAFA' }}
                  >
                    {step.title}
                  </p>
                  {step.done && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{
                        background: '#001a22',
                        color: '#00e5ff',
                        border: '1px solid rgba(99,102,241,0.25)',
                      }}
                    >
                      Done
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#52525B' }}>
                  {step.sub}
                </p>
                {step.action && (
                  <button
                    onClick={step.action}
                    className="mt-2 text-[11px] font-semibold transition-colors"
                    style={{ color: '#00e5ff' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#67e8f9'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#00e5ff'; }}
                  >
                    {step.cta}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PipelineCard({ app, highlight }: { app: Application; highlight: boolean }) {
  const isStale = app.daysSinceApply > 7;
  const showAmber = isStale || highlight;

  return (
    <div
      className="p-2.5 rounded-lg"
      style={{
        background: '#131316',
        boxShadow: '0 1px 4px 0 rgba(0,0,0,0.16)',
      }}
    >
      <p className="text-[12px] font-semibold truncate leading-tight" style={{ color: '#E4E4E7' }}>
        {app.company}
      </p>
      <p className="text-[11px] truncate mt-0.5" style={{ color: '#52525B' }}>
        {app.role}
      </p>
      <p
        className="text-[10px] mt-1.5"
        style={{ color: showAmber ? '#F59E0B' : '#3F3F46' }}
      >
        {app.daysSinceApply}d ago
      </p>
    </div>
  );
}
