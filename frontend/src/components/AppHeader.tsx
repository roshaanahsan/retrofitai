interface AppHeaderProps {
  agentStatus: 'idle' | 'working' | 'done';
}

export default function AppHeader({ agentStatus }: AppHeaderProps) {
  const isWorking = agentStatus === 'working';
  const label = isWorking ? 'Working' : 'Idle';
  const dotColor = isWorking ? '#16A34A' : '#94A3B8';
  const badgeBg = isWorking ? '#F0FDF4' : '#F1F5F9';
  const badgeBorder = isWorking ? '#BBF7D0' : '#E2E8F0';
  const badgeText = isWorking ? '#15803D' : '#64748B';

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF',
        fontFamily: 'Poppins, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
            <path d="m21 3 1 11h-2" />
            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
            <path d="M3 4h8" />
          </svg>
        </div>
        <div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>
            RetrofitAI
          </span>
          <p style={{ fontSize: 10, fontWeight: 500, color: '#94A3B8', margin: '1px 0 0', lineHeight: 1.2 }}>
            Why you're failing — not just how to apply
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 999,
          background: badgeBg,
          border: `1px solid ${badgeBorder}`,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
            animation: isWorking ? 'agentPulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: badgeText }}>{label}</span>
      </div>
    </header>
  );
}
