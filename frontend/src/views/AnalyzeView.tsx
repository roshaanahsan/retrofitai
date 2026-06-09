import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, AlertCircle, XCircle, Sparkles, Clock, ArrowRight } from 'lucide-react';
import { analyzeJob, generateCoverLetter, createApplication } from '@/lib/api';
import { cn, getVerdictStyle } from '@/lib/utils';
import type { JobAnalysis, Application } from '@/types';

interface AnalyzeViewProps {
  applications: Application[];
  setApplications: React.Dispatch<React.SetStateAction<Application[]>>;
  addMessage: (role: 'user' | 'agent', text: string) => void;
}

// Count-up with cubic ease-out
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

export default function AnalyzeView({ setApplications, addMessage }: AnalyzeViewProps) {
  const [jdText, setJdText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<JobAnalysis | null>(null);
  const [coverLetter, setCoverLetter] = useState<{ text: string; strategy: string } | null>(null);
  const [generatingCL, setGeneratingCL] = useState(false);
  const [addedToPipeline, setAddedToPipeline] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const scoreDisplay = useCountUp(result?.matchScore ?? 0, 800);

  async function handleAnalyze() {
    if (!jdText.trim() || analyzing) return;
    setAnalyzing(true);
    setResult(null);
    setCoverLetter(null);
    setAddedToPipeline(false);
    try {
      const { data } = await analyzeJob(jdText.trim());
      setResult(data.jobAnalysis);
      addMessage('agent', data.reply || 'Job analysis complete.');
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch {
      addMessage('agent', 'Job analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleGenerateCL() {
    if (!result || generatingCL) return;
    setGeneratingCL(true);
    try {
      const { data } = await generateCoverLetter(result._id);
      setCoverLetter({ text: data.coverLetterText, strategy: data.coverLetterStrategy });
      addMessage('agent', data.reply || 'Cover letter generated.');
    } catch {
      addMessage('agent', 'Cover letter generation failed. Please try again.');
    } finally {
      setGeneratingCL(false);
    }
  }

  async function handleAddToPipeline() {
    if (!result || addedToPipeline) return;
    try {
      const { data } = await createApplication({
        company: result.company,
        role: result.jobTitle,
        jobAnalysisId: result._id,
      });
      setApplications((prev: Application[]) => [data, ...prev]);
      setAddedToPipeline(true);
      addMessage('agent', `Added ${result.company} — ${result.jobTitle} to your pipeline.`);
    } catch {
      addMessage('agent', 'Failed to add to pipeline.');
    }
  }

  const scoreColor =
    result
      ? result.matchScore >= 70
        ? '#10B981'
        : result.matchScore >= 45
        ? '#F59E0B'
        : '#EF4444'
      : '#00e5ff';

  return (
    <div className="p-6 space-y-5 max-w-2xl">

      {/* Page header */}
      <div>
        <h1
          className="text-xl font-semibold tracking-tight"
          style={{ color: '#FAFAFA', letterSpacing: '-0.02em' }}
        >
          Job Analyzer
        </h1>
        <p className="text-xs mt-1" style={{ color: '#52525B' }}>
          Paste any job description — get a match score, gap analysis, and tailored cover letter in seconds
        </p>
      </div>

      {/* Input area */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'rgba(24,24,27,0.70)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
        }}
      >
        <div className="px-4 pt-4">
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste any job description here..."
            rows={8}
            className="w-full rounded-md px-4 py-3 text-xs resize-none"
            style={{
              background: 'rgba(9,9,11,0.80)',
              color: '#A1A1AA',
              outline: 'none',
              lineHeight: 1.7,
              boxShadow: '0 2px 12px 0 rgba(0,0,0,0.30)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.45), 0 2px 12px 0 rgba(0,0,0,0.30)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.30)';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAnalyze();
            }}
          />
        </div>
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.04)' }}
        >
          <span className="text-[10px]" style={{ color: '#3F3F46' }}>
            {jdText.length > 0 ? `${jdText.length} chars` : '⌘↵ to analyze'}
          </span>
          <button
            onClick={handleAnalyze}
            disabled={!jdText.trim() || analyzing}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors',
              jdText.trim() && !analyzing
                ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                : 'cursor-not-allowed'
            )}
            style={
              !jdText.trim() || analyzing
                ? { background: '#27272A', color: '#3F3F46' }
                : undefined
            }
          >
            {analyzing ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={12} />
                Analyze This Job
              </>
            )}
          </button>
        </div>
      </div>

      {/* Empty placeholder — only shows before first analysis */}
      {!result && (
        <div className="relative">
          {/* Ghost preview cards */}
          <div className="grid grid-cols-3 gap-3 pointer-events-none select-none" style={{ opacity: 0.28, filter: 'blur(2px)' }}>
            {/* Match Score ghost */}
            <div
              className="rounded-xl p-5 flex flex-col gap-3"
              style={{ background: 'rgba(24,24,27,0.70)', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)' }}
            >
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#52525B' }}>Match Score</p>
              <p className="text-5xl font-bold tabular-nums" style={{ color: '#FAFAFA', letterSpacing: '-0.04em' }}>78</p>
              <div className="h-2 rounded-full" style={{ background: '#27272A' }}>
                <div className="h-full w-3/4 rounded-full" style={{ background: 'linear-gradient(to right, #10B98188, #10B981)' }} />
              </div>
              <div className="space-y-1.5">
                {['React', 'TypeScript', 'Node.js'].map(s => (
                  <div key={s} className="flex items-center gap-2 text-xs" style={{ color: '#A1A1AA' }}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#10B981' }} />
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Gap Analysis ghost */}
            <div
              className="rounded-xl p-5 flex flex-col gap-3"
              style={{ background: 'rgba(24,24,27,0.70)', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)' }}
            >
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#52525B' }}>Gap Analysis</p>
              <div className="space-y-2">
                {['AWS Certification', 'Kubernetes', 'Team Leadership', 'ML Experience'].map(g => (
                  <div key={g} className="flex items-center gap-2 text-xs" style={{ color: '#A1A1AA' }}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: '#F59E0B' }} />
                    {g}
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-3" style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.05)' }}>
                <span className="text-xs px-2 py-1 rounded-md" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}>Apply with edits</span>
              </div>
            </div>

            {/* Cover Letter ghost */}
            <div
              className="rounded-xl p-5 flex flex-col gap-3"
              style={{ background: 'rgba(24,24,27,0.70)', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)' }}
            >
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#52525B' }}>Cover Letter</p>
              <div className="space-y-2">
                {[80, 65, 90, 55, 75, 45, 85].map((w, i) => (
                  <div key={i} className="h-2 rounded-full" style={{ background: '#27272A', width: `${w}%` }} />
                ))}
              </div>
              <div className="mt-auto pt-3" style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.05)' }}>
                <span className="text-xs" style={{ color: '#52525B' }}>Tailored to this role</span>
              </div>
            </div>
          </div>

          {/* Overlay text */}
          <div className="absolute inset-0 flex items-center justify-center">
            <p
              className="text-sm font-medium text-center px-6 py-3 rounded-xl"
              style={{
                color: '#A1A1AA',
                background: 'rgba(9,9,11,0.65)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
              }}
            >
              Paste a job description above to see your analysis
            </p>
          </div>
        </div>
      )}

      {/* Analysis Results */}
      {result && (
        <div
          ref={resultRef}
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(24,24,27,0.70)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          {/* Job header */}
          <div className="px-5 py-4" style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}>
            <div className="flex items-start gap-3">
              {result.company && (
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{ background: '#27272A', color: '#00e5ff', boxShadow: '0 2px 8px 0 rgba(0,0,0,0.30)' }}
                >
                  {result.company.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-tight" style={{ color: '#FAFAFA' }}>
                  {result.jobTitle}
                  {result.company && (
                    <span style={{ color: '#52525B', fontWeight: 400 }}> · {result.company}</span>
                  )}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  {result.postingAge !== null && (
                    <span
                      className="flex items-center gap-1 text-[10px]"
                      style={{
                        color:
                          result.postingAge <= 7
                            ? '#10B981'
                            : result.postingAge <= 21
                            ? '#F59E0B'
                            : '#EF4444',
                      }}
                    >
                      <Clock size={9} />
                      Posted {result.postingAge}d ago
                      {result.postingAge <= 7
                        ? ' — apply immediately'
                        : result.postingAge > 30
                        ? ' — likely filled'
                        : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Score — the hero number */}
          <div
            className="px-5 py-5 flex items-center gap-5"
            style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}
          >
            {/* Big score number */}
            <div className="flex flex-col items-center justify-center shrink-0 relative">
              <p
                className="tabular-nums font-bold leading-none"
                style={{ color: scoreColor, fontSize: 52, letterSpacing: '-0.05em' }}
              >
                {scoreDisplay}
              </p>
              <p className="text-[10px] mt-1 uppercase tracking-widest font-medium" style={{ color: '#3F3F46' }}>
                / 100
              </p>
            </div>

            {/* Score detail */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <p
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: '#52525B' }}
                >
                  Match Score
                </p>
                <p
                  className="text-[10px] font-medium"
                  style={{
                    color:
                      result.matchScore >= 70
                        ? '#10B981'
                        : result.matchScore >= 45
                        ? '#F59E0B'
                        : '#EF4444',
                  }}
                >
                  {result.matchScore >= 70
                    ? 'Strong match'
                    : result.matchScore >= 45
                    ? 'Moderate match'
                    : 'Weak match'}
                </p>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#27272A' }}>
                <div
                  className="h-full rounded-full score-bar-fill"
                  style={{
                    width: `${scoreDisplay}%`,
                    background: `linear-gradient(to right, ${scoreColor}88, ${scoreColor})`,
                  }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[9px]" style={{ color: '#3F3F46' }}>0</span>
                <span
                  className="text-[9px] font-medium"
                  style={{ color: scoreColor }}
                >
                  {scoreDisplay >= 70 ? 'Good to go' : scoreDisplay >= 45 ? 'Needs work' : 'Not ready'}
                </span>
                <span className="text-[9px]" style={{ color: '#3F3F46' }}>100</span>
              </div>
            </div>
          </div>

          {/* Strengths + Gaps */}
          <div
            className="grid grid-cols-2"
            style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}
          >
            <div className="px-5 py-4" style={{ boxShadow: '1px 0 0 0 rgba(255,255,255,0.05)' }}>
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: '#10B981' }}
                >
                  Strengths
                </p>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#10B981' }}
                >
                  {result.strongMatches.length}
                </span>
              </div>
              <ul className="space-y-2">
                {result.strongMatches.map((m) => (
                  <li
                    key={m}
                    className="flex items-start gap-2 text-xs"
                    style={{ color: '#A1A1AA' }}
                  >
                    <CheckCircle
                      size={11}
                      className="shrink-0 mt-0.5"
                      style={{ color: '#10B981' }}
                    />
                    {m}
                  </li>
                ))}
                {result.strongMatches.length === 0 && (
                  <li className="text-xs" style={{ color: '#3F3F46' }}>None found</li>
                )}
              </ul>
            </div>

            <div className="px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p
                  className="text-[10px] uppercase tracking-widest font-semibold"
                  style={{ color: '#F59E0B' }}
                >
                  Gaps
                </p>
                {result.gaps.length > 0 && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B' }}
                  >
                    {result.gaps.length}
                  </span>
                )}
              </div>
              <ul className="space-y-2">
                {result.gaps.map((g) => (
                  <li
                    key={g}
                    className="flex items-start gap-2 text-xs"
                    style={{ color: '#A1A1AA' }}
                  >
                    <AlertCircle
                      size={11}
                      className="shrink-0 mt-0.5"
                      style={{ color: '#F59E0B' }}
                    />
                    {g}
                  </li>
                ))}
                {result.gaps.length === 0 && (
                  <li className="text-xs" style={{ color: '#3F3F46' }}>No major gaps</li>
                )}
              </ul>
            </div>
          </div>

          {/* Missing ATS keywords */}
          {result.missingKeywords.length > 0 && (
            <div className="px-5 py-4" style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}>
              <p
                className="text-[10px] uppercase tracking-widest font-semibold mb-3"
                style={{ color: '#52525B' }}
              >
                Missing ATS Keywords
              </p>
              <div className="flex flex-wrap gap-1.5">
                {result.missingKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-[11px] px-2 py-0.5 rounded-md"
                    style={{
                      background: '#27272A',
                      color: '#71717A',
                      boxShadow: '0 0 0 1px rgba(63,63,70,0.5)',
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Verdict — full-width banner */}
          <VerdictBanner verdict={result.verdict} />

          {/* Action buttons */}
          <div className="px-5 py-4 flex gap-2">
            <button
              onClick={handleGenerateCL}
              disabled={generatingCL}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors"
              style={{
                background: 'transparent',
                color: '#A1A1AA',
                boxShadow: '0 0 0 1px rgba(63,63,70,0.5)',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = '#27272A';
                (e.currentTarget as HTMLButtonElement).style.color = '#FAFAFA';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#A1A1AA';
              }}
            >
              {generatingCL ? (
                <><Loader2 size={11} className="animate-spin" /> Generating...</>
              ) : (
                <><Sparkles size={11} /> Generate Cover Letter</>
              )}
            </button>
            <button
              onClick={handleAddToPipeline}
              disabled={addedToPipeline}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors',
                addedToPipeline ? 'cursor-not-allowed' : 'bg-indigo-500 hover:bg-indigo-600 text-white'
              )}
              style={
                addedToPipeline
                  ? { background: '#001a22', color: '#00e5ff', boxShadow: '0 0 0 1px rgba(99,102,241,0.2)' }
                  : undefined
              }
            >
              {addedToPipeline ? (
                <><CheckCircle size={11} /> Added to Pipeline</>
              ) : (
                <><ArrowRight size={11} /> Add to Pipeline</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Cover Letter */}
      {coverLetter && (
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'rgba(24,24,27,0.70)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.20)',
          }}
        >
          <div
            className="px-5 py-3 flex items-center justify-between"
            style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.05)' }}
          >
            <p
              className="text-[10px] uppercase tracking-widest font-semibold"
              style={{ color: '#52525B' }}
            >
              Cover Letter
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(coverLetter.text);
              }}
              className="text-[10px] transition-colors"
              style={{ color: '#3F3F46' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#00e5ff'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#3F3F46'; }}
            >
              Copy
            </button>
          </div>

          <div
            className="px-5 py-4 text-sm leading-relaxed whitespace-pre-wrap text-xs"
            style={{
              background: 'rgba(9,9,11,0.60)',
              color: '#A1A1AA',
              lineHeight: 1.8,
            }}
          >
            {coverLetter.text}
          </div>

          {coverLetter.strategy && (
            <div
              className="px-5 py-4"
              style={{
                background: 'rgba(30,27,75,0.60)',
                boxShadow: '0 -1px 0 0 rgba(99,102,241,0.12)',
              }}
            >
              <p
                className="text-[10px] uppercase tracking-widest font-semibold mb-1.5 flex items-center gap-1.5"
                style={{ color: '#00e5ff' }}
              >
                <Sparkles size={10} />
                Strategy Note
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#67e8f9' }}>
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
      bg: 'rgba(16,185,129,0.08)',
      shadowColor: 'rgba(16,185,129,0.15)',
      color: '#10B981',
      icon: CheckCircle,
      desc: 'Your profile aligns well with this role — apply without delay.',
    },
    APPLY_WITH_EDITS: {
      bg: 'rgba(245,158,11,0.08)',
      shadowColor: 'rgba(245,158,11,0.15)',
      color: '#F59E0B',
      icon: AlertCircle,
      desc: 'Address the gaps above before applying to improve your odds.',
    },
    SKIP_THIS_ONE: {
      bg: 'rgba(239,68,68,0.08)',
      shadowColor: 'rgba(239,68,68,0.15)',
      color: '#EF4444',
      icon: XCircle,
      desc: 'Too many gaps — invest time in better-matched opportunities.',
    },
  } as const;

  const cfg = config[verdict as keyof typeof config] ?? config.APPLY_WITH_EDITS;
  const Icon = cfg.icon;

  return (
    <div
      className="px-5 py-4 verdict-enter flex items-center gap-4"
      style={{
        background: cfg.bg,
        boxShadow: `0 -1px 0 0 ${cfg.shadowColor}, 0 1px 0 0 ${cfg.shadowColor}`,
      }}
    >
      <Icon size={20} className="shrink-0" style={{ color: cfg.color }} />
      <div>
        <p
          className="text-base font-bold leading-tight"
          style={{ color: cfg.color, letterSpacing: '-0.01em' }}
        >
          {label}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: cfg.color, opacity: 0.6 }}>
          {cfg.desc}
        </p>
      </div>
    </div>
  );
}
