import { useEffect, useState, type ReactNode } from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, Lightbulb, ChevronRight, Zap, Search, BarChart3, X, Pencil } from 'lucide-react';
import { getApplications } from '@/lib/api';
import { cn, formatStatus } from '@/lib/utils';
import type { CareerProfile, Application, RejectionPattern, WeeklyBriefing, View } from '@/types';

interface DashboardViewProps {
  profile: Partial<CareerProfile> | null;
  applications: Application[];
  setApplications: (apps: Application[]) => void;
  pattern: RejectionPattern | null;
  briefing: WeeklyBriefing | null;
  uiHints: { showPatternAlert: boolean; highlightStaleApplications: string[]; staleCount: number };
  onNavigate: (view: View) => void;
  onEditProfile: () => void;
}

const PIPELINE_COLUMNS = ['APPLIED', 'NO_RESPONSE', 'PHONE_SCREEN', 'INTERVIEW', 'OFFER'] as const;

function useCountUp(target: number, duration = 600) {
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

const CARD_STYLE = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 18,
  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
  padding: '20px 24px',
};

const STAT_CARD_STYLE = {
  background: 'linear-gradient(to right, #FFFFFF 0%, #C8D0DE 100%)',
  border: '1px solid #E2E8F0',
  borderRadius: 18,
  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
  padding: '20px 24px',
};

export default function DashboardView({
  profile, applications, setApplications, pattern, briefing, uiHints, onNavigate, onEditProfile,
}: DashboardViewProps) {
  const [dataLoading, setDataLoading] = useState(true);
  const [staleAlertDismissed, setStaleAlertDismissed] = useState(false);
  const [patternAlertDismissed, setPatternAlertDismissed] = useState(false);

  useEffect(() => {
    getApplications()
      .then(({ data }) => setApplications(data))
      .catch(console.error)
      .finally(() => setDataLoading(false));
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

  const hasAlerts = (uiHints.staleCount > 0 && !staleAlertDismissed) || (uiHints.showPatternAlert && pattern && !patternAlertDismissed);

  return (
    <div className="p-8 max-w-[900px]" style={{ minHeight: '100%' }}>

      {/* Page header */}
      <div className="mb-6 flex items-center gap-4">
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
          Dashboard
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {profile?.targetRole && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 14px',
                borderRadius: 18,
                border: '1px solid #E2E8F0',
                background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)',
                boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, color: '#0F172A' }}>
                {profile.targetRole}
              </span>
              {profile.targetIndustry && (
                <span style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', marginLeft: 6 }}>
                  · {profile.targetIndustry}
                </span>
              )}
            </div>
          )}

          {!profile?.targetRole && (
            <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8' }}>
              Tell the agent your target role to get started.
            </p>
          )}

          <button
            onClick={onEditProfile}
            title="Edit profile"
            style={{
              width: 26, height: 26, borderRadius: 8, flexShrink: 0,
              background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#C8D0DE', minHeight: 'unset',
              transition: 'color 150ms, background 150ms',
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.color = '#16A34A';
              b.style.background = '#F0FDF4';
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.color = '#C8D0DE';
              b.style.background = 'transparent';
            }}
          >
            <Pencil size={13} />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {dataLoading ? (
          <><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <StatCard
              label="Applications"
              value={totalApps}
              sub={thisWeekApps > 0 ? `+${thisWeekApps} this week` : 'None this week'}
              trend={thisWeekApps > 0 ? 'up' : 'neutral'}
            />
            <StatCard
              label="Response Rate"
              value={responseRate}
              suffix="%"
              sub={totalApps === 0 ? 'No data yet' : responseRate > 15 ? `+${responseRate - 15}pp above avg` : `${15 - responseRate}pp below avg`}
              trend={responseRate >= 15 ? 'up' : totalApps > 0 ? 'down' : 'neutral'}
            />
            <StatCard
              label="Interviews"
              value={interviewed.length}
              sub="reached interview stage"
              trend={interviewed.length > 0 ? 'up' : 'neutral'}
            />
            <MomentumCard score={momentumScore} trend={briefing?.momentumTrend ?? null} />
          </>
        )}
      </div>

      {/* Alerts */}
      {hasAlerts && (
        <div className="space-y-2 mb-6">
          {uiHints.staleCount > 0 && !staleAlertDismissed && (
            <AlertBanner
              variant="warning"
              icon={<AlertTriangle size={13} />}
              title={`${uiHints.staleCount} application${uiHints.staleCount > 1 ? 's' : ''} going cold`}
              sub="No response after 7+ days — consider sending follow-ups"
              onDismiss={() => setStaleAlertDismissed(true)}
            />
          )}
          {uiHints.showPatternAlert && pattern && !patternAlertDismissed && (
            <AlertBanner
              variant="green"
              icon={<Lightbulb size={13} />}
              title="Pattern insight updated"
              sub={`${pattern.totalRejections} data points · ${pattern.dominantPattern.replace(/_/g, ' ').toLowerCase()} detected`}
              onClick={() => onNavigate('insights')}
              cta="View →"
              onDismiss={() => setPatternAlertDismissed(true)}
            />
          )}
        </div>
      )}

      {/* Pipeline preview */}
      <div style={{ ...CARD_STYLE, background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)', padding: 0, overflow: 'hidden' }}>
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid #E2E8F0' }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.01em' }}>Pipeline</span>
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ background: '#DCFCE7', color: '#16A34A' }}
            >
              {totalApps}
            </span>
          </div>
          <button
            className="flex items-center gap-1 transition-colors duration-100"
            style={{ fontSize: 12, color: '#16A34A', fontWeight: 500, minHeight: 'unset' }}
            onClick={() => onNavigate('pipeline')}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#15803D'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#16A34A'; }}
          >
            Full view <ChevronRight size={11} />
          </button>
        </div>

        {dataLoading ? (
          <div className="px-5 py-5"><DashboardPipelineSkeleton /></div>
        ) : (
          <div className="flex gap-0 overflow-x-auto">
            {PIPELINE_COLUMNS.map((status, i) => (
              <PipelineColumn
                key={status}
                status={status}
                apps={applications.filter((a) => a.status === status)}
                highlightIds={uiHints.highlightStaleApplications}
                isLast={i === PIPELINE_COLUMNS.length - 1}
              />
            ))}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!dataLoading && totalApps === 0 && (
        <div className="mt-4">
          <EmptyStateCTA profile={profile} onNavigate={onNavigate} />
        </div>
      )}

    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div style={CARD_STYLE}>
      <div className="h-2.5 rounded animate-pulse mb-4" style={{ background: '#F1F5F9', width: '35%' }} />
      <div className="h-8 rounded animate-pulse mb-3" style={{ background: '#F1F5F9', width: '45%' }} />
      <div className="h-2.5 rounded animate-pulse" style={{ background: '#F1F5F9', width: '60%' }} />
    </div>
  );
}

