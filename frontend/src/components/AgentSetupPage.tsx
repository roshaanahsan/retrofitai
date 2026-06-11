import { useEffect, useRef, useState } from 'react';
import { Upload, CheckCircle, ChevronRight, Sparkles, Loader2 } from 'lucide-react';
import { extractResumeFile } from '@/lib/api';

function WrappedTextarea({
  borderRadius = 18,
  bg = '#FFFFFF',
  focusColor = '#16A34A',
  wrapperStyle,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  borderRadius?: number;
  bg?: string;
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
      transition: 'border-color 150ms',
      background: bg,
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
  onNext: (bio: string, resumeFile: File | null) => void;
  onBuildResume: () => void;
  prefillFile?: File | null;
  prefillResumeText?: string;
}

export default function AgentSetupPage({ onNext, onBuildResume, prefillFile = null, prefillResumeText = '' }: Props) {
  const [bio, setBio] = useState('');
  const [file, setFile] = useState<File | null>(prefillFile);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');
  const [extractedText, setExtractedText] = useState(prefillResumeText);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const skipFirstExtract = useRef(!!prefillResumeText);

  useEffect(() => {
    if (!file) {
      setExtractedText('');
      setExtracting(false);
      return;
    }
    if (skipFirstExtract.current) {
      skipFirstExtract.current = false;
      return;
    }
    let cancelled = false;
    setExtracting(true);
    setExtractedText('');
    extractResumeFile(file)
      .then((r) => { if (!cancelled) setExtractedText(r.data.text || ''); })
      .catch(() => { if (!cancelled) setExtractedText(''); })
      .finally(() => { if (!cancelled) setExtracting(false); });
    return () => { cancelled = true; };
  }, [file]);

  function handleFile(f: File) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      setError('Please upload a PDF or Word document.');
      return;
    }
    setError('');
    setFile(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleNext() {
    const finalText = bio.trim() || extractedText;
    if (!finalText && !file) {
      setError('Please tell us about yourself or upload a resume to continue.');
      return;
    }
    if (file && extracting) {
      setError('Please wait — still reading your resume.');
      return;
    }
    onNext(finalText, file);
  }

  const canProceed = bio.trim().length > 0 || (file !== null && !extracting);

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
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .setup-card { animation: fadeUp 0.45s ease both; }
        .upload-zone { transition: background 150ms, border-color 150ms; }
        .upload-zone:hover { background: #F0FDF4 !important; border-color: #16A34A !important; }
      `}</style>

      {/* Top bar */}
      <div style={{
        width: '100%',
        padding: '20px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF',
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m11 17 2 2a1 1 0 1 0 3-3" />
            <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
            <path d="m21 3 1 11h-2" />
            <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
            <path d="M3 4h8" />
          </svg>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', letterSpacing: '-0.02em' }}>RetrofitAI</span>
      </div>

      {/* Main content */}
      <div className="setup-card" style={{
        width: '100%',
        maxWidth: 600,
        padding: '48px 24px 64px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff',
          }}>1</div>
          <div style={{ flex: 1, height: 2, background: '#E2E8F0', borderRadius: 2 }} />
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: '#E8ECF3',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, fontWeight: 600, color: '#94A3B8',
          }}>2</div>
        </div>

        {/* Heading */}
        <h1 style={{
          fontSize: 30,
          fontWeight: 700,
          color: '#0F172A',
          letterSpacing: '-0.03em',
          margin: 0,
          lineHeight: 1.2,
        }}>
          Let's get to know you
        </h1>
        <p style={{
          marginTop: 10,
          fontSize: 14,
          color: '#64748B',
          lineHeight: 1.6,
          maxWidth: 480,
        }}>
          Describe your background in plain words — the agent will personalize every recommendation to your specific situation.
        </p>

        {/* Bio textarea */}
        <div style={{ marginTop: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
              About you
            </label>
            <button
              onClick={() => {
                setBio("Hi, I'm Alex Chen. I'm a Senior Software Engineer with 7 years of experience building distributed backend systems at scale. I have a BS in Computer Science from UC Berkeley. My core skills include Go, Python, distributed systems design, Kubernetes, PostgreSQL, Redis, gRPC, and cloud infrastructure on GCP and AWS. Most recently I've been building high-throughput data pipelines and real-time APIs serving millions of users. I'm targeting Staff Engineer and Senior Backend Engineer roles at product-led companies — fintech, dev tools, and infrastructure. I've been applying for 3 months, sent about 18 applications, and gotten almost no response. I've had 2 phone screens but no further rounds. I think my resume isn't landing but I'm not sure what's wrong.");
                setError('');
              }}
              style={{
                background: '#F0FDF4',
                border: '1px solid #BBF7D0',
                borderRadius: 8,
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: 600,
                color: '#16A34A',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 150ms, border-color 150ms',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = '#DCFCE7';
                b.style.borderColor = '#86EFAC';
              }}
              onMouseLeave={(e) => {
                const b = e.currentTarget as HTMLButtonElement;
                b.style.background = '#F0FDF4';
                b.style.borderColor = '#BBF7D0';
              }}
            >
              + Add demo data
            </button>
          </div>
          <WrappedTextarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setError(''); }}
            placeholder={`e.g. Hi, I'm Roshaan. I'm a product manager with 4 years of experience in SaaS. I studied Computer Science at University of Toronto. I'm currently targeting senior PM roles at fintech companies and have been applying for 3 months with limited success...`}
            style={{
              minHeight: 140,
              padding: '14px 16px',
              fontSize: 14,
              fontFamily: 'Poppins, system-ui, sans-serif',
              color: '#0F172A',
              lineHeight: 1.6,
            }}
          />
        </div>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '28px 0',
        }}>
          <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500, whiteSpace: 'nowrap' }}>
            or upload your resume
          </span>
          <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
        </div>

        {/* Upload zone */}
        {file ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '16px 20px',
            borderRadius: 18,
            background: extracting ? '#FFFBEB' : extractedText ? '#F0FDF4' : '#F0FDF4',
            border: `1.5px solid ${extracting ? '#FDE68A' : extractedText ? '#BBF7D0' : '#BBF7D0'}`,
          }}>
            {extracting ? (
              <Loader2 size={20} color="#D97706" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            ) : (
              <CheckCircle size={20} color="#16A34A" style={{ flexShrink: 0 }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: extracting ? '#92400E' : '#15803D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.name}
              </div>
              <div style={{ fontSize: 11, color: extracting ? '#B45309' : '#16A34A', marginTop: 2 }}>
                {extracting
                  ? 'Reading resume text...'
                  : extractedText
                  ? `${(file.size / 1024).toFixed(0)} KB · Text extracted`
                  : `${(file.size / 1024).toFixed(0)} KB · Ready to use`}
              </div>
            </div>
            <button
              onClick={() => { setFile(null); setExtractedText(''); }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#64748B', fontFamily: 'inherit', padding: '4px 8px',
                borderRadius: 8, transition: 'color 150ms',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#0F172A'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#64748B'; }}
            >
              Remove
            </button>
          </div>
        ) : (
          <div
            className="upload-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              padding: '32px 20px',
              borderRadius: 18,
              border: `2px dashed ${dragging ? '#16A34A' : '#C8D0DE'}`,
              background: dragging ? '#F0FDF4' : '#F8FAFC',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(to right, #FFFFFF 0%, #C8D0DE 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Upload size={20} color="#64748B" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>
              Drop your resume here
            </div>
            <div style={{ fontSize: 12, color: '#94A3B8' }}>
              or click to browse · PDF, DOCX accepted
            </div>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {/* No resume button */}
        <button
          onClick={onBuildResume}
          style={{
            marginTop: 16,
            background: 'none',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: '#16A34A',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
            padding: '6px 0',
            transition: 'color 150ms',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#15803D'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#16A34A'; }}
        >
          <Sparkles size={14} />
          No resume? Build one with AI
        </button>

        {/* Error */}
        {error && (
          <div style={{
            marginTop: 16,
            padding: '10px 14px',
            borderRadius: 12,
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            fontSize: 13,
            color: '#DC2626',
          }}>
            {error}
          </div>
        )}

        {/* Next button */}
        <button
          onClick={handleNext}
          style={{
            marginTop: 36,
            padding: '15px 0',
            width: '100%',
            background: canProceed
              ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
              : '#E8ECF3',
            color: canProceed ? '#FFFFFF' : '#94A3B8',
            border: 'none',
            borderRadius: 18,
            fontSize: 15,
            fontWeight: 600,
            cursor: canProceed ? 'pointer' : 'default',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'opacity 150ms, transform 150ms, box-shadow 150ms',
            boxShadow: canProceed ? '0 4px 24px rgba(22,163,74,0.28)' : 'none',
          }}
          onMouseEnter={(e) => {
            if (!canProceed) return;
            const b = e.currentTarget as HTMLButtonElement;
            b.style.transform = 'translateY(-1px)';
            b.style.boxShadow = '0 8px 32px rgba(22,163,74,0.38)';
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.transform = 'translateY(0)';
            b.style.boxShadow = canProceed ? '0 4px 24px rgba(22,163,74,0.28)' : 'none';
          }}
        >
          Continue
          <ChevronRight size={16} />
        </button>

        <p style={{ marginTop: 16, fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
          RetrofitAI provides career guidance, not licensed career counseling.
        </p>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
