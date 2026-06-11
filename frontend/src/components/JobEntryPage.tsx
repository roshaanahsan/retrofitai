import { useState } from 'react';
import { Plus, X, FileText, ChevronRight } from 'lucide-react';

function WrappedTextarea({
  borderRadius = 12,
  bg = '#F8FAFC',
  bgFocus = '#FFFFFF',
  focusColor = '#16A34A',
  wrapperStyle,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  borderRadius?: number;
  bg?: string;
  bgFocus?: string;
  focusColor?: string;
  wrapperStyle?: React.CSSProperties;
}) {
  const [focused, setFocused] = useState(false);
  const { style: innerStyle, onFocus, onBlur, ...rest } = props;
  return (
    <div style={{
      borderRadius,
      border: `1.5px solid ${focused ? focusColor : '#E2E8F0'}`,
      overflow: 'hidden',
      transition: 'border-color 150ms, background 150ms',
      background: focused ? bgFocus : bg,
      ...wrapperStyle,
    }}>
      <textarea
        {...rest}
        style={{
          ...(innerStyle || {}),
          width: '100%',
          border: 'none',
          borderRadius: 0,
          outline: 'none',
          resize: 'none',
          display: 'block',
          background: 'transparent',
          boxSizing: 'border-box',
        }}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      />
    </div>
  );
}

interface Props {
  onStart: (jobs: string[]) => void;
}

const DEMO_JOBS = [
  `Staff Software Engineer – Infrastructure Platform
Stripe · Remote (US)

We're looking for a Staff Engineer to join our Infrastructure Platform team. You'll design and build the systems that power Stripe's global payment processing at scale.

Responsibilities:
- Lead architecture and implementation of distributed systems handling millions of TPS
- Drive technical direction for infrastructure tooling used by 4,000+ engineers
- Collaborate cross-functionally with product, security, and reliability teams
- Mentor senior engineers and elevate the team's technical bar

Requirements:
- 8+ years of backend engineering, 3+ years at staff level or above
- Deep expertise in distributed systems, consensus protocols, or large-scale storage
- Proficiency in Go, Rust, or Java; experience with Kubernetes, gRPC
- Track record of owning and shipping complex, cross-org technical projects
- Experience with reliability engineering (SLOs, SLIs, error budgets)`,

  `Senior Software Engineer – Payments Core
Shopify · Toronto / Remote

Join the team responsible for Shopify's payment infrastructure, processing over $200B in GMV annually.

What you'll do:
- Build and scale the transaction processing engine powering Shopify Payments
- Design fault-tolerant, highly available microservices in Ruby and Go
- Partner with product teams on financial compliance and security requirements
- Lead incident response and post-mortem culture improvements

What you'll need:
- 5+ years of backend engineering experience
- Experience with payment systems, financial APIs, or similar regulated domains
- Strong understanding of database design, event-driven architecture
- Excellent written communication and async collaboration skills
- Prior experience in a high-growth or high-traffic environment`,

  `Senior Software Engineer II – Core Infrastructure
Google · Sunnyvale, CA / Remote

Google's Core Infrastructure team is hiring senior engineers to work on the systems that run Google's global network of data centers. You'll work on some of the most complex distributed systems problems at any company, anywhere.

Responsibilities:
- Design and implement foundational infrastructure software used across Google products
- Optimize large-scale distributed storage and compute systems for reliability and performance
- Contribute to open-source projects and internal developer tooling platforms
- Conduct design reviews and technical interviews; help grow the next generation of engineers

Minimum qualifications:
- Bachelor's degree in CS or equivalent practical experience
- 5+ years of software development experience in C++, Go, or Java
- Experience with large-scale distributed systems or networking infrastructure

Preferred qualifications:
- Master's or PhD in Computer Science or a related field
- Experience with Borg, Kubernetes, or similar cluster management systems
- Contributions to open-source infrastructure projects
- Strong background in storage systems, file systems, or databases`,

  `Staff Engineer – Backend Platform
Notion · San Francisco, CA / Remote

Notion's Backend Platform team is hiring a Staff Engineer to lead the distributed systems that power our product for 30M+ users. You'll own critical backend infrastructure and drive the technical direction for scalability and reliability across the stack.

Responsibilities:
- Lead architecture and delivery of backend services handling large-scale data and real-time sync
- Drive technical roadmap decisions across storage, compute, and internal APIs
- Partner with product and infrastructure teams to improve system reliability at scale
- Mentor senior engineers and elevate the team's engineering bar

What we're looking for:
- 6–9 years of backend engineering experience, with demonstrated growth toward staff-level impact
- Strong background building distributed systems and scalable backend services
- Experience with high-throughput APIs, databases, and cloud infrastructure (GCP or AWS)
- CS fundamentals — systems design, algorithms, data structures
- Track record of taking ownership of complex cross-team technical projects
- Clear written communicator — Notion is an async-first team`,

  `Senior Backend Engineer – Core Infrastructure
Linear · Remote (Global)

Linear is building the best software project management tool in the world and we need engineers who know how to build backend systems at scale. We're a small, fast team and this role has high ownership and direct product impact.

What you'll work on:
- Build and scale the backend handling millions of real-time events across our global user base
- Design distributed systems, data sync pipelines, and developer-facing APIs
- Take full ownership of features from technical design to production
- Work directly with the product team to shape the backend architecture

We're looking for:
- 5–8 years of backend software engineering experience
- Experience building systems at scale — high-throughput, distributed, real-time
- Strong CS fundamentals: data structures, algorithms, system design
- Proficiency in Go, TypeScript/Node.js, or similar backend stack
- BS/MS in Computer Science or equivalent
- Self-directed and comfortable working in a remote-first async environment`,

  `Staff Software Engineer – Network Infrastructure
Cloudflare · Austin, TX / Remote

Cloudflare's global network spans 300+ cities and handles over 55 million HTTP requests per second. Our Network Infrastructure team keeps this machine running and makes it faster. We're hiring a Staff Engineer to lead major technical initiatives across our edge networking stack.

Responsibilities:
- Lead design and implementation of next-generation routing and traffic management systems
- Drive technical decisions around our BGP infrastructure, anycast network, and DDoS mitigation
- Partner with hardware and network engineering teams on co-design of software/hardware solutions
- Mentor engineers across the team; set technical direction for multi-quarter roadmap items

Must have:
- 8+ years of software engineering, with 3+ years focused on network systems
- Deep knowledge of networking protocols: BGP, TCP/IP, DNS, HTTP/2, QUIC
- Proficiency in C, Go, or Rust; experience with eBPF or kernel networking is a strong plus
- Experience running software at global internet scale
- Excellent written communication skills — Cloudflare is async-first`,
];

