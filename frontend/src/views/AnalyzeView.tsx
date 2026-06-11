import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle, XCircle, Sparkles, Clock, ArrowRight, TrendingUp, AlertTriangle, Trash2 } from 'lucide-react';
import { analyzeJob, generateCoverLetter, createApplication } from '@/lib/api';
import { getVerdictStyle } from '@/lib/utils';
import type { JobAnalysis, Application } from '@/types';

interface AnalyzeViewProps {
  applications: Application[];
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  addMessage: (role: 'user' | 'agent', text: string) => void;
  openChat: () => void;
}

function AnalyzeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  const { onFocus, onBlur, ...rest } = props;
  return (
    <div style={{
      borderRadius: 18,
      border: `1px solid ${focused ? '#16A34A' : '#E2E8F0'}`,
      overflow: 'hidden',
      transition: 'border-color 150ms',
      background: '#F8FAFC',
    }}>
      <textarea
        {...rest}
        style={{
          width: '100%',
          height: 200,
          resize: 'none',
          border: 'none',
          borderRadius: 0,
          padding: '14px 16px',
          fontSize: 14,
          fontFamily: 'Poppins, sans-serif',
          fontWeight: 400,
          background: 'transparent',
          color: '#0F172A',
          outline: 'none',
          lineHeight: 1.7,
          display: 'block',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      />
    </div>
  );
}

function useCountUp(target: number, duration = 700) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    let frame = 0;
    const totalFrames = Math.round(duration / 16);
    const timer = setInterval(() => {
      frame++;
      const eased = 1 - Math.pow(1 - frame / totalFrames, 3);
      setCount(Math.round(eased * target));
      if (frame >= totalFrames) { setCount(target); clearInterval(timer); }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

const CARD: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: 18,
  boxShadow: '0 6px 30px rgba(0,0,0,0.09)',
};

const GRAD_CARD: React.CSSProperties = {
  ...CARD,
  background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)',
};

export default function AnalyzeView({ setApplications, addMessage, openChat }: AnalyzeViewProps) {
  const [jdText, setJdText]             = useState('');
  const [analyzing, setAnalyzing]       = useState(false);
  const [hasAnalyzed, setHasAnalyzed]   = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [result, setResult]             = useState<JobAnalysis | null>(null);
  const [coverLetter, setCoverLetter]   = useState<{ text: string; strategy: string } | null>(null);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [clError, setClError]           = useState<string | null>(null);
  const [addedToPipeline, setAddedToPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const scoreDisplay = useCountUp(result?.matchScore ?? 0, 800);

  function handleClear() {
    setJdText('');
    setHasAnalyzed(false);
    setResult(null);
    setCoverLetter(null);
    setAnalyzeError(null);
    setClError(null);
    setPipelineError(null);
    setAddedToPipeline(false);
  }

  async function handleAnalyze() {
    if (jdText.length < 150 || analyzing) return;
    openChat();
    setAnalyzing(true);
    setHasAnalyzed(true);
    setResult(null);
    setAnalyzeError(null);
    setClError(null);
    setPipelineError(null);
    setCoverLetter(null);
    setAddedToPipeline(false);
    try {
      const { data } = await analyzeJob(jdText.trim());
      if (!data?.jobAnalysis) throw new Error('No analysis returned');
      setResult(data.jobAnalysis);
      addMessage('agent', data.reply || 'Job analysis complete.');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('network');
      setAnalyzeError(
        isTimeout
          ? 'Analysis is taking longer than expected. The AI may be busy — please try again.'
          : 'Analysis failed. Check your connection and try again.'
      );
      addMessage('agent', 'Job analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateCL() {
    if (!result || generatingCL) return;
    setGeneratingCL(true);
    setClError(null);
    try {
      const { data } = await generateCoverLetter(result._id);
      if (!data?.coverLetterText) throw new Error('No cover letter returned');
      setCoverLetter({ text: data.coverLetterText, strategy: data.coverLetterStrategy ?? '' });
      addMessage('agent', data.reply || 'Cover letter generated.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      const isTimeout = msg.toLowerCase().includes('timeout') || msg.toLowerCase().includes('network');
      setClError(
        isTimeout
          ? 'Request timed out — the AI may be busy. Please try again.'
          : 'Cover letter generation failed. Please try again.'
      );
    } finally {
      setGeneratingCL(false);
    }
  }

  async function handleAddToPipeline() {
    if (!result || addedToPipeline) return;
    setPipelineError(null);
    try {
      const { data } = await createApplication({
        company: result.company || 'Unknown Company',
        role: result.jobTitle || 'Unknown Role',
        jobAnalysisId: result._id,
      });
      setApplications((prev: Application[]) => [data, ...prev]);
      setAddedToPipeline(true);
      addMessage('agent', `Added ${result.company} — ${result.jobTitle} to your pipeline.`);
    } catch {
      setPipelineError('Failed to add to pipeline. Please try again.');
    }
  }

  const scoreColor =
    result
      ? result.matchScore >= 70 ? '#16A34A'
        : result.matchScore >= 45 ? '#D97706'
        : '#DC2626'
      : '#16A34A';

  const ready = jdText.length >= 150 && !analyzing;

  return (
    <div className="p-8 space-y-5 max-w-2xl">

      {/* Page header */}
      <div className="mb-6">
        <h1 style={{ fontSize: 32, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
          Job Analyzer
        </h1>
        <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', marginTop: 6 }}>
          Paste any job description — get a match score, gap analysis, and tailored cover letter in seconds.
        </p>
      </div>

      {/* Input card */}
      <div style={CARD}>
        <div style={{ padding: '16px 16px 0' }}>
          <AnalyzeTextarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste any job description here..."
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAnalyze(); }}
          />
        </div>

        <div style={{ padding: '6px 16px 2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{
            fontSize: 11,
            fontWeight: 400,
            color: jdText.length >= 150 ? '#16A34A' : '#94A3B8',
          }}>
            {jdText.length > 0 ? `${jdText.length} chars` : 'Minimum 150 characters to analyze'}
          </span>
          {jdText.length >= 150 && (
            <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 500 }}>⌘/Ctrl + ↵ to analyze</span>
          )}
        </div>

        <div style={{ padding: '8px 16px 16px' }}>
          <button
            onClick={handleAnalyze}
            disabled={!ready}
            style={{
              width: '100%',
              height: 48,
              borderRadius: 18,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'Poppins, sans-serif',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: 'none',
              cursor: ready ? 'pointer' : 'not-allowed',
              transition: 'background 150ms',
              background: ready
                ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
                : '#F1F5F9',
              color: ready ? '#FFFFFF' : '#94A3B8',
            }}
            onMouseEnter={(e) => { if (ready) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
            onMouseLeave={(e) => { if (ready) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
          >
            {analyzing
              ? <><Loader2 size={15} className="animate-spin" /> Analyzing…</>
              : <><Sparkles size={15} /> Analyze This Job</>}
          </button>
        </div>
      </div>

      {/* Ghost preview — mirrors actual result card, shown until Analyze is clicked */}
      {!hasAnalyzed && !jdText.trim() && (
        <div style={{ position: 'relative' }}>
          <div className="pointer-events-none select-none" style={{ opacity: 0.28, filter: 'blur(3px)', ...CARD, overflow: 'hidden' }}>
            {/* Ghost: job header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#FFFFFF',
                }}>S</div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}>
                    Senior Software Engineer <span style={{ color: '#94A3B8', fontWeight: 400 }}>· Stripe</span>
                  </p>
                  <span style={{ fontSize: 11, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Clock size={9} /> Posted 3d ago — apply immediately
                  </span>
                </div>
              </div>
            </div>
            {/* Ghost: score hero */}
            <div style={{ padding: '20px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <p style={{ fontSize: 64, fontWeight: 700, color: '#16A34A', letterSpacing: '-0.05em', lineHeight: 1 }}>78</p>
                <p style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 400, marginTop: 2 }}>/ 100</p>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>Match Score</p>
                  <p style={{ fontSize: 11, fontWeight: 600, color: '#16A34A' }}>Strong match</p>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: '#F1F5F9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '78%', borderRadius: 999, background: 'linear-gradient(to right, #16A34A66, #16A34A)' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: '#CBD5E1' }}>0</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: '#16A34A' }}>Good to go</span>
                  <span style={{ fontSize: 10, color: '#CBD5E1' }}>100</span>
                </div>
              </div>
            </div>
            {/* Ghost: strengths + gaps */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ padding: '16px 20px', borderRight: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#16A34A' }}>Strengths</p>
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#DCFCE7', color: '#16A34A', padding: '1px 6px', borderRadius: 4 }}>4</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['React', 'TypeScript', 'Node.js', 'REST APIs'].map(s => (
                    <span key={s} style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0', fontSize: 11, fontWeight: 500 }}>{s}</span>
                  ))}
                </div>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#D97706' }}>Gaps</p>
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#FEF3C7', color: '#D97706', padding: '1px 6px', borderRadius: 4 }}>2</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['AWS', 'Kubernetes'].map(g => (
                    <span key={g} style={{ display: 'inline-flex', alignItems: 'center', height: 28, padding: '0 10px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontSize: 11, fontWeight: 500 }}>{g}</span>
                  ))}
                </div>
              </div>
            </div>
            {/* Ghost: ATS keywords */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10 }}>Missing ATS Keywords</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Terraform', 'CI/CD', 'Microservices', 'gRPC'].map(kw => (
                  <span key={kw} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0' }}>{kw}</span>
                ))}
              </div>
            </div>
            {/* Ghost: verdict */}
            <div style={{ padding: '16px 20px', background: '#F0FDF4', borderTop: '1px solid #BBF7D0', borderBottom: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: 14 }}>
              <CheckCircle size={22} style={{ color: '#16A34A', flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: 22, fontWeight: 700, color: '#16A34A', letterSpacing: '-0.02em', lineHeight: 1 }}>Apply Now</p>
                <p style={{ fontSize: 12, color: '#16A34A', opacity: 0.7, marginTop: 3, fontWeight: 300 }}>Your profile aligns well with this role — apply without delay.</p>
              </div>
            </div>
            {/* Ghost: action buttons */}
            <div style={{ padding: '14px 20px 14px', display: 'flex', gap: 10 }}>
              <div style={{ flex: 1, height: 44, borderRadius: 18, background: 'transparent', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Sparkles size={12} style={{ color: '#16A34A' }} />
                <span style={{ fontSize: 13, fontWeight: 500, color: '#16A34A' }}>Generate Cover Letter</span>
              </div>
              <div style={{ flex: 1, height: 44, borderRadius: 18, background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <ArrowRight size={12} style={{ color: '#FFFFFF' }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>Add to Pipeline</span>
              </div>
            </div>
          </div>
          {/* Overlay label */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#64748B',
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(8px)',
              padding: '10px 20px',
              borderRadius: 18,
              border: '1px solid #E2E8F0',
              boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
            }}>
              Paste a job description above to see your analysis
            </p>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {analyzing && (
        <div style={{ ...CARD, padding: '24px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: '#F1F5F9' }} className="animate-pulse" />
            <div style={{ flex: 1 }}>
              <div style={{ height: 12, borderRadius: 6, background: '#F1F5F9', width: '55%', marginBottom: 6 }} className="animate-pulse" />
              <div style={{ height: 10, borderRadius: 6, background: '#F1F5F9', width: '30%' }} className="animate-pulse" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 20, marginBottom: 20 }}>
            <div style={{ width: 80, height: 80, borderRadius: 12, background: '#F1F5F9' }} className="animate-pulse" />
            <div style={{ flex: 1 }}>
              <div style={{ height: 8, borderRadius: 6, background: '#F1F5F9', width: '100%', marginBottom: 8 }} className="animate-pulse" />
              <div style={{ height: 8, borderRadius: 6, background: '#F1F5F9', width: '80%', marginBottom: 8 }} className="animate-pulse" />
              <div style={{ height: 8, borderRadius: 6, background: '#F1F5F9', width: '60%' }} className="animate-pulse" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {[60, 80, 50, 70].map((w, i) => (
              <div key={i} style={{ height: 28, borderRadius: 999, background: '#F1F5F9', width: w }} className="animate-pulse" />
            ))}
          </div>
          <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 8 }}>
            AI is reading the job description…
          </p>
        </div>
      )}

      {/* Inline error */}
      {analyzeError && !analyzing && !result && (
        <div style={{
          ...CARD,
          padding: '16px 20px',
          display: 'flex', alignItems: 'flex-start', gap: 12,
          background: '#FEF2F2', border: '1px solid #FECACA',
        }}>
          <AlertTriangle size={16} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#DC2626' }}>Analysis failed</p>
            <p style={{ fontSize: 12, fontWeight: 300, color: '#B91C1C', marginTop: 2 }}>{analyzeError}</p>
          </div>
          <button
            onClick={() => { setAnalyzeError(null); setHasAnalyzed(false); }}
            style={{ fontSize: 11, fontWeight: 500, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultRef} style={{ ...CARD, overflow: 'hidden' }}>

          {/* Job header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {result.company && (
                <div style={{
                  width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                  background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 700, color: '#FFFFFF',
                }}>
                  {result.company.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', lineHeight: 1.3 }}>
                  {result.jobTitle || 'Job Analysis'}
                  {result.company && (
                    <span style={{ color: '#94A3B8', fontWeight: 400 }}> · {result.company}</span>
                  )}
                </p>
                {result.postingAge !== null && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                    fontSize: 11, fontWeight: 400,
                    color: result.postingAge <= 7 ? '#16A34A' : result.postingAge <= 21 ? '#D97706' : '#DC2626',
                  }}>
                    <Clock size={9} />
                    Posted {result.postingAge}d ago
                    {result.postingAge <= 7 ? ' — apply immediately' : result.postingAge > 30 ? ' — likely filled' : ''}
                  </span>
                )}
              </div>
              {/* Clear button — inside header row, no overlap with borders */}
              <button
                onClick={handleClear}
                title="Clear analysis"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: 'transparent', border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: '#CBD5E1', flexShrink: 0,
                  minHeight: 'unset', transition: 'color 120ms, background 120ms',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#DC2626';
                  (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1';
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>

          {/* Score hero */}
          <div style={{ padding: '20px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <p style={{ fontSize: 64, fontWeight: 700, color: scoreColor, letterSpacing: '-0.05em', lineHeight: 1 }}>
                {scoreDisplay}
              </p>
              <p style={{ fontSize: 11, color: '#CBD5E1', fontWeight: 400, marginTop: 2 }}>/ 100</p>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>
                  Match Score
                </p>
                <p style={{ fontSize: 11, fontWeight: 600, color: scoreColor }}>
                  {result.matchScore >= 70 ? 'Strong match' : result.matchScore >= 45 ? 'Moderate match' : 'Weak match'}
                </p>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: '#F1F5F9', overflow: 'hidden' }}>
                <div
                  className="score-bar-fill"
                  style={{ height: '100%', width: `${scoreDisplay}%`, borderRadius: 999, background: `linear-gradient(to right, ${scoreColor}66, ${scoreColor})` }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: '#CBD5E1' }}>0</span>
                <span style={{ fontSize: 10, fontWeight: 500, color: scoreColor }}>
                  {scoreDisplay >= 70 ? 'Good to go' : scoreDisplay >= 45 ? 'Needs work' : 'Not ready'}
                </span>
                <span style={{ fontSize: 10, color: '#CBD5E1' }}>100</span>
              </div>
            </div>
          </div>

          {/* Strengths + Gaps */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #E2E8F0' }}>
            {/* Strengths */}
            <div style={{ padding: '16px 20px', borderRight: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#16A34A' }}>
                  Strengths
                </p>
                <span style={{ fontSize: 10, fontWeight: 600, background: '#DCFCE7', color: '#16A34A', padding: '1px 6px', borderRadius: 4 }}>
                  {(result.strongMatches ?? []).length}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(result.strongMatches ?? []).map((m) => (
                  <span key={m} style={{
                    display: 'inline-flex', alignItems: 'center', height: 28,
                    padding: '0 10px', borderRadius: 999,
                    background: '#F0FDF4', color: '#16A34A',
                    border: '1px solid #BBF7D0', fontSize: 11, fontWeight: 500,
                  }}>{m}</span>
                ))}
                {(result.strongMatches ?? []).length === 0 && (
                  <span style={{ fontSize: 12, color: '#CBD5E1' }}>None found</span>
                )}
              </div>
            </div>

            {/* Gaps */}
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#D97706' }}>
                  Gaps
                </p>
                {(result.gaps ?? []).length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, background: '#FEF3C7', color: '#D97706', padding: '1px 6px', borderRadius: 4 }}>
                    {(result.gaps ?? []).length}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(result.gaps ?? []).map((g, i) => (
                  <span key={`${g}-${i}`} style={{
                    display: 'inline-flex', alignItems: 'center', height: 28,
                    padding: '0 10px', borderRadius: 999,
                    background: '#FEF2F2', color: '#DC2626',
                    border: '1px solid #FECACA', fontSize: 11, fontWeight: 500,
                  }}>{g}</span>
                ))}
                {(result.gaps ?? []).length === 0 && (
                  <span style={{ fontSize: 12, color: '#CBD5E1' }}>No major gaps</span>
                )}
              </div>
            </div>
          </div>

          {/* Missing ATS keywords */}
          {(result.missingKeywords ?? []).length > 0 && (
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8', marginBottom: 10 }}>
                Missing ATS Keywords
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(result.missingKeywords ?? []).map((kw, i) => (
                  <span key={`${kw}-${i}`} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6,
                    background: '#F8FAFC', color: '#64748B',
                    border: '1px solid #E2E8F0',
                  }}>{kw}</span>
                ))}
              </div>
            </div>
          )}

          {/* Verdict */}
          <VerdictBanner verdict={result.verdict} />

          {/* Action buttons */}
          <div style={{ padding: '14px 20px 0', display: 'flex', gap: 10 }}>
            <button
              onClick={handleGenerateCL}
              disabled={generatingCL}
              style={{
                flex: 1, height: 44, borderRadius: 18,
                fontSize: 13, fontWeight: 500, fontFamily: 'Poppins, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'transparent', color: '#16A34A',
                border: '1px solid #BBF7D0', cursor: generatingCL ? 'not-allowed' : 'pointer',
                transition: 'background 120ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              {generatingCL
                ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
                : <><Sparkles size={12} /> Generate Cover Letter</>}
            </button>
            <button
              onClick={handleAddToPipeline}
              disabled={addedToPipeline}
              style={{
                flex: 1, height: 44, borderRadius: 18,
                fontSize: 13, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                border: 'none', cursor: addedToPipeline ? 'not-allowed' : 'pointer',
                transition: 'background 120ms',
                background: addedToPipeline
                  ? '#F0FDF4'
                  : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: addedToPipeline ? '#16A34A' : '#FFFFFF',
              }}
              onMouseEnter={(e) => { if (!addedToPipeline) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
              onMouseLeave={(e) => { if (!addedToPipeline) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
            >
              {addedToPipeline
                ? <><CheckCircle size={12} /> Added to Pipeline</>
                : <><ArrowRight size={12} /> Add to Pipeline</>}
            </button>
          </div>

          {/* Inline errors for action buttons */}
          {(clError || pipelineError) && (
            <div style={{ padding: '8px 20px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 10,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                }}>
                  <AlertTriangle size={12} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#B91C1C', flex: 1 }}>{clError}</span>
                  <button
                    onClick={() => setClError(null)}
                    style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                  >Dismiss</button>
                </div>
              )}
              {pipelineError && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 10,
                  background: '#FEF2F2', border: '1px solid #FECACA',
                }}>
                  <AlertTriangle size={12} style={{ color: '#DC2626', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#B91C1C', flex: 1 }}>{pipelineError}</span>
                  <button
                    onClick={() => setPipelineError(null)}
                    style={{ fontSize: 11, color: '#DC2626', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
                  >Dismiss</button>
                </div>
              )}
            </div>
          )}
          {/* Bottom padding when no errors */}
          {!clError && !pipelineError && <div style={{ height: 14 }} />}
        </div>
      )}

      {/* Cover Letter */}
      {coverLetter && (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          <div style={{
            padding: '12px 20px', borderBottom: '1px solid #E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 60%)',
          }}>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94A3B8' }}>
              Cover Letter
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(coverLetter.text)}
              style={{
                fontSize: 11, fontWeight: 500, color: '#94A3B8',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                transition: 'color 120ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#16A34A'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; }}
            >
              Copy
            </button>
          </div>

          <div style={{ padding: '16px 20px', background: '#F8FAFC' }}>
            <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontWeight: 300 }}>
              {coverLetter.text}
            </p>
          </div>

          {coverLetter.strategy && (
            <div style={{ padding: '14px 20px', background: '#F0FDF4', borderTop: '1px solid #BBF7D0' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#16A34A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <TrendingUp size={10} /> Strategy Note
              </p>
              <p style={{ fontSize: 12, color: '#15803D', lineHeight: 1.6, fontWeight: 300 }}>
                {coverLetter.strategy}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function VerdictBanner({ verdict }: { verdict: JobAnalysis['verdict'] }) {
  const { label } = getVerdictStyle(verdict);

  const config = {
    APPLY_NOW: {
      bg: '#F0FDF4', border: '#BBF7D0',
      color: '#16A34A', icon: CheckCircle,
      desc: 'Your profile aligns well with this role — apply without delay.',
    },
    APPLY_WITH_EDITS: {
      bg: '#FFFBEB', border: '#FDE68A',
      color: '#D97706', icon: AlertCircle,
      desc: 'Address the gaps above before applying to improve your odds.',
    },
    SKIP_THIS_ONE: {
      bg: '#FEF2F2', border: '#FECACA',
      color: '#DC2626', icon: XCircle,
      desc: 'Too many gaps — invest time in better-matched opportunities.',
    },
  } as const;

  const cfg = config[verdict as keyof typeof config] ?? config.APPLY_WITH_EDITS;
  const Icon = cfg.icon;

  return (
    <div style={{
      padding: '16px 20px',
      background: cfg.bg,
      borderTop: `1px solid ${cfg.border}`,
      borderBottom: `1px solid ${cfg.border}`,
      display: 'flex', alignItems: 'center', gap: 14,
    }}
      className="verdict-enter"
    >
      <Icon size={22} style={{ color: cfg.color, flexShrink: 0 }} />
      <div>
        <p style={{ fontSize: 22, fontWeight: 700, color: cfg.color, letterSpacing: '-0.02em', lineHeight: 1 }}>
          {label}
        </p>
        <p style={{ fontSize: 12, color: cfg.color, opacity: 0.7, marginTop: 3, fontWeight: 300 }}>
          {cfg.desc}
        </p>
      </div>
    </div>
  );
}
