export default function LandingPage({ onGetStarted }: { onGetStarted: () => void | Promise<void> }) {

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10,
        background: '#FFFFFF',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Poppins, system-ui, sans-serif',
      }}
    >
      {/* Inject keyframes */}
      <style>{`
        @keyframes orbLeft {
          0%   { transform: translateY(0px) scale(1); }
          50%  { transform: translateY(40px) scale(1.05); }
          100% { transform: translateY(0px) scale(1); }
        }
        @keyframes orbRight {
          0%   { transform: translateY(0px) scale(1); }
          50%  { transform: translateY(-50px) scale(1.08); }
          100% { transform: translateY(0px) scale(1); }
        }
      `}</style>

      {/* Left orb — anchored to left edge, half off screen */}
      <div
        style={{
          position: 'absolute',
          left: '-180px',
          top: '50%',
          marginTop: '-260px',
          width: '480px',
          height: '520px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(22,163,74,0.35) 0%, rgba(22,163,74,0.12) 50%, rgba(22,163,74,0) 70%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
          animation: 'orbLeft 9s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Right orb — anchored to right edge, half off screen */}
      <div
        style={{
          position: 'absolute',
          right: '-200px',
          top: '50%',
          marginTop: '-240px',
          width: '500px',
          height: '480px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(21,128,61,0.32) 0%, rgba(21,128,61,0.10) 50%, rgba(21,128,61,0) 70%)',
          filter: 'blur(70px)',
          pointerEvents: 'none',
          animation: 'orbRight 12s ease-in-out infinite',
          willChange: 'transform',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: 600,
          padding: '0 32px',
          textAlign: 'center',
        }}
      >
        {/* Logo mark */}
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(22,163,74,0.25)',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
            <path d="m21 3 1 11h-2" />
            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
            <path d="M3 4h8" />
          </svg>
        </div>

        {/* Brand name */}
        <h1
          style={{
            marginTop: 20,
            fontSize: 56,
            fontWeight: 700,
            color: '#0F172A',
            letterSpacing: '-0.04em',
            lineHeight: 1,
            margin: '20px 0 0 0',
          }}
        >
          RetrofitAI
        </h1>

        {/* Descriptor line */}
        <p
          style={{
            marginTop: 10,
            fontSize: 13,
            fontWeight: 500,
            color: '#16A34A',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          AI Career Strategy Agent
        </p>

        {/* Divider */}
        <div
          style={{
            marginTop: 28,
            width: 48,
            height: 2,
            borderRadius: 2,
            background: 'linear-gradient(90deg, #16A34A, #15803D)',
          }}
        />

        {/* Main headline */}
        <h2
          style={{
            marginTop: 28,
            fontSize: 22,
            fontWeight: 600,
            color: '#0F172A',
            lineHeight: 1.4,
            letterSpacing: '-0.02em',
          }}
        >
          Most AIs tell you{' '}
          <span style={{ color: '#94A3B8', fontWeight: 400 }}>how to apply</span>
          {' '}for a job.
          <br />
          RetrofitAI analyzes{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, #16A34A, #15803D)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 700,
            }}
          >
            why you're failing
          </span>
          {' '}— and fixes it.
        </h2>

        {/* Supporting copy */}
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: '#64748B',
            lineHeight: 1.7,
            maxWidth: 480,
          }}
        >
          RetrofitAI is an autonomous agent that reads your rejection patterns across every application,
          finds the real blocker, and rebuilds your strategy — without you having to ask.
        </p>

        {/* CTA */}
        <button
          onClick={onGetStarted}
          style={{
            marginTop: 40,
            padding: '15px 48px',
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 18,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '-0.01em',
            fontFamily: 'inherit',
            boxShadow: '0 4px 24px rgba(22, 163, 74, 0.3)',
            transition: 'transform 150ms, box-shadow 150ms',
          }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 8px 32px rgba(22, 163, 74, 0.4)';
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 24px rgba(22, 163, 74, 0.3)';
          }}
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