export default function JobEntryPage({ onStart }: Props) {
  const [jobs, setJobs] = useState<string[]>(['']);
  const [demoFilled, setDemoFilled] = useState(false);

  function updateJob(i: number, val: string) {
    setJobs((prev) => prev.map((j, idx) => (idx === i ? val : j)));
  }

  function addJob() {
    if (jobs.length < 6) setJobs((prev) => [...prev, '']);
  }

  function removeJob(i: number) {
    if (jobs.length === 1) { setJobs(['']); return; }
    setJobs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleDemoData() {
    setJobs([...DEMO_JOBS]);
    setDemoFilled(true);
  }

  function handleStart() {
    const filled = jobs.filter((j) => j.trim().length > 40);
    if (filled.length === 0) return;
    onStart(filled);
  }

  const filledCount = jobs.filter((j) => j.trim().length > 40).length;
  const canStart = filledCount > 0;

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
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes borderSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes glowPulse {
          0%, 100% { opacity: 0.7; }
          50% { opacity: 1; }
        }
        .job-page-card { animation: fadeUp 0.4s ease both; }
        .job-card { animation: fadeUp 0.3s ease both; }
        .start-btn-wrap {
          position: relative;
          display: inline-flex;
          border-radius: 22px;
          padding: 3px;
          overflow: hidden;
        }
        .start-btn-spin {
          position: absolute;
          inset: -100%;
          background: conic-gradient(
            from 0deg,
            #16A34A 0deg,
            #86EFAC 90deg,
            #BBF7D0 150deg,
            #FFFFFF 180deg,
            #BBF7D0 210deg,
            #86EFAC 270deg,
            #16A34A 360deg
          );
          animation: borderSpin 2.4s linear infinite;
        }
        .start-btn-inner {
          position: relative;
          z-index: 1;
          padding: 16px 48px;
          background: linear-gradient(135deg, #16A34A 0%, #15803D 100%);
          color: #fff;
          border: none;
          border-radius: 19px;
          font-size: 16px;
          font-weight: 700;
          font-family: Poppins, system-ui, sans-serif;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: -0.01em;
          transition: transform 150ms;
          white-space: nowrap;
        }
        .start-btn-inner:hover { transform: scale(1.02); }
        .start-btn-inner:disabled {
          background: #C8D0DE;
          cursor: default;
          transform: none;
        }
        .start-btn-disabled .start-btn-spin { display: none; }
        .start-btn-disabled { padding: 0; background: transparent; border-radius: 22px; overflow: visible; }
        .start-btn-disabled .start-btn-inner { border-radius: 22px; }
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

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#F0FDF4', border: '1.5px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#16A34A' }}>✓</div>
          <div style={{ width: 24, height: 2, background: '#16A34A', borderRadius: 2 }} />
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'linear-gradient(135deg, #16A34A, #15803D)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>2</div>
          <div style={{ width: 24, height: 2, background: '#E2E8F0', borderRadius: 2 }} />
          <div style={{ width: 24, height: 24, borderRadius: 6, background: '#E8ECF3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>3</div>
        </div>
      </div>

      {/* Content */}
      <div className="job-page-card" style={{ width: '100%', maxWidth: 680, padding: '40px 24px 120px', display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.2 }}>
              Add jobs you're interested in
            </h1>
            <p style={{ marginTop: 8, fontSize: 14, color: '#64748B', lineHeight: 1.6 }}>
              Paste the full job description for each role. The agent compares them against your profile and ranks which to target first.
            </p>
          </div>
          {!demoFilled && (
            <button
              onClick={handleDemoData}
              style={{
                flexShrink: 0,
                marginLeft: 16,
                marginTop: 4,
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 8,
                padding: '5px 12px',
                fontSize: 11,
                fontWeight: 600,
                color: '#16A34A',
                cursor: 'pointer',
                fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                transition: 'background 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#DCFCE7'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'; }}
            >
              + Add demo data
            </button>
          )}
        </div>

        {/* Filled count badge */}
        {filledCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, marginTop: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A' }} />
            <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>
              {filledCount} job{filledCount > 1 ? 's' : ''} ready for analysis
            </span>
          </div>
        )}
        {filledCount === 0 && <div style={{ marginBottom: 20 }} />}

        {/* Job cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {jobs.map((job, i) => (
            <div key={i} className="job-card" style={{
              background: '#FFFFFF',
              borderRadius: 18,
              border: `1.5px solid ${job.trim().length > 40 ? '#BBF7D0' : '#E2E8F0'}`,
              padding: '18px 20px',
              transition: 'border-color 200ms',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: 8,
                    background: job.trim().length > 40
                      ? 'linear-gradient(135deg, #16A34A, #15803D)'
                      : 'linear-gradient(to right, #FFFFFF, #E8ECF3)',
                    border: job.trim().length > 40 ? 'none' : '1.5px solid #C8D0DE',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 200ms',
                  }}>
                    <FileText size={13} color={job.trim().length > 40 ? '#fff' : '#94A3B8'} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Job {i + 1}</span>
                  {job.trim().length > 40 && (
                    <span style={{ fontSize: 11, color: '#16A34A', fontWeight: 500 }}>· Ready</span>
                  )}
                </div>
                {jobs.length > 1 && (
                  <button
                    onClick={() => removeJob(i)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#94A3B8', display: 'flex', alignItems: 'center', padding: 4,
                      borderRadius: 6, transition: 'color 150ms, background 150ms',
                    }}
                    onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#64748B'; b.style.background = '#F8FAFC'; }}
                    onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.color = '#94A3B8'; b.style.background = 'none'; }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <WrappedTextarea
                value={job}
                onChange={(e) => updateJob(i, e.target.value)}
                placeholder={`Paste the full job description here — title, company, responsibilities, requirements...\n\nThe more detail you include, the more accurate the match score.`}
                style={{
                  minHeight: 140,
                  padding: '12px 14px',
                  fontSize: 13,
                  fontFamily: 'Poppins, system-ui, sans-serif',
                  color: '#0F172A',
                  lineHeight: 1.6,
                }}
              />
            </div>
          ))}
        </div>

        {/* Add another */}
        {jobs.length < 6 && (
          <button
            onClick={addJob}
            style={{
              marginTop: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'none',
              border: '1.5px dashed #C8D0DE',
              borderRadius: 18,
              padding: '12px 20px',
              fontSize: 13,
              fontWeight: 600,
              color: '#64748B',
              cursor: 'pointer',
              fontFamily: 'inherit',
              width: '100%',
              justifyContent: 'center',
              transition: 'border-color 150ms, color 150ms, background 150ms',
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = '#16A34A';
              b.style.color = '#16A34A';
              b.style.background = '#F0FDF4';
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = '#C8D0DE';
              b.style.color = '#64748B';
              b.style.background = 'none';
            }}
          >
            <Plus size={15} />
            Add another job ({jobs.length}/6)
          </button>
        )}

        {/* Start button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 48, gap: 12 }}>
          <div className={canStart ? 'start-btn-wrap' : 'start-btn-disabled'}>
            {canStart && <div className="start-btn-spin" />}
            <button
              className="start-btn-inner"
              onClick={handleStart}
              disabled={!canStart}
            >
              Start the Agent
              <ChevronRight size={18} />
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
            {canStart
              ? `Agent will analyze ${filledCount} job${filledCount > 1 ? 's' : ''} against your profile`
              : 'Paste at least one job description to continue'}
          </p>
        </div>
      </div>
    </div>
  );
}
