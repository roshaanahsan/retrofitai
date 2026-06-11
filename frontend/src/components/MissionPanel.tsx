import { useState, useEffect, useRef } from 'react';
import { Zap, CheckCircle2, Circle, Loader2, ChevronRight, BarChart2, TrendingUp, Target, Users, Plus, X } from 'lucide-react';
import { createApplication, updateApplication } from '@/lib/api';
import { formatStatus } from '@/lib/utils';
import type { ActiveMission, AgentDashboard } from '@/types';

const APPLICATION_STATUSES = [
  'APPLIED',
  'NO_RESPONSE',
  'PHONE_SCREEN',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
] as const;

interface MissionPanelProps {
  dashboard: AgentDashboard | null;
  activeMission: ActiveMission | null;
  onLaunchMission: (goal: string) => void;
  onDismissMission?: () => void;
  onRefreshDashboard?: () => void;
  disabled?: boolean;
  onLoadDemo?: () => void;
  demoLoading?: boolean;
}

const QUICK_MISSIONS = [
  { label: 'Why am I getting rejected?', goal: 'Analyze why I am getting rejected and show me the pattern' },
  { label: 'Find my skill gaps', goal: 'Find my skill gaps across all jobs I applied to' },
  { label: 'Rank my job matches', goal: 'Rank and compare my job matches by score and tell me where to prioritize' },
  { label: 'Prepare a cover letter', goal: 'Help me prepare an application with a cover letter' },
  { label: 'Weekly momentum briefing', goal: 'Generate my weekly momentum briefing and priority actions' },
  { label: 'Draft stale follow-ups', goal: 'Draft follow-up emails for stale applications that need a nudge' },
];

const PANEL_STYLES = `
  @keyframes missionStepIn { from { opacity:0; transform:translateX(-8px); } to { opacity:1; transform:translateX(0); } }
  @keyframes missionPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.3); } 50% { box-shadow: 0 0 0 6px rgba(22,163,74,0); } }
  @keyframes countUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .mission-step-row { animation: missionStepIn 250ms ease forwards; }
  .mission-stat-val { animation: countUp 400ms ease forwards; }
`;

