import { useEffect, useState, useCallback } from 'react';
import { getJobAnalyses } from '@/lib/api';
import { ChevronRight, RefreshCw, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

interface JobAnalysis {
  _id: string;
  jobTitle: string;
  company: string;
  matchScore: number;
  strongMatches: string[];
  gaps: string[];
  missingKeywords: string[];
  verdict: 'APPLY_NOW' | 'APPLY_WITH_EDITS' | 'SKIP';
  analyzedAt: string;
}

interface Props {
  batchId: string;
  expectedCount: number;
  onDone: () => void;
}

const VERDICT_CONFIG = {
  APPLY_NOW: {
    label: 'Apply Now',
    bg: '#F0FDF4',
    border: '#BBF7D0',
    color: '#15803D',
    dot: '#16A34A',
  },
  APPLY_WITH_EDITS: {
    label: 'Apply with Edits',
    bg: '#FFFBEB',
    border: '#FDE68A',
    color: '#92400E',
    dot: '#D97706',
  },
  SKIP: {
    label: 'Skip',
    bg: '#F8FAFC',
    border: '#E2E8F0',
    color: '#64748B',
    dot: '#94A3B8',
  },
};

function scoreColor(score: number) {
  if (score >= 78) return '#16A34A';
  if (score >= 58) return '#D97706';
  return '#94A3B8';
}

function scoreBg(score: number) {
  if (score >= 78) return '#F0FDF4';
  if (score >= 58) return '#FFFBEB';
  return '#F8FAFC';
}

function normaliseVerdict(job: JobAnalysis): 'APPLY_NOW' | 'APPLY_WITH_EDITS' | 'SKIP' {
  // If Gemini scored high but labelled Skip (happens when profile was empty at analysis time),
  // correct the verdict to match the score thresholds.
  const s = job.matchScore;
  if (s >= 70) return 'APPLY_NOW';
  if (s >= 45) return 'APPLY_WITH_EDITS';
  return 'SKIP';
}

function mostCommonGap(jobs: JobAnalysis[]): string {
  const freq: Record<string, number> = {};
  jobs.forEach((j) => {
    [...j.gaps, ...j.missingKeywords].forEach((g) => {
      const k = g.toLowerCase();
      freq[k] = (freq[k] || 0) + 1;
    });
  });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? '';
}

function SkeletonCard() {
  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: 18,
      border: '1.5px solid #E2E8F0',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
    }}>
      <style>{`
        @keyframes shimmerPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
        .skel { background: #E8ECF3; border-radius: 6px; animation: shimmerPulse 1.6s ease-in-out infinite; }
      `}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="skel" style={{ width: 120, height: 14 }} />
          <div className="skel" style={{ width: 180, height: 11 }} />
        </div>
        <div className="skel" style={{ width: 52, height: 52, borderRadius: 14 }} />
      </div>
      <div className="skel" style={{ width: 90, height: 22, borderRadius: 8 }} />
      <div style={{ display: 'flex', gap: 6 }}>
        <div className="skel" style={{ width: 70, height: 20, borderRadius: 8 }} />
        <div className="skel" style={{ width: 90, height: 20, borderRadius: 8 }} />
        <div className="skel" style={{ width: 60, height: 20, borderRadius: 8 }} />
      </div>
    </div>
  );
}

