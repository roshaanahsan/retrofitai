import { getMomentumColor, cn } from '@/lib/utils';
import type { CareerProfile } from '@/types';

interface HeaderProps {
  momentumScore: number | null;
  profile: Partial<CareerProfile> | null;
}

export default function Header({ momentumScore, profile }: HeaderProps) {
  const initials = profile?.currentRole
    ? profile.currentRole.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : profile?.targetRole
    ? profile.targetRole.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <header
      className="h-14 flex items-center px-5 shrink-0 z-10"
      style={{ background: 'rgba(9,9,11,0.55)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 1px 24px 0 rgba(0,0,0,0.45)' }}
    >
      <div className="flex items-center gap-3">
        <HexMark />
        <span className="text-[15px] font-semibold tracking-[-0.01em]" style={{ color: '#FAFAFA' }}>
          HireIQ
        </span>
      </div>

      {profile?.targetRole && (
        <div className="ml-5 hidden md:flex items-center gap-2">
          <span className="w-px h-3 block" style={{ background: '#3F3F46' }} />
          <span className="text-xs">
            <span style={{ color: '#A1A1AA' }}>{profile.targetRole}</span>
            {profile.targetIndustry && (
              <span style={{ color: '#52525B' }}> · {profile.targetIndustry}</span>
            )}
          </span>
        </div>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        {momentumScore !== null && (
          <div
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold',
              getMomentumColor(momentumScore)
            )}
          >
            <span className="tabular-nums">{momentumScore}</span>
            <span className="font-normal text-[10px]" style={{ opacity: 0.7 }}>momentum</span>
          </div>
        )}

        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-semibold"
          style={{ background: '#27272A', color: '#A1A1AA', boxShadow: '0 0 0 1px rgba(63,63,70,0.8)' }}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}

function HexMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 2.5L18.79 7V15L11 19.5L3.21 15V7L11 2.5Z" fill="#003040" />
      <path d="M11 6.5L15.33 9V14L11 16.5L6.67 14V9L11 6.5Z" fill="#00e5ff" fillOpacity="0.9" />
    </svg>
  );
}
