import {
  Target,
  TrendingDown,
  Briefcase,
  Zap,
  FileSearch,
  Mail,
  BarChart3,
  User,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import type { AgentDashboard, ProactiveAction } from '@/types';

const PATTERN_LABELS: Record<string, string> = {
  PRE_INTERVIEW: 'Resume / ATS filter',
  POST_INTERVIEW: 'Interview skills gap',
  FINAL_ROUND: 'Final round drop-off',
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  APPLIED: { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' },
  NO_RESPONSE: { bg: '#FFF7ED', text: '#C2410C', border: '#FED7AA' },
  PHONE_SCREEN: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  INTERVIEW: { bg: '#F0FDF4', text: '#15803D', border: '#BBF7D0' },
  OFFER: { bg: '#ECFDF5', text: '#047857', border: '#6EE7B7' },
  REJECTED: { bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA' },
};

export interface QuickAction {
  id: string;
  label: string;
  message: string;
  icon: 'analyze' | 'pattern' | 'briefing' | 'profile' | 'followup';
}

const DEFAULT_ACTIONS: QuickAction[] = [
  { id: 'analyze', label: 'Analyze a job', message: 'Paste a job description below and I\'ll score it against your profile.', icon: 'analyze' },
  { id: 'pattern', label: 'Why am I failing?', message: 'run pattern analysis', icon: 'pattern' },
  { id: 'briefing', label: 'Weekly briefing', message: 'generate weekly briefing', icon: 'briefing' },
  { id: 'profile', label: 'Edit profile', message: 'edit my profile', icon: 'profile' },
];

interface AgentCommandCenterProps {
  dashboard: AgentDashboard | null;
  proactiveActions?: ProactiveAction[];
  pendingDrafts?: number;
  onQuickAction: (message: string) => void;
  onProactiveAction?: (action: ProactiveAction) => void;
  onLoadDemo?: () => void;
  demoLoading?: boolean;
  disabled?: boolean;
}

function ActionIcon({ icon }: { icon: QuickAction['icon'] }) {
  const props = { size: 14, strokeWidth: 2 };
  switch (icon) {
    case 'analyze': return <FileSearch {...props} />;
    case 'pattern': return <TrendingDown {...props} />;
    case 'briefing': return <BarChart3 {...props} />;
    case 'profile': return <User {...props} />;
    case 'followup': return <Mail {...props} />;
    default: return <Zap {...props} />;
  }
}

function patternHeadline(pattern: AgentDashboard['pattern']): string {
  if (!pattern) return '';
  if (pattern.dominantPattern) {
    return PATTERN_LABELS[pattern.dominantPattern] || pattern.dominantPattern.replace(/_/g, ' ');
  }
  if (pattern.readyForAnalysis) return `${pattern.totalRejections} rejections — ready to analyze`;
  return '';
}

export default function AgentCommandCenter({
  dashboard,
  proactiveActions = [],
  pendingDrafts = 0,
  onQuickAction,
  onProactiveAction,
  onLoadDemo,
  demoLoading = false,
  disabled = false,
}: AgentCommandCenterProps) {
  const stats = dashboard?.stats;
  const pattern = dashboard?.pattern;
  const patternTitle = patternHeadline(pattern ?? null);
  const isEmpty = !stats || (stats.totalApplications === 0 && stats.jobsAnalyzed === 0);

  return (
    <aside
      style={{
        width: 300,
        flexShrink: 0,
        borderRight: '1px solid #E2E8F0',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'Poppins, sans-serif',
      }}
    >
      {/* Hero tagline */}
      <div style={{
        padding: '16px 16px 14px',
        borderBottom: '1px solid #E2E8F0',
        background: 'linear-gradient(135deg, #F0FDF4 0%, #FFFFFF 55%)',
      }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }}>
          Your career agent
        </p>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', lineHeight: 1.45, margin: 0 }}>
          Most AIs help you apply.{' '}
          <span style={{ color: '#15803D' }}>RetrofitAI finds why you're failing — and fixes it.</span>
        </p>
      </div>

      <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Profile card */}
        {dashboard?.profileSummary && (
          <div style={{
            padding: '12px 14px', borderRadius: 14,
            background: BUBBLE_GRADIENT, border: '1px solid #E2E8F0',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Target size={15} color="#fff" />
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {dashboard.profileSummary.currentRole || 'Set up your profile'}
                </p>
                <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  → {dashboard.profileSummary.targetRole || 'Add target role'}
                </p>
              </div>
            </div>
            {dashboard.profileSummary.skills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {dashboard.profileSummary.skills.map((s) => (
                  <span key={s} style={{ fontSize: 9, fontWeight: 600, padding: '3px 7px', borderRadius: 6, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pattern alert — the wow moment */}
        {patternTitle && (
          <div style={{
            padding: '12px 14px', borderRadius: 14,
            background: pattern?.dominantPattern ? 'linear-gradient(135deg, #FEF2F2 0%, #FFF7ED 100%)' : 'linear-gradient(135deg, #FFFBEB 0%, #FEF9C3 100%)',
            border: `1px solid ${pattern?.dominantPattern ? '#FECACA' : '#FDE68A'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <AlertTriangle size={16} color={pattern?.dominantPattern ? '#DC2626' : '#D97706'} style={{ flexShrink: 0, marginTop: 1 }} />
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, color: pattern?.dominantPattern ? '#B91C1C' : '#B45309', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
                  {pattern?.dominantPattern ? 'Failure pattern detected' : 'Pattern ready'}
                </p>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
                  {patternTitle}
                </p>
                {pattern?.insight && (
                  <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.45, margin: 0 }}>
                    {pattern.insight.length > 120 ? `${pattern.insight.slice(0, 120)}…` : pattern.insight}
                  </p>
                )}
                {pattern?.patternConfidence && (
                  <span style={{ display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FFFFFF', color: '#B91C1C', border: '1px solid #FECACA' }}>
                    {pattern.patternConfidence} confidence
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats row */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Applications', value: stats.totalApplications, icon: Briefcase },
              { label: 'Rejections', value: stats.rejections, icon: TrendingDown, highlight: stats.rejections >= 3 },
              { label: 'Response rate', value: `${stats.responseRate}%`, icon: BarChart3 },
              { label: 'Jobs scored', value: stats.jobsAnalyzed, icon: FileSearch },
            ].map(({ label, value, icon: Icon, highlight }) => (
              <div key={label} style={{
                padding: '10px 12px', borderRadius: 12,
                background: highlight ? '#FEF2F2' : '#F8FAFC',
                border: `1px solid ${highlight ? '#FECACA' : '#E2E8F0'}`,
              }}>
                <Icon size={12} color={highlight ? '#DC2626' : '#94A3B8'} />
                <p style={{ fontSize: 18, fontWeight: 700, color: highlight ? '#B91C1C' : '#0F172A', margin: '4px 0 0', lineHeight: 1 }}>
                  {value}
                </p>
                <p style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Momentum */}
        {dashboard?.briefing && (
          <div style={{ padding: '10px 12px', borderRadius: 12, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>
              Week {dashboard.briefing.weekNumber} momentum
            </p>
            <p style={{ fontSize: 22, fontWeight: 700, color: '#15803D', margin: 0 }}>
              {dashboard.briefing.momentumScore}<span style={{ fontSize: 12, fontWeight: 500 }}>/100</span>
              <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 8, color: '#64748B' }}>{dashboard.briefing.momentumTrend}</span>
            </p>
          </div>
        )}

        {isEmpty && onLoadDemo && (
          <button
            type="button"
            disabled={disabled || demoLoading}
            onClick={onLoadDemo}
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 14, border: 'none', cursor: demoLoading ? 'wait' : 'pointer',
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              color: '#FFFFFF', fontFamily: 'inherit', textAlign: 'left',
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 4px', opacity: 0.9 }}>Demo for judges</p>
            <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>
              {demoLoading ? 'Loading Alex Chen scenario…' : 'Load demo profile + 3 rejections →'}
            </p>
          </button>
        )}

        {/* Quick actions */}
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
            What I can do
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEFAULT_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                disabled={disabled}
                onClick={() => onQuickAction(action.message)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 12, border: '1px solid #E2E8F0',
                  background: '#FFFFFF', cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left', fontFamily: 'inherit', opacity: disabled ? 0.6 : 1,
                  transition: 'border-color 150ms, background 150ms',
                }}
              >
                <span style={{ color: '#16A34A', flexShrink: 0 }}><ActionIcon icon={action.icon} /></span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#374151' }}>{action.label}</span>
                <ChevronRight size={12} color="#CBD5E1" />
              </button>
            ))}
          </div>
        </div>

        {/* Proactive actions from agent */}
        {proactiveActions.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Agent recommends
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {proactiveActions.slice(0, 4).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => onProactiveAction?.(action)}
                  style={{
                    padding: '9px 12px', borderRadius: 12,
                    border: '1px solid #BBF7D0', background: '#F0FDF4',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 11, fontWeight: 600, color: '#15803D',
                    textAlign: 'left', fontFamily: 'inherit',
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {pendingDrafts > 0 && (
          <div style={{ padding: '10px 12px', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A' }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#B45309', margin: 0 }}>
              {pendingDrafts} draft{pendingDrafts !== 1 ? 's' : ''} awaiting your approval in chat →
            </p>
          </div>
        )}

        {/* Pipeline mini-list */}
        {dashboard && dashboard.applications.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Your pipeline
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {dashboard.applications.map((app) => {
                const colors = STATUS_COLORS[app.status] || STATUS_COLORS.APPLIED;
                return (
                  <div key={app._id} style={{
                    padding: '8px 10px', borderRadius: 10,
                    background: colors.bg, border: `1px solid ${colors.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {app.company}
                      </p>
                      <p style={{ fontSize: 9, color: '#94A3B8', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {app.role}
                      </p>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: '#FFFFFF', color: colors.text, border: `1px solid ${colors.border}`, flexShrink: 0 }}>
                      {app.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Top job matches */}
        {dashboard && dashboard.topJobs.length > 0 && (
          <div>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>
              Top matches
            </p>
            {dashboard.topJobs.map((job) => (
              <div key={job._id} style={{
                padding: '8px 10px', borderRadius: 10, marginBottom: 6,
                background: '#F8FAFC', border: '1px solid #E2E8F0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', margin: 0 }}>{job.company}</p>
                  <p style={{ fontSize: 9, color: '#94A3B8', margin: '2px 0 0' }}>{job.jobTitle}</p>
                </div>
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: job.matchScore >= 70 ? '#15803D' : job.matchScore >= 50 ? '#D97706' : '#DC2626',
                }}>
                  {job.matchScore}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

const BUBBLE_GRADIENT = 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)';