function useCountUp(target: number | null, duration = 600): number {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (target === null || target === undefined) return;
    const finalTarget = target;
    const start = performance.now();
    const from = 0;
    function tick(now: number) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setVal(Math.round(from + (finalTarget - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return val;
}

function StatCard({ label, value, icon }: { label: string; value: number | null; icon: React.ReactNode }) {
  const display = useCountUp(value);
  return (
    <div style={{
      flex: 1, padding: '10px 8px', borderRadius: 12, background: '#FFFFFF',
      border: '1px solid #E8ECF3', textAlign: 'center',
    }}>
      <div style={{ color: '#16A34A', marginBottom: 4, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <p className="mission-stat-val" style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0, fontFamily: 'Poppins, sans-serif' }}>
        {value === null ? '—' : display}
      </p>
      <p style={{ fontSize: 9, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '2px 0 0', fontFamily: 'Poppins, sans-serif' }}>
        {label}
      </p>
    </div>
  );
}

function StepRow({ step, index, isActive, isDone, isError }: {
  step: { id: string; title: string; description?: string };
  index: number;
  isActive: boolean;
  isDone: boolean;
  isError: boolean;
}) {
  const showDescription = isActive && !!step.description;
  return (
    <div
      className="mission-step-row"
      style={{
        display: 'flex',
        alignItems: showDescription ? 'flex-start' : 'center',
        gap: 10,
        padding: '8px 10px',
        minHeight: 36,
        borderRadius: 12,
        background: isActive ? 'linear-gradient(to right, #F0FDF4, #FFFFFF)' : isDone ? '#FAFAFA' : '#FFFFFF',
        border: `1px solid ${isActive ? '#86EFAC' : isDone ? '#E2E8F0' : '#F1F5F9'}`,
        transition: 'all 250ms ease',
        animationDelay: `${index * 60}ms`,
      }}
    >
      <div style={{
        flexShrink: 0,
        width: 14,
        height: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: showDescription ? 2 : 0,
      }}>
        {isActive ? (
          <Loader2 size={14} color="#16A34A" style={{ animation: 'chatSpin 1s linear infinite' }} />
        ) : isDone ? (
          <CheckCircle2 size={14} color="#16A34A" />
        ) : isError ? (
          <Circle size={14} color="#DC2626" />
        ) : (
          <Circle size={14} color="#C8D0DE" />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <p style={{
          fontSize: 12, fontWeight: isActive ? 600 : isDone ? 500 : 400,
          color: isActive ? '#15803D' : isDone ? '#374151' : '#94A3B8',
          margin: 0, fontFamily: 'Poppins, sans-serif', lineHeight: 1.35,
        }}>
          {step.title}
        </p>
        {showDescription && (
          <p style={{ fontSize: 10, color: '#64748B', margin: '2px 0 0', fontFamily: 'Poppins, sans-serif', lineHeight: 1.35 }}>
            {step.description}
          </p>
        )}
      </div>
      {isDone && (
        <span style={{
          fontSize: 9, fontWeight: 600, color: '#16A34A', textTransform: 'uppercase',
          letterSpacing: '0.05em', flexShrink: 0, lineHeight: 1, alignSelf: 'center',
        }}>
          Done
        </span>
      )}
    </div>
  );
}

export default function MissionPanel({
  dashboard,
  activeMission,
  onLaunchMission,
  onDismissMission,
  onRefreshDashboard,
  disabled = false,
  onLoadDemo,
  demoLoading = false,
}: MissionPanelProps) {
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addCompany, setAddCompany] = useState('');
  const [addRole, setAddRole] = useState('');
  const [addJobId, setAddJobId] = useState('');
  const [addingApp, setAddingApp] = useState(false);
  const [addError, setAddError] = useState('');
  const stats = dashboard?.stats;
  const briefing = dashboard?.briefing;

  const isMissionActive = activeMission?.status === 'planning' || activeMission?.status === 'running';
  const isMissionDone = activeMission?.status === 'complete';
  const isMissionError = activeMission?.status === 'error';
  const showMissionCard = activeMission && (isMissionActive || isMissionDone || isMissionError);

  function handleQuickMission(g: string) {
    if (disabled || isMissionActive) return;
    onLaunchMission(g);
  }

  const trackedCompanies = new Set(
    (dashboard?.applications || []).map((a) => a.company.toLowerCase().trim()),
  );
  const untrackedJobs = (dashboard?.topJobs || []).filter(
    (j) => j.company && !trackedCompanies.has(j.company.toLowerCase().trim()),
  );

  function resetAddForm() {
    setShowAddForm(false);
    setAddCompany('');
    setAddRole('');
    setAddJobId('');
    setAddError('');
  }

  function handlePickAnalyzedJob(jobId: string) {
    setAddJobId(jobId);
    const job = untrackedJobs.find((j) => j._id === jobId);
    if (job) {
      setAddCompany(job.company);
      setAddRole(job.jobTitle);
    } else {
      setAddCompany('');
      setAddRole('');
    }
  }

  async function handleAddApplication() {
    const company = addCompany.trim();
    const role = addRole.trim();
    if (!company || !role) {
      setAddError('Company and role are required.');
      return;
    }
    setAddingApp(true);
    setAddError('');
    try {
      await createApplication({
        company,
        role,
        ...(addJobId ? { jobAnalysisId: addJobId } : {}),
      });
      resetAddForm();
      onRefreshDashboard?.();
    } catch {
      setAddError('Could not add application. Try again.');
    } finally {
      setAddingApp(false);
    }
  }

  async function handleStatusChange(appId: string, status: string) {
    setStatusUpdating(appId);
    try {
      const payload: Record<string, unknown> = { status };
      if (status === 'REJECTED') payload.rejectionStage = 'NO_RESPONSE';
      if (status === 'NO_RESPONSE') payload.rejectionStage = 'NO_RESPONSE';
      await updateApplication(appId, payload);
      onRefreshDashboard?.();
    } catch {
      /* non-fatal */
    } finally {
      setStatusUpdating(null);
    }
  }

  const totalApps = stats?.totalApplications ?? null;
  const rejectionCount = stats?.rejections ?? 0;
  const jobsAnalyzed = stats?.jobsAnalyzed ?? null;
  const responseRate = stats?.responseRate != null ? Math.round(stats.responseRate) : null;
  const momentum = briefing?.momentumScore ?? null;

  return (
    <aside style={{
      width: 300,
      flexShrink: 0,
      borderRight: '1px solid #E8ECF3',
      background: 'linear-gradient(to bottom, #F8FAFC, #FFFFFF)',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'Poppins, sans-serif',
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>
      <style>{PANEL_STYLES}</style>
      <style>{`@keyframes chatSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #E8ECF3' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 9, flexShrink: 0,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={13} color="#FFFFFF" fill="#FFFFFF" />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>Mission Control</p>
            <p style={{ fontSize: 10, color: '#94A3B8', margin: 0 }}>One-click agent playbooks</p>
          </div>
        </div>
      </div>

      {/* Mission playbooks */}
      <div style={{ padding: '14px 14px 10px' }}>
        {!isMissionActive && !showMissionCard && (
          <p style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'Poppins, sans-serif' }}>
            Run a playbook
          </p>
        )}
        {isMissionActive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10,
            padding: '8px 10px', minHeight: 36, borderRadius: 10,
            background: '#F0FDF4', border: '1px solid #BBF7D0',
          }}>
            <Loader2 size={12} color="#16A34A" style={{ animation: 'chatSpin 1s linear infinite', flexShrink: 0 }} />
            <p style={{ fontSize: 11, fontWeight: 600, color: '#15803D', margin: 0, lineHeight: 1.35 }}>Mission running…</p>
          </div>
        )}
        {!isMissionActive && !showMissionCard && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {QUICK_MISSIONS.map((qm) => (
              <button
                key={qm.label}
                onClick={() => handleQuickMission(qm.goal)}
                disabled={disabled}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 10,
                  border: '1px solid #E8ECF3', background: '#FFFFFF',
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  textAlign: 'left', fontFamily: 'Poppins, sans-serif',
                  transition: 'border-color 150ms ease, background 150ms ease',
                }}
                onMouseEnter={(e) => {
                  if (!disabled) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#86EFAC';
                    (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4';
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8ECF3';
                  (e.currentTarget as HTMLButtonElement).style.background = '#FFFFFF';
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 500, color: '#374151' }}>{qm.label}</span>
                <ChevronRight size={12} color="#C8D0DE" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active Mission Steps */}
      {showMissionCard && activeMission && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: 14,
            background: isMissionDone ? '#F0FDF4' : isMissionError ? '#FEF2F2' : '#FFFFFF',
            border: `1.5px solid ${isMissionDone ? '#86EFAC' : isMissionError ? '#FECACA' : '#E8ECF3'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minHeight: 20 }}>
              {isMissionActive ? (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', background: '#16A34A', flexShrink: 0,
                  animation: 'missionPulse 1.4s ease-in-out infinite',
                }} />
              ) : (
                <CheckCircle2 size={14} color="#16A34A" style={{ flexShrink: 0 }} />
              )}
              <p style={{ fontSize: 11, fontWeight: 700, color: '#15803D', margin: 0, flex: 1, lineHeight: 1.35 }}>
                {activeMission.missionTitle || 'Running mission…'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeMission.steps.map((step, i) => {
                const isActive = i === activeMission.currentStepIndex && isMissionActive;
                const isDone = i < activeMission.currentStepIndex || isMissionDone;
                const isError = step.status === 'error';
                return (
                  <StepRow
                    key={step.id + i}
                    step={step}
                    index={i}
                    isActive={isActive}
                    isDone={isDone}
                    isError={isError}
                  />
                );
              })}
            </div>
            {isMissionDone && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 10, padding: '8px 10px', minHeight: 36,
                borderRadius: 10, background: 'rgba(255,255,255,0.7)',
              }}>
                <p style={{
                  fontSize: 11, color: '#15803D', fontWeight: 500, textAlign: 'center',
                  margin: 0, fontFamily: 'Poppins, sans-serif', lineHeight: 1.4,
                }}>
                  ✓ Mission complete — results in chat
                </p>
              </div>
            )}
            {isMissionError && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 10, padding: '8px 10px', minHeight: 36,
                borderRadius: 10, background: 'rgba(255,255,255,0.7)',
              }}>
                <p style={{
                  fontSize: 11, color: '#DC2626', fontWeight: 500, textAlign: 'center',
                  margin: 0, fontFamily: 'Poppins, sans-serif', lineHeight: 1.4,
                }}>
                  Mission failed — try again or pick another goal
                </p>
              </div>
            )}
            {(isMissionDone || isMissionError) && onDismissMission && (
              <button
                type="button"
                onClick={onDismissMission}
                style={{
                  width: '100%',
                  marginTop: 10,
                  padding: '8px 0',
                  minHeight: 36,
                  borderRadius: 10,
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#475569',
                  fontFamily: 'Poppins, sans-serif',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ← Back to missions
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {stats && (
        <div style={{ padding: '0 14px 14px' }}>
          <p style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'Poppins, sans-serif' }}>
            Pipeline overview
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <StatCard label="Applied" value={totalApps} icon={<Target size={13} />} />
            <StatCard label="Analyzed" value={jobsAnalyzed} icon={<BarChart2 size={13} />} />
            <StatCard label="Response %" value={responseRate} icon={<Users size={13} />} />
            {momentum !== null && <StatCard label="Momentum" value={momentum} icon={<TrendingUp size={13} />} />}
          </div>
        </div>
      )}

      {/* Pipeline — update outcomes so the agent knows what happened */}
      {dashboard && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, fontFamily: 'Poppins, sans-serif' }}>
              Track outcomes
            </p>
            {!showAddForm && (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                disabled={disabled || isMissionActive}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', borderRadius: 8,
                  border: '1px solid #E2E8F0', background: '#FFFFFF',
                  cursor: disabled || isMissionActive ? 'not-allowed' : 'pointer',
                  fontSize: 10, fontWeight: 600, color: '#15803D',
                  fontFamily: 'Poppins, sans-serif',
                }}
              >
                <Plus size={11} />
                Add
              </button>
            )}
          </div>
          <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 8px', lineHeight: 1.4, fontFamily: 'Poppins, sans-serif' }}>
            Mark each job — agent uses this for pattern analysis ({rejectionCount}/2 rejections for insight)
          </p>

          {showAddForm && (
            <div style={{
              padding: '10px', borderRadius: 10, marginBottom: 8,
              background: '#FFFFFF', border: '1.5px solid #86EFAC',
            }}>
              {untrackedJobs.length > 0 && (
                <select
                  value={addJobId}
                  onChange={(e) => handlePickAnalyzedJob(e.target.value)}
                  disabled={addingApp}
                  style={{
                    width: '100%', marginBottom: 8, fontSize: 10, fontWeight: 500,
                    fontFamily: 'Poppins, sans-serif', padding: '6px 8px',
                    borderRadius: 8, border: '1px solid #E2E8F0', background: '#F8FAFC',
                    color: '#374151',
                  }}
                >
                  <option value="">Custom application…</option>
                  {untrackedJobs.map((j) => (
                    <option key={j._id} value={j._id}>
                      {j.company} — {j.jobTitle} ({j.matchScore}/100)
                    </option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="Company"
                value={addCompany}
                onChange={(e) => { setAddCompany(e.target.value); setAddJobId(''); }}
                disabled={addingApp}
                style={{
                  width: '100%', boxSizing: 'border-box', marginBottom: 6,
                  fontSize: 11, fontFamily: 'Poppins, sans-serif', padding: '7px 9px',
                  borderRadius: 8, border: '1px solid #E2E8F0', outline: 'none',
                }}
              />
              <input
                type="text"
                placeholder="Role / job title"
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                disabled={addingApp}
                style={{
                  width: '100%', boxSizing: 'border-box', marginBottom: 8,
                  fontSize: 11, fontFamily: 'Poppins, sans-serif', padding: '7px 9px',
                  borderRadius: 8, border: '1px solid #E2E8F0', outline: 'none',
                }}
              />
              {addError && (
                <p style={{ fontSize: 10, color: '#DC2626', margin: '0 0 6px' }}>{addError}</p>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleAddApplication}
                  disabled={addingApp || !addCompany.trim() || !addRole.trim()}
                  style={{
                    flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                    background: addingApp ? '#F1F5F9' : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                    color: addingApp ? '#94A3B8' : '#FFFFFF',
                    fontSize: 11, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
                    cursor: addingApp || !addCompany.trim() || !addRole.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  {addingApp ? <Loader2 size={11} style={{ animation: 'chatSpin 1s linear infinite' }} /> : null}
                  {addingApp ? 'Adding…' : 'Add to pipeline'}
                </button>
                <button
                  type="button"
                  onClick={resetAddForm}
                  disabled={addingApp}
                  style={{
                    padding: '7px 10px', borderRadius: 8, border: '1px solid #E2E8F0',
                    background: '#FFFFFF', cursor: addingApp ? 'not-allowed' : 'pointer',
                  }}
                  aria-label="Cancel"
                >
                  <X size={12} color="#64748B" />
                </button>
              </div>
            </div>
          )}

          {dashboard.applications.length === 0 && !showAddForm && (
            <p style={{ fontSize: 10, color: '#94A3B8', margin: 0, lineHeight: 1.45, fontFamily: 'Poppins, sans-serif' }}>
              No applications yet. Tap <strong>Add</strong> to track a role you applied to.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dashboard.applications.map((app) => (
              <div
                key={app._id}
                style={{
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#FFFFFF',
                  border: '1px solid #E8ECF3',
                }}
              >
                <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.company}
                </p>
                <p style={{ fontSize: 9, color: '#94A3B8', margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.role}
                </p>
                <select
                  value={app.status}
                  disabled={disabled || statusUpdating === app._id}
                  onChange={(e) => handleStatusChange(app._id, e.target.value)}
                  style={{
                    width: '100%',
                    fontSize: 10,
                    fontWeight: 600,
                    fontFamily: 'Poppins, sans-serif',
                    padding: '5px 8px',
                    borderRadius: 8,
                    border: '1px solid #E2E8F0',
                    background: statusUpdating === app._id ? '#F8FAFC' : '#FFFFFF',
                    color: '#374151',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                  }}
                >
                  {APPLICATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{formatStatus(s)}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern Alert */}
      {dashboard?.pattern?.dominantPattern && dashboard.pattern.dominantPattern !== 'INSUFFICIENT_DATA' && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: 12,
            background: 'linear-gradient(to right, #FEF2F2, #FFFFFF)',
            border: '1px solid #FECACA',
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: '#B91C1C', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px' }}>
              Pattern detected
            </p>
            <p style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', margin: '0 0 4px' }}>
              {dashboard.pattern.dominantPattern.replace(/_/g, ' ')}
            </p>
            {dashboard.pattern.insight && (
              <p style={{ fontSize: 10, color: '#6B7280', margin: 0, lineHeight: 1.4 }}>
                {dashboard.pattern.insight.slice(0, 90)}{dashboard.pattern.insight.length > 90 ? '…' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Momentum Score */}
      {briefing && (
        <div style={{ padding: '0 14px 14px' }}>
          <div style={{
            padding: '10px 12px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #F0FDF4, #DCFCE7)',
            border: '1px solid #BBF7D0',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>
                Momentum
              </p>
              <p style={{ fontSize: 20, fontWeight: 700, color: '#15803D', margin: 0, lineHeight: 1 }}>
                {briefing.momentumScore}<span style={{ fontSize: 11 }}>/100</span>
              </p>
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 9,
              background: briefing.momentumTrend === 'UP' ? '#15803D' : briefing.momentumTrend === 'DOWN' ? '#DC2626' : '#64748B',
              color: '#FFFFFF',
            }}>
              {briefing.momentumTrend === 'UP' ? '↑ UP' : briefing.momentumTrend === 'DOWN' ? '↓ DOWN' : '→ STABLE'}
            </div>
          </div>
        </div>
      )}

      {/* Demo Button */}
      {!stats?.totalApplications && (
        <div style={{ padding: '0 14px 14px', marginTop: 'auto' }}>
          <button
            onClick={onLoadDemo}
            disabled={demoLoading || disabled}
            style={{
              width: '100%', padding: '10px 0', borderRadius: 12,
              border: '1.5px dashed #C8D0DE', background: 'transparent',
              cursor: demoLoading || disabled ? 'not-allowed' : 'pointer',
              fontSize: 11, fontWeight: 600, color: '#64748B',
              fontFamily: 'Poppins, sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {demoLoading ? <Loader2 size={12} style={{ animation: 'chatSpin 1s linear infinite' }} /> : null}
            {demoLoading ? 'Loading demo…' : '⚡ Load demo profile'}
          </button>
        </div>
      )}
    </aside>
  );
}
