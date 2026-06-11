import { useCallback, useEffect, useState, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, RotateCcw } from 'lucide-react';
import { analyzeJob, updateProfile, inferProfileFromResume, finalizeAnalysis } from '@/lib/api';
import axios from 'axios';
import type { AgentWorkingComplete } from '@/types';

const ANALYZE_RETRIES = 3;
const ANALYZE_RETRY_DELAY_MS = 2000;

interface Props {
  jobs: string[];
  bio: string;
  onComplete: (batchId: string, result: AgentWorkingComplete) => void;
}

type JobStatusState = 'pending' | 'analyzing' | 'success' | 'failed';

interface JobStatusItem {
  label: string;
  status: JobStatusState;
  matchScore?: number;
  jobDescription: string;
}

function jobLabel(jd: string): string {
  const line = jd.trim().split('\n')[0].trim();
  if (!line) return 'Untitled position';
  return line.length > 56 ? `${line.slice(0, 53)}...` : line;
}

const STEPS = [
  'Scoring your opportunities',
  'Mapping your skill gaps',
  'Building your pipeline',
  'Drafting your cover letter',
  'Preparing your dashboard',
];

const STEP_DELAY = 800;

export default function AgentWorkingPage({ jobs, bio, onComplete }: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const [step5Done, setStep5Done] = useState(false);
  const firedRef = useRef(false);
  const activeStepRef = useRef(0);
  const finalizeResultRef = useRef<AgentWorkingComplete | null>(null);
  const [pageError, setPageError] = useState('');
  const [jobStatuses, setJobStatuses] = useState<JobStatusItem[]>(() =>
    jobs.map((jd) => ({ label: jobLabel(jd), status: 'pending', jobDescription: jd })),
  );
  const completedRef = useRef(false);
  const batchIdRef = useRef(`batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  const analyzeOneJob = useCallback(async (index: number): Promise<boolean> => {
    const jd = jobs[index];
    if (!jd) return false;

    setJobStatuses((prev) =>
      prev.map((j, i) => (i === index ? { ...j, status: 'analyzing', matchScore: undefined } : j)),
    );

    for (let attempt = 1; attempt <= ANALYZE_RETRIES; attempt++) {
      try {
        const r = await analyzeJob(jd, bio, batchIdRef.current);
        const analysis = r.data.jobAnalysis;
        const score = analysis?.matchScore ?? 0;
        const title = analysis?.jobTitle?.trim();
        setJobStatuses((prev) =>
          prev.map((j, i) =>
            i === index
              ? { ...j, status: 'success', matchScore: score, label: title || jobLabel(jd) }
              : j,
          ),
        );
        return true;
      } catch {
        if (attempt < ANALYZE_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, ANALYZE_RETRY_DELAY_MS * attempt));
          continue;
        }
        setJobStatuses((prev) =>
          prev.map((j, i) => (i === index ? { ...j, status: 'failed', matchScore: undefined } : j)),
        );
        return false;
      }
    }
    return false;
  }, [jobs, bio]);

  async function handleRetry(index: number) {
    const wasFailed = jobStatuses[index]?.status === 'failed';
    const ok = await analyzeOneJob(index);
    if (wasFailed && finalizeResultRef.current) {
      if (ok) {
        finalizeResultRef.current.analysisSucceeded += 1;
        finalizeResultRef.current.analysisFailed = Math.max(
          0,
          finalizeResultRef.current.analysisFailed - 1,
        );
      }
    }
  }

  function setStep(n: number) {
    activeStepRef.current = n;
    setActiveStep(n);
  }

  function completeStep5() {
    if (completedRef.current) return;
    completedRef.current = true;
    setStep5Done(true);
    setTimeout(
      () => onComplete(batchIdRef.current, finalizeResultRef.current ?? {
        data: null,
        analysisSucceeded: 0,
        analysisFailed: 0,
      }),
      700,
    );
  }

  useEffect(() => {
    if (!firedRef.current) {
      firedRef.current = true;
      const batchId = batchIdRef.current;

      const run = async () => {
        // Save profile — non-fatal: job analysis works even if this fails
        try {
          if (bio) {
            // Always persist bio first — infer is best-effort enrichment
            await updateProfile({ resumeText: bio, agentMode: 'ACTIVE_SEARCH' });
            try {
              await inferProfileFromResume(bio);
            } catch {
              /* resumeText already saved */
            }
          } else {
            await updateProfile({ agentMode: 'ACTIVE_SEARCH' });
          }
        } catch { /* non-fatal — proceed to job analysis */ }

        // Sequential analysis — avoids Gemini rate limits and MCP stdio contention
        let analysisSucceeded = 0;
        let analysisFailed = 0;
        for (let i = 0; i < jobs.length; i++) {
          const ok = await analyzeOneJob(i);
          if (ok) analysisSucceeded += 1;
          else analysisFailed += 1;
        }

        let data: AgentWorkingComplete['data'] = null;
        let finalizeError: string | undefined;

        if (analysisSucceeded > 0) {
          try {
            const r = await finalizeAnalysis(batchId, analysisSucceeded, true);
            data = r.data;
            if (data && data.newApplicationsCreated === 0) {
              finalizeError =
                'Jobs were scored but no applications were added to your pipeline. This can happen if analyses are incomplete — try running setup again.';
              setPageError(finalizeError);
            }
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
              finalizeError =
                'Could not find scored jobs for this batch. Please retry failed jobs or run setup again.';
            } else {
              finalizeError = 'Failed to finalize your pipeline. Please try again.';
            }
            setPageError(finalizeError);
          }
        } else {
          finalizeError = 'All job analyses failed. Check your connection and try again, or retry individual jobs below.';
          setPageError(finalizeError);
        }

        finalizeResultRef.current = {
          data,
          finalizeError,
          analysisSucceeded,
          analysisFailed,
        };
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

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        width: '100%', maxWidth: 400, padding: '0 24px', boxSizing: 'border-box',
      }}>
      {/* Orb */}
      <div style={{ width: 180, height: 180, marginBottom: 28, overflow: 'hidden', flexShrink: 0 }}>
      <svg width="180" height="180" viewBox="0 0 140 140" style={{ display: 'block', overflow: 'hidden' }}>
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
      </div>

      {/* Label + heading */}
      <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', margin: '0 0 6px 0' }}>
        Agent is working
      </p>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', margin: '0 0 18px 0', letterSpacing: '-0.02em', lineHeight: 1.2, textAlign: 'center' }}>
        Analyzing {jobs.length} position{jobs.length !== 1 ? 's' : ''}
      </h2>

      {/* Parallel job progress */}
      {jobStatuses.length > 0 && (
        <div style={{ width: '100%', marginBottom: 18, textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#94A3B8', margin: '0 0 12px 0', letterSpacing: '0.04em' }}>
            {(() => {
              const done = jobStatuses.filter((j) => j.status === 'success' || j.status === 'failed').length;
              const analyzing = jobStatuses.filter((j) => j.status === 'analyzing').length;
              if (done === jobStatuses.length) return `All ${jobStatuses.length} positions scored`;
              if (analyzing > 0) return `Scoring ${analyzing} position${analyzing !== 1 ? 's' : ''} simultaneously…`;
              return `Queuing analyses…`;
            })()}
          </p>

          {/* Job dots row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {jobStatuses.map((job, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div
                  title={job.label}
                  style={{
                    width: 10, height: 10, borderRadius: '50%',
                    transition: 'all 200ms ease',
                    background:
                      job.status === 'success' ? '#16A34A'
                      : job.status === 'failed' ? '#DC2626'
                      : job.status === 'analyzing' ? '#16A34A'
                      : '#C8D0DE',
                    opacity: job.status === 'pending' ? 0.4 : 1,
                    animation: job.status === 'analyzing' ? 'aw-breathe1 1.1s ease-in-out infinite' : undefined,
                  }}
                />
                {job.status === 'success' && job.matchScore !== undefined && (
                  <span style={{ fontSize: 9, fontWeight: 600, color: '#16A34A' }}>{job.matchScore}</span>
                )}
              </div>
            ))}
          </div>

          {/* Failed job retry buttons */}
          {jobStatuses.map((job, i) => job.status === 'failed' && (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
              <XCircle size={13} color="#DC2626" />
              <span style={{ fontSize: 12, color: '#DC2626', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {job.label}
              </span>
              <button
                type="button"
                onClick={() => handleRetry(i)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 11, fontWeight: 600, color: '#15803D',
                  background: '#F0FDF4', border: '1px solid #BBF7D0',
                  borderRadius: 8, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <RotateCcw size={11} /> Retry
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Single-step card — stat card gradient, 18px radius */}
      <div style={{
        background: 'linear-gradient(to right, #FFFFFF 0%, #C8D0DE 100%)',
        border: '1px solid #E2E8F0',
        borderRadius: 18,
        boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
        width: '100%',
        maxWidth: 320,
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
      </div>

      {/* Bottom caption / error */}
      {pageError ? (
        <p style={{
          position: 'absolute', bottom: 28, fontSize: 12, fontWeight: 500,
          color: '#DC2626', margin: 0, maxWidth: 360, textAlign: 'center', lineHeight: 1.5,
          padding: '0 24px',
        }}>
          {pageError}
        </p>
      ) : (
        <p style={{ position: 'absolute', bottom: 28, fontSize: 12, fontWeight: 300, color: '#94A3B8', margin: 0 }}>
          Analyzing {jobs.length} job{jobs.length !== 1 ? 's' : ''} against your profile
        </p>
      )}
    </div>
  );
}
