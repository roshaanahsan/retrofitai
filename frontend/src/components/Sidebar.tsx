import { LayoutDashboard, Search, Columns, Brain, FileText, type LucideIcon } from 'lucide-react';
import { getMomentumColor, cn } from '@/lib/utils';
import type { View, WeeklyBriefing } from '@/types';

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  momentumScore: number | null;
  briefing: WeeklyBriefing | null;
}

const NAV_SECTIONS = [
  {
    label: 'SEARCH',
    items: [
      { id: 'dashboard' as View, label: 'Dashboard', icon: LayoutDashboard },
      { id: 'analyze' as View, label: 'Analyze Job', icon: Search },
      { id: 'pipeline' as View, label: 'My Pipeline', icon: Columns },
      { id: 'insights' as View, label: 'Insights', icon: Brain },
    ],
  },
  {
    label: 'REPORTS',
    items: [
      { id: 'briefing' as View, label: 'Weekly Brief', icon: FileText },
    ],
  },
];

export default function Sidebar({ activeView, onNavigate, momentumScore, briefing }: SidebarProps) {
  return (
    <aside
      className="w-[220px] shrink-0 flex flex-col z-10"
      style={{ background: 'rgba(9,9,11,0.50)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '1px 0 12px 0 rgba(0,0,0,0.22)', position: 'relative', zIndex: 1 }}
    >
      {/* Brand mark */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3" style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}>
        <svg width="20" height="20" viewBox="0 0 22 22" fill="none">
          <path d="M11 2.5L18.79 7V15L11 19.5L3.21 15V7L11 2.5Z" fill="#003040" />
          <path d="M11 6.5L15.33 9V14L11 16.5L6.67 14V9L11 6.5Z" fill="#00e5ff" fillOpacity="0.9" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#FAFAFA', letterSpacing: '-0.01em' }}>HireIQ</span>
      </div>

      <nav className="flex-1 px-2 pt-3 pb-4 flex flex-col gap-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <p
              className="px-3 mb-1 text-[11px] font-medium tracking-wide uppercase"
              style={{ color: '#52525B' }}
            >
              {section.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItem
                  key={item.id}
                  item={item}
                  active={activeView === item.id}
                  onClick={() => onNavigate(item.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {momentumScore !== null && (
        <div className="px-3 pb-5 pt-2" style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.05)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-wide font-medium" style={{ color: '#52525B' }}>
              Momentum
            </span>
            <span
              className={cn('text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md', getMomentumColor(momentumScore))}
            >
              {momentumScore}
            </span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: '#27272A' }}>
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                momentumScore <= 40 ? 'bg-red-500' : momentumScore <= 70 ? 'bg-amber-500' : 'bg-emerald-500'
              )}
              style={{ width: `${momentumScore}%` }}
            />
          </div>
          {briefing && (
            <p
              className={cn(
                'text-[11px] mt-1.5',
                briefing.momentumTrend === 'UP'
                  ? 'text-emerald-500'
                  : briefing.momentumTrend === 'DOWN'
                  ? 'text-red-400'
                  : ''
              )}
              style={briefing.momentumTrend === 'STABLE' ? { color: '#3F3F46' } : undefined}
            >
              {briefing.momentumTrend === 'UP' ? '▲' : briefing.momentumTrend === 'DOWN' ? '▼' : '—'}{' '}
              from last week
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

function NavItem({
  item,
  active,
  onClick,
}: {
  item: { id: View; label: string; icon: LucideIcon };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 py-2 rounded-lg text-[13px] transition-colors duration-100 text-left"
      style={{
        paddingLeft: '12px',
        paddingRight: '12px',
        background: active ? '#001a22' : 'transparent',
        color: active ? '#67e8f9' : '#71717A',
        fontWeight: active ? 500 : 400,
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#27272A';
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      <Icon
        size={14}
        strokeWidth={active ? 2.5 : 1.75}
        style={{ color: active ? '#00e5ff' : '#52525B', flexShrink: 0 }}
      />
      {item.label}
    </button>
  );
}
