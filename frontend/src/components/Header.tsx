import { getMomentumColor, cn } from '@/lib/utils';
import type { CareerProfile } from '@/types';

interface HeaderProps {
  momentumScore: number | null;
  profile: Partial<CareerProfile> | null;
  agentStatus?: 'idle' | 'working' | 'done';
}

export default function Header({ momentumScore, profile, agentStatus = 'idle' }: HeaderProps) {
  const initials = profile?.currentRole
    ? profile.currentRole.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : profile?.targetRole
    ? profile.targetRole.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const statusLabel =
    agentStatus === 'working' ? 'Agent analyzing your pipeline...' :
    agentStatus === 'done'    ? 'Agent finished — drafts ready' :
    'Agent idle';

  return (
    <>
      <style>{`
        @keyframes agent-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(22,163,74,0.55); }
          70%  { box-shadow: 0 0 0 6px rgba(22,163,74,0); }
          100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); }
        }
      `}</style>
      <header
        className="shrink-0 flex items-center px-5 z-10"
        style={{ height: '64px', background: 'rgba(248,250,252,0.95)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid #E2E8F0' }}
      >
        <div className="flex items-center gap-3">
          <RetrofitMark />
          <span style={{ fontSize: '22px', fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'Poppins, sans-serif' }}>
            RetrofitAI
          </span>

          {/* Agent status dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={statusLabel}>
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: agentStatus === 'idle' ? '#CBD5E1' : '#16A34A',
              animation: agentStatus === 'working' ? 'agent-pulse 1.2s ease-in-out infinite' : 'none',
              transition: 'background 300ms',
              flexShrink: 0,
            }} />
            {agentStatus === 'working' && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#16A34A', fontFamily: 'Poppins, sans-serif' }}>
                Agent working…
              </span>
            )}
            {agentStatus === 'done' && (
              <span style={{ fontSize: 11, fontWeight: 500, color: '#16A34A', fontFamily: 'Poppins, sans-serif' }}>
                Agent ready
              </span>
            )}
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          {momentumScore !== null && (
            <div
              className={cn(
                'flex items-center gap-2 px-3 rounded-lg font-bold',
                getMomentumColor(momentumScore)
              )}
              style={{ height: '36px', fontSize: '14px', border: '1px solid #E2E8F0' }}
            >
              <span className="tabular-nums">{momentumScore}</span>
              <span style={{ opacity: 0.75, fontWeight: 500, fontSize: '12px' }}>momentum</span>
            </div>
          )}

          <div
            className="rounded-lg flex items-center justify-center font-bold"
            style={{ width: '36px', height: '36px', background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', color: '#FFFFFF', fontSize: '13px', fontFamily: 'Poppins, sans-serif' }}
          >
            {initials}
          </div>
        </div>
      </header>
    </>
  );
}

function RetrofitMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="8" fill="#16A34A" />
      <path d="M9 14.5L12.5 18L19 10" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
