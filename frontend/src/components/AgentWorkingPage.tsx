import { useEffect, useState, useRef } from 'react';
import { analyzeJob, updateProfile, inferProfileFromResume, finalizeAnalysis } from '@/lib/api';
import type { FinalizeResult } from '@/types';

interface Props {
  jobs: string[];
  bio: string;
  onComplete: (batchId: string, data: FinalizeResult | null) => void;
}

const STEPS = [
  'Scoring your opportunities',
  'Mapping your skill gaps',
  'Building your pipeline',
  'Drafting your cover letter',
  'Preparing your dashboard',
];

const STEP_DELAY = 2000;

export default function AgentWorkingPage({ jobs, bio, onComplete }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [step5Done, setStep5Done] = useState(false);
  const firedRef = useRef(false);
  const activeStepRef = useRef(0);
  const finalizeResultRef = useRef<{ data: FinalizeResult | null } | null>(null);
  const completedRef = useRef(false);
  const batchIdRef = useRef(`batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  function setStep(n: number) {
    activeStepRef.current = n;
    setActiveStep(n);
  }

  function completeStep5() {
    if (completedRef.current) return;
    completedRef.current = true;
    setStep5Done(true);
    setTimeout(() => onComplete(batchIdRef.current, finalizeResultRef.current?.data ?? null), 700);
  }

  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      const batchId = batchIdRef.current;

      const run = async () => {
        // Fire profile inference + agentMode update concurrently — don't block job analysis
        const profilePromise = bio
          ? inferProfileFromResume(bio).catch(() =>
              updateProfile({ resumeText: bio }).catch(() => {})
            )
          : Promise.resolve();
        const agentModePromise = updateProfile({ agentMode: 'ACTIVE_SEARCH' }).catch(() => {});

        // Analyze jobs in batches of 2 (safe under Gemini rate limits, ~2× faster than sequential)
        for (let i = 0; i < jobs.length; i += 2) {
          const batch = jobs.slice(i, i + 2);
          await Promise.allSettled(batch.map((jd) => analyzeJob(jd, bio, batchId)));
        }

        // Ensure profile is saved before we finalize
        await Promise.allSettled([profilePromise, agentModePromise]);

        let data: FinalizeResult | null = null;
        try {
          // skipCoverLetter=true — saves ~10s; user can generate it on demand later
          const r = await finalizeAnalysis(batchId, jobs.length, true);
          data = r.data;
        } catch { /* data stays null */ }

        finalizeResultRef.current = { data };
        if (activeStepRef.current >= 5) completeStep5();
      };

      run();
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    setStep(1);

    timers.push(setTimeout(() => {
      setStep(2);
      timers.push(setTimeout(() => {
        setStep(3);
        timers.push(setTimeout(() => {
          setStep(4);
          timers.push(setTimeout(() => {
            setStep(5);
            if (finalizeResultRef.current !== null) completeStep5();
          }, STEP_DELAY));
        }, STEP_DELAY));
      }, STEP_DELAY));
    }, STEP_DELAY));

    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentLabel = activeStep >= 1 ? STEPS[activeStep - 1] : '';
  const isDone = activeStep === 5 && step5Done;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#F8FAFC',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Poppins, system-ui, sans-serif',
      overflow: 'hidden', zIndex: 50,
    }}>
      <style>{`
        @keyframes aw-spinArc {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes aw-breathe1 {
          0%, 100% { opacity: 0.15; }
          50%       { opacity: 0.32; }
        }
        @keyframes aw-breathe2 {
          0%, 100% { opacity: 0.07; }
          50%       { opacity: 0.18; }
        }
        @keyframes aw-orbPulse {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 1; }
        }
        @keyframes aw-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes aw-fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .aw-arc-spin {
          transform-origin: 70px 70px;
          animation: aw-spinArc 2.6s linear infinite;
        }
        .aw-spinner {
          width: 20px; height: 20px; flex-shrink: 0;
          border: 2px solid #E8ECF3;
          border-top-color: #16A34A;
          border-radius: 50%;
          animation: aw-spin 0.75s linear infinite;
        }
        .aw-step-row {
          animation: aw-fadeUp 280ms ease forwards;
        }
      `}</style>

      {/* Logo */}
      <div style={{ position: 'absolute', top: 24, left: 28, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 9,
          background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
            <path d="m21 3 1 11h-2" />
            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
            <path d="M3 4h8" />
          </svg>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>RetrofitAI</span>
      </div>

      {/* Orb — bigger */}
      <svg width="180" height="180" viewBox="0 0 140 140" style={{ marginBottom: 32, overflow: 'visible' }}>
        <defs>
          <linearGradient id="aw-arcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#16A34A" />
            <stop offset="65%" stopColor="#86EFAC" />
            <stop offset="100%" stopColor="#15803D" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="aw-core" cx="38%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#F0FDF4" />
            <stop offset="50%" stopColor="#DCFCE7" />
            <stop offset="100%" stopColor="#BBF7D0" />
          </radialGradient>
        </defs>
        {/* Outer breathing rings */}
        <circle cx="70" cy="70" r="66" fill="none" stroke="#16A34A" strokeWidth="0.7"
          style={{ animation: 'aw-breathe2 4s ease-in-out infinite', transformOrigin: '70px 70px' }} />
        <circle cx="70" cy="70" r="57" fill="none" stroke="#16A34A" strokeWidth="1"
          style={{ animation: 'aw-breathe1 3.2s ease-in-out infinite', transformOrigin: '70px 70px' }} />
        {/* Spinning arc */}
        <g className="aw-arc-spin">
          <circle cx="70" cy="70" r="48" fill="none" stroke="url(#aw-arcGrad)"
            strokeWidth="3.5" strokeLinecap="round" strokeDasharray="150 302" />
        </g>
        {/* White ring + Silver ring + Core */}
        <circle cx="70" cy="70" r="40" fill="white" />
        <circle cx="70" cy="70" r="40" fill="none" stroke="#E8ECF3" strokeWidth="1" />
        <circle cx="70" cy="70" r="34" fill="url(#aw-core)" style={{ animation: 'aw-orbPulse 3s ease-in-out infinite' }} />
        {/* Centered icon */}
        <g transform="translate(40, 40)">
          <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
            <path d="m21 3 1 11h-2" />
            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
            <path d="M3 4h8" />
          </svg>
        </g>
      </svg>

      {/* Label + heading */}
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 6px 0' }}>
        Agent is working
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 22px 0', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        Analyzing {jobs.length} position{jobs.length !== 1 ? 's' : ''}
      </h2>

      {/* Single-step card — stat card gradient, 18px radius */}
      <div style={{
        background: 'linear-gradient(to right, #FFFFFF 0%, #C8D0DE 100%)',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
        width: 320,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {activeStep >= 1 && (
          <div
            key={activeStep}
            className="aw-step-row"
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', width: '100%' }}
          >
            {/* Indicator */}
            {isDone ? (
              <div style={{
                width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                background: '#F0FDF4', border: '1.5px solid #16A34A',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5L4.2 7.2L8 3" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            ) : (
              <div className="aw-spinner" />
            )}

            {/* Step text */}
            <span style={{
              fontSize: 14,
              fontWeight: 500,
              color: isDone ? '#16A34A' : '#0F172A',
              letterSpacing: '-0.01em',
            }}>
              {currentLabel}
            </span>

            {/* Step counter */}
            <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 300, color: '#94A3B8', flexShrink: 0 }}>
              {activeStep} / {STEPS.length}
            </span>
          </div>
        )}
      </div>

      {/* Bottom caption */}
      <p style={{ position: 'absolute', bottom: 28, fontSize: 12, fontWeight: 300, color: '#94A3B8', margin: 0 }}>
        Analyzing {jobs.length} job{jobs.length !== 1 ? 's' : ''} against your profile
      </p>
    </div>
  );
}