export default function JobResultsPage({ batchId, expectedCount, onDone }: Props) {
  const [jobs, setJobs] = useState<JobAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const fetchJobs = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Fetch only this batch — exact match on batchId, no time-window ambiguity
      const { data } = await getJobAnalyses(batchId);
      const arr: JobAnalysis[] = Array.isArray(data) ? data : [];

      // De-duplicate: same company+title → keep highest score
      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const seen = new Map<string, JobAnalysis>();
      arr.forEach((j) => {
        const key = `${norm(j.company)}__${norm(j.jobTitle)}`;
        const existing = seen.get(key);
        if (!existing || j.matchScore > existing.matchScore) seen.set(key, j);
      });

      // Sort by matchScore descending
      const deduped = Array.from(seen.values()).sort((a, b) => b.matchScore - a.matchScore);

      setJobs(deduped);
      if (deduped.length >= expectedCount) setPolling(false);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [batchId, expectedCount]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Poll every 4s while waiting for all results
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(() => {
      setElapsed((e) => {
        if (e >= 90) { setPolling(false); return e; }
        return e + 4;
      });
      fetchJobs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [polling, fetchJobs]);

  function handleRefresh() {
    setRefreshing(true);
    fetchJobs(true);
  }

  const ready = jobs.length;
  const pending = Math.max(0, expectedCount - ready);
  const bestJob = jobs[0];
  const applyNowCount = jobs.filter((j) => normaliseVerdict(j) === 'APPLY_NOW').length;
  const topGap = mostCommonGap(jobs);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#F8FAFC',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      fontFamily: 'Poppins, system-ui, sans-serif',
      overflowY: 'auto',
      zIndex: 10,
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spinRefresh {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .results-enter { animation: fadeUp 0.45s ease both; }
        .card-enter { animation: fadeUp 0.4s ease both; }
      `}</style>

      {/* Top bar */}
      <div style={{
        width: '100%',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF',
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m11 17 2 2a1 1 0 1 0 3-3" /><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" /><path d="m21 3 1 11h-2" /><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" /><path d="M3 4h8" />
            </svg>
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>RetrofitAI</span>
        </div>

        {polling && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#16A34A',
              animation: 'shimmerPulse 1.2s ease-in-out infinite',
            }} />
            Analyzing {pending} remaining job{pending !== 1 ? 's' : ''}…
          </div>
        )}

        {!polling && ready > 0 && (
          <button
            onClick={handleRefresh}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'none', border: '1.5px solid #E2E8F0',
              borderRadius: 10, padding: '6px 12px',
              fontSize: 12, fontWeight: 600, color: '#64748B',
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#BBF7D0'; b.style.color = '#16A34A'; }}
            onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#E2E8F0'; b.style.color = '#64748B'; }}
          >
            <RefreshCw size={12} style={{ animation: refreshing ? 'spinRefresh 0.8s linear infinite' : 'none' }} />
            Refresh
          </button>
        )}
      </div>

      <div className="results-enter" style={{ width: '100%', maxWidth: 800, padding: '36px 24px 80px' }}>

        {/* Summary banner */}
        {ready > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            borderRadius: 18,
            padding: '24px 28px',
            marginBottom: 28,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Analysis Complete
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', margin: 0, letterSpacing: '-0.02em' }}>
                  {ready} job{ready !== 1 ? 's' : ''} processed · {applyNowCount} recommended
                </h1>
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.15)',
                borderRadius: 12,
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}>
                <TrendingUp size={14} color="#fff" />
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>
                  Best: {bestJob?.company} · {bestJob?.matchScore}%
                </span>
              </div>
            </div>

            {/* Stat pills */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {applyNowCount > 0 && (
                <div style={{
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 8,
                  padding: '5px 12px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <CheckCircle size={12} color="#fff" />
                  <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>
                    {applyNowCount} Apply Now
                  </span>
                </div>
              )}
              {topGap && (
                <div style={{
                  background: 'rgba(255,255,255,0.18)',
                  borderRadius: 8,
                  padding: '5px 12px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <AlertTriangle size={12} color="#fff" />
                  <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>
                    Common gap: {topGap}
                  </span>
                </div>
              )}
              {pending > 0 && (
                <div style={{
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: 8,
                  padding: '5px 12px',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>
                    {pending} still analyzing…
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading state — first fetch */}
        {loading && ready === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '60px 0' }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid #E8ECF3',
              borderTopColor: '#16A34A',
              borderRadius: '50%',
              animation: 'spinRefresh 0.9s linear infinite',
            }} />
            <p style={{ fontSize: 14, color: '#64748B', margin: 0 }}>Loading your job analyses…</p>
          </div>
        )}

        {/* Job cards grid */}
        {(ready > 0 || pending > 0) && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: 16,
            marginBottom: 36,
          }}>
            {/* Real result cards */}
            {jobs.map((job, i) => {
              const verdict = normaliseVerdict(job);
              const vc = VERDICT_CONFIG[verdict];
              const visibleGaps = [...(job.gaps ?? []), ...(job.missingKeywords ?? [])].slice(0, 3);
              const visibleStrengths = (job.strongMatches ?? []).slice(0, 2);

              return (
                <div key={job._id} className="card-enter" style={{
                  animationDelay: `${i * 60}ms`,
                  background: '#FFFFFF',
                  borderRadius: 18,
                  border: `1.5px solid ${i === 0 ? '#BBF7D0' : '#E2E8F0'}`,
                  padding: '22px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  position: 'relative',
                  boxShadow: i === 0 ? '0 4px 20px rgba(22,163,74,0.1)' : 'none',
                }}>
                  {/* Rank badge for best match */}
                  {i === 0 && (
                    <div style={{
                      position: 'absolute',
                      top: -1,
                      right: 18,
                      background: 'linear-gradient(135deg, #16A34A, #15803D)',
                      borderRadius: '0 0 8px 8px',
                      padding: '3px 10px',
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}>
                      Best Match
                    </div>
                  )}

                  {/* Header: company + score */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                      {/* Company initial avatar */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <div style={{
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                          background: `linear-gradient(135deg, ${scoreColor(job.matchScore)}22, ${scoreColor(job.matchScore)}44)`,
                          border: `1.5px solid ${scoreColor(job.matchScore)}44`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 13, fontWeight: 800, color: scoreColor(job.matchScore),
                        }}>
                          {(job.company || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>
                            {job.company || 'Unknown Company'}
                          </div>
                          <div style={{ fontSize: 11, color: '#64748B', marginTop: 1, lineHeight: 1.3 }}>
                            {job.jobTitle || 'Position'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Score circle */}
                    <div style={{
                      width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                      background: scoreBg(job.matchScore),
                      border: `2px solid ${scoreColor(job.matchScore)}44`,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: scoreColor(job.matchScore), lineHeight: 1 }}>
                        {job.matchScore}
                      </span>
                      <span style={{ fontSize: 9, color: scoreColor(job.matchScore), fontWeight: 600, opacity: 0.8 }}>
                        /100
                      </span>
                    </div>
                  </div>

                  {/* Verdict badge */}
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: vc.bg,
                    border: `1px solid ${vc.border}`,
                    borderRadius: 8,
                    padding: '4px 10px',
                    alignSelf: 'flex-start',
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: vc.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: vc.color }}>
                      {vc.label}
                    </span>
                  </div>

                  {/* Strengths */}
                  {visibleStrengths.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Strong matches
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {visibleStrengths.map((s, si) => (
                          <span key={si} style={{
                            fontSize: 11, color: '#15803D', fontWeight: 500,
                            background: '#F0FDF4', border: '1px solid #BBF7D0',
                            borderRadius: 6, padding: '2px 8px',
                          }}>{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Gaps */}
                  {visibleGaps.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Gaps to address
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {visibleGaps.map((g, gi) => (
                          <span key={gi} style={{
                            fontSize: 11, color: '#64748B', fontWeight: 500,
                            background: '#F8FAFC', border: '1px solid #E2E8F0',
                            borderRadius: 6, padding: '2px 8px',
                          }}>{g}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Skeleton placeholder cards for pending jobs */}
            {Array.from({ length: pending }).map((_, i) => (
              <SkeletonCard key={`skel-${i}`} />
            ))}
          </div>
        )}

        {/* Empty — still waiting */}
        {!loading && ready === 0 && pending === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 12, padding: '60px 0', textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, color: '#64748B' }}>
              No analyses found yet. The agent may still be processing.
            </div>
            <button
              onClick={handleRefresh}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: '#F0FDF4', border: '1.5px solid #BBF7D0',
                borderRadius: 12, padding: '10px 20px',
                fontSize: 13, fontWeight: 600, color: '#16A34A',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={13} /> Check again
            </button>
          </div>
        )}

        {/* Go to dashboard CTA */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onDone}
            style={{
              width: '100%',
              maxWidth: 440,
              padding: '15px 0',
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 18,
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 24px rgba(22,163,74,0.28)',
              transition: 'transform 150ms, box-shadow 150ms',
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.transform = 'translateY(-1px)';
              b.style.boxShadow = '0 8px 32px rgba(22,163,74,0.38)';
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.transform = 'translateY(0)';
              b.style.boxShadow = '0 4px 24px rgba(22,163,74,0.28)';
            }}
          >
            Open My Dashboard
            <ChevronRight size={18} />
          </button>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
            Full breakdown, pipeline tracking, and weekly briefings inside
          </p>
        </div>
      </div>
    </div>
  );
}