function DashboardPipelineSkeleton() {
  return (
    <div className="flex gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex-1">
          <div className="h-2.5 rounded animate-pulse mb-3" style={{ background: '#F1F5F9', width: '60%' }} />
          <div className="space-y-2">
            <div className="rounded-lg animate-pulse h-14" style={{ background: '#F8FAFC' }} />
            <div className="rounded-lg animate-pulse h-14" style={{ background: '#F8FAFC' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  label, value, suffix = '', sub, trend,
}: {
  label: string;
  value: number;
  suffix?: string;
  sub: string;
  trend: 'up' | 'down' | 'neutral';
}) {
  const animated = useCountUp(value);

  return (
    <div style={STAT_CARD_STYLE}>
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10 }}>
        {label}
      </p>
      <p style={{ fontSize: 34, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 10 }}>
        {animated}<span style={{ fontSize: 15, fontWeight: 300, color: '#94A3B8', marginLeft: 4 }}>{suffix}</span>
      </p>
      <div className="flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
        {trend === 'up' && <TrendingUp size={11} style={{ color: '#16A34A', flexShrink: 0 }} />}
        {trend === 'down' && <TrendingDown size={11} style={{ color: '#DC2626', flexShrink: 0 }} />}
        <p style={{
          fontSize: 12,
          fontWeight: 300,
          color: trend === 'up' ? '#16A34A' : trend === 'down' ? '#DC2626' : '#94A3B8',
        }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

function MomentumCard({ score, trend }: { score: number | null; trend: string | null }) {
  const animated = useCountUp(score ?? 0);

  return (
    <div style={STAT_CARD_STYLE}>
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10 }}>
        Momentum
      </p>

      {score !== null ? (
        <>
          <div className="flex items-baseline gap-1.5" style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 34, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {animated}
            </p>
            <p style={{ fontSize: 14, fontWeight: 300, color: '#94A3B8' }}>/100</p>
          </div>
          <div className="flex items-center gap-1.5" style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
            {trend === 'UP' && <TrendingUp size={11} style={{ color: '#16A34A', flexShrink: 0 }} />}
            {trend === 'DOWN' && <TrendingDown size={11} style={{ color: '#DC2626', flexShrink: 0 }} />}
            <p style={{
              fontSize: 12,
              fontWeight: 300,
              color: trend === 'UP' ? '#16A34A' : trend === 'DOWN' ? '#DC2626' : '#94A3B8',
            }}>
              {trend === 'UP' ? 'Rising from last week' : trend === 'DOWN' ? 'Falling from last week' : 'Stable from last week'}
            </p>
          </div>
        </>
      ) : (
        <>
          <p style={{ fontSize: 34, fontWeight: 700, color: '#E2E8F0', letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 10 }}>
            —
          </p>
          <p style={{ fontSize: 12, fontWeight: 300, color: '#94A3B8', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 10 }}>
            Generate your first briefing
          </p>
        </>
      )}
    </div>
  );
}

function AlertBanner({
  variant, icon, title, sub, onClick, cta, onDismiss,
}: {
  variant: 'green' | 'warning';
  icon: ReactNode;
  title: string;
  sub: string;
  onClick?: () => void;
  cta?: string;
  onDismiss?: () => void;
}) {
  const s = {
    bg: variant === 'warning' ? '#FFFBEB' : '#F0FDF4',
    border: variant === 'warning' ? '#FDE68A' : '#BBF7D0',
    iconColor: variant === 'warning' ? '#D97706' : '#16A34A',
    titleColor: variant === 'warning' ? '#92400E' : '#15803D',
    subColor: variant === 'warning' ? '#B45309' : '#166534',
    ctaColor: variant === 'warning' ? '#D97706' : '#16A34A',
  };

  return (
    <div
      onClick={onClick}
      className={cn('w-full text-left flex items-center gap-3', onClick && 'cursor-pointer')}
      style={{
        position: 'relative',
        padding: '12px 16px',
        paddingRight: onDismiss ? 34 : 16,
        borderRadius: 18,
        background: s.bg,
        border: `1px solid ${s.border}`,
      }}
    >
      <span style={{ color: s.iconColor, flexShrink: 0 }}>{icon}</span>
      <div className="flex-1 min-w-0">
        <p style={{ fontSize: 13, fontWeight: 600, color: s.titleColor }}>{title}</p>
        <p style={{ fontSize: 12, fontWeight: 300, color: s.subColor, marginTop: 1 }}>{sub}</p>
      </div>
      {cta && (
        <span style={{ fontSize: 12, fontWeight: 600, color: s.ctaColor, flexShrink: 0 }}>{cta}</span>
      )}
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: variant === 'warning' ? '#FDE68A' : '#86EFAC',
            minHeight: 'unset',
            transition: 'background 120ms, color 120ms',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = variant === 'warning' ? '#FEF3C7' : '#DCFCE7';
            (e.currentTarget as HTMLButtonElement).style.color = variant === 'warning' ? '#D97706' : '#15803D';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = variant === 'warning' ? '#FDE68A' : '#86EFAC';
          }}
        >
          <X size={11} />
        </button>
      )}
    </div>
  );
}

