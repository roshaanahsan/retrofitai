import { LayoutGrid, Search, Kanban, Lightbulb, BookOpen, type LucideIcon } from 'lucide-react';
import type { View } from '@/types';

interface SidebarProps {
  activeView: View;
  onNavigate: (view: View) => void;
  momentumScore: number | null;
}

const NAV_ITEMS = [
  { id: 'dashboard' as View, label: 'Dashboard',    icon: LayoutGrid },
  { id: 'analyze'   as View, label: 'Analyze Job',  icon: Search     },
  { id: 'pipeline'  as View, label: 'My Pipeline',  icon: Kanban     },
  { id: 'insights'  as View, label: 'Insights',     icon: Lightbulb  },
  { id: 'briefing'  as View, label: 'Weekly Brief', icon: BookOpen   },
];

export default function Sidebar({ activeView, onNavigate, momentumScore }: SidebarProps) {
  return (
    <>
      <aside
        className="w-[220px] shrink-0 flex flex-col"
        style={{ background: '#FFFFFF', borderRight: '1px solid #E2E8F0' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-4 h-14 shrink-0"
          style={{ borderBottom: '1px solid #E2E8F0' }}
        >
          <div
            className="flex items-center justify-center shrink-0"
            style={{
              width: 34,
              height: 34,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m11 17 2 2a1 1 0 1 0 3-3" />
              <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
              <path d="m21 3 1 11h-2" />
              <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
              <path d="M3 4h8" />
            </svg>
          </div>
          <span style={{ fontSize: 19, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1 }}>
            Retrofit<span style={{ color: '#16A34A' }}>AI</span>
          </span>
        </div>

        <nav className="flex-1 px-3 pt-3 pb-3 flex flex-col gap-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.id}
              item={item}
              active={activeView === item.id}
              onClick={() => onNavigate(item.id)}
            />
          ))}
        </nav>

        {momentumScore !== null && (
          <div className="px-3 pb-4" style={{ borderTop: '1px solid #E2E8F0', paddingTop: '12px' }}>
            <div
              style={{
                borderRadius: 18,
                padding: '12px 14px',
                background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600, fontFamily: 'Poppins, sans-serif' }}>Momentum</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#64748B', fontFamily: 'Poppins, sans-serif' }}>{momentumScore}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#16A34A', fontFamily: 'Poppins, sans-serif' }}>/100</span>
              </span>
            </div>
          </div>
        )}
      </aside>
    </>
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
      className="w-full flex items-center gap-2.5 text-left transition-colors duration-100"
      style={{
        paddingLeft: '10px',
        paddingRight: '10px',
        height: '38px',
        borderRadius: '18px',
        background: active
          ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
          : 'transparent',
        color: active ? '#FFFFFF' : '#64748B',
        fontWeight: active ? 600 : 400,
        fontSize: '14px',
        minHeight: 'unset',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = '#F8FAFC';
          (e.currentTarget as HTMLButtonElement).style.color = '#0F172A';
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = '#64748B';
        }
      }}
    >
      <Icon
        size={15}
        strokeWidth={active ? 2.2 : 1.8}
        style={{ color: active ? '#FFFFFF' : '#94A3B8', flexShrink: 0 }}
      />
      <span style={{ flex: 1 }}>{item.label}</span>
    </button>
  );
}