function PipelineColumn({
  status, apps, highlightIds, isLast,
}: {
  status: string;
  apps: Application[];
  highlightIds: string[];
  isLast: boolean;
}) {
  return (
    <div
      className="flex-1 min-w-0 px-4 py-4"
      style={{ borderRight: isLast ? 'none' : '1px solid #E2E8F0' }}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>
          {formatStatus(status)}
        </span>
        <span
          style={{ fontSize: 11, fontWeight: 600, color: '#16A34A', background: '#DCFCE7', padding: '1px 5px', borderRadius: 4 }}
        >
          {apps.length}
        </span>
      </div>
      <div className="space-y-2">
        {apps.slice(0, 3).map((app) => (
          <PipelineCard key={app._id} app={app} highlight={highlightIds.includes(app._id)} />
        ))}
        {apps.length === 0 && (
          <div
            className="flex items-center justify-center"
            style={{ height: 52, borderRadius: 18, border: '1px dashed #BBF7D0' }}
          >
            <span style={{ fontSize: 11, color: '#86EFAC' }}>Empty</span>
          </div>
        )}
        {apps.length > 3 && (
          <p style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', paddingTop: 4 }}>
            +{apps.length - 3} more
          </p>
        )}
      </div>
    </div>
  );
}

function PipelineCard({ app, highlight }: { app: Application; highlight: boolean }) {
  const isStale = app.daysSinceApply > 7 || highlight;

  return (
    <div
      style={{
        background: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        padding: '8px 10px',
      }}
    >
      <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {app.company}
      </p>
      <p style={{ fontSize: 11, fontWeight: 300, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
        {app.role}
      </p>
      <p style={{ fontSize: 11, fontWeight: 300, color: isStale ? '#D97706' : '#94A3B8', marginTop: 3 }}>
        {app.daysSinceApply}d ago
      </p>
    </div>
  );
}

function EmptyStateCTA({ profile, onNavigate }: { profile: Partial<CareerProfile> | null; onNavigate: (v: View) => void }) {
  const hasProfile = !!profile?.targetRole;
  const steps = [
    {
      num: '1',
      icon: <Zap size={12} />,
      title: hasProfile ? 'Profile built' : 'Build your profile',
      sub: hasProfile ? `Targeting ${profile!.targetRole}` : 'Tell the agent your role, experience, and goals in the chat panel',
      done: hasProfile,
    },
    {
      num: '2',
      icon: <Search size={12} />,
      title: 'Analyze a job',
      sub: 'Paste any job description for an instant match score and tailored cover letter',
      done: false,
      action: () => onNavigate('analyze'),
      cta: 'Open Analyzer →',
    },
    {
      num: '3',
      icon: <BarChart3 size={12} />,
      title: 'Track 3+ rejections',
      sub: "Unlock Rejection Intelligence — the tool that tells you why you're failing",
      done: false,
    },
  ];

  return (
    <div style={{ ...CARD_STYLE }}>
      <div className="flex items-center justify-between mb-4" style={{ paddingBottom: 12, borderBottom: '1px solid #F1F5F9' }}>
        <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94A3B8' }}>
          Getting started
        </p>
        <span
          style={{ fontSize: 11, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 20 }}
        >
          {steps.filter((s) => s.done).length} / {steps.length}
        </span>
      </div>

      <div className="space-y-0">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center" style={{ width: 24 }}>
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: step.done ? '#F0FDF4' : '#F8FAFC',
                    border: step.done ? '1.5px solid #16A34A' : '1.5px solid #E2E8F0',
                    color: step.done ? '#16A34A' : '#94A3B8',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {step.done ? (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4.2 7.2L8 3" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    step.num
                  )}
                </div>
                {!isLast && (
                  <div
                    style={{
                      flex: 1,
                      width: 1,
                      background: step.done ? '#BBF7D0' : '#E2E8F0',
                      minHeight: 20,
                      margin: '3px 0',
                    }}
                  />
                )}
              </div>

              <div className={cn('flex-1', isLast ? 'pb-1' : 'pb-4')}>
                <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: step.done ? '#94A3B8' : '#0F172A' }}>
                    {step.title}
                  </p>
                  {step.done && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: '#F0FDF4', color: '#16A34A', padding: '1px 6px', borderRadius: 4 }}>
                      Done
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 1.5 }}>
                  {step.sub}
                </p>
                {step.action && (
                  <button
                    onClick={step.action}
                    style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#16A34A', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 'unset' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#15803D'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#16A34A'; }}
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
