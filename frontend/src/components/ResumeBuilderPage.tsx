import { useState } from 'react';
import { ArrowLeft, FileText, Loader2, CheckCircle } from 'lucide-react';
import { generateResumePdf } from '@/lib/api';

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

interface FormData {
  name: string;
  role: string;
  experience: string;
  education: string;
  skills: string;
  workHistory: string;
  certifications: string;
  summary: string;
}

interface Props {
  onBack: (file: File | null, resumeText?: string) => void;
}

const DEMO_DATA: FormData = {
  name: 'Alex Chen',
  role: 'Senior Backend Engineer',
  experience: '7 years in distributed systems and backend engineering',
  education: 'B.S. Computer Science, UC Berkeley (2017)',
  skills: 'Go, Python, TypeScript, Kubernetes, PostgreSQL, Redis, gRPC, AWS, GCP, Kafka, Docker, Distributed Systems, System Design',
  workHistory: `Stripe · Senior Software Engineer · 2021–Present
Led migration of payment processing pipeline to event-driven architecture, reducing P99 latency by 40%. Built real-time fraud detection system handling 10M+ events/day. Mentored 4 engineers and drove cross-team API standardization initiative.

Lyft · Software Engineer II · 2019–2021
Designed and implemented ride-matching microservice serving 500K+ daily rides. Reduced P99 latency from 800ms to 120ms through caching and query optimization. Contributed to on-call infrastructure improvements that cut incident resolution time by 35%.

Palantir · Software Engineer · 2017–2019
Built data ingestion pipelines for government clients, processing 50TB+ daily. Developed internal developer tooling adopted by 200+ engineers. Received "High Impact" performance rating two consecutive years.`,
  certifications: 'AWS Solutions Architect – Associate · Google Cloud Professional Data Engineer',
  summary: 'Backend-focused engineering leader with 7 years building high-throughput distributed systems at top-tier tech companies. Proven track record of reducing latency, scaling infrastructure, and delivering systems that serve millions of users. Now targeting Staff or Senior Backend roles at product-led companies in fintech, dev tools, or infrastructure.',
};

const FIELD_STYLE: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 18,
  border: '1.5px solid #E2E8F0',
  background: '#FFFFFF',
  fontSize: 14,
  fontFamily: 'Poppins, system-ui, sans-serif',
  color: '#0F172A',
  outline: 'none',
  transition: 'border-color 150ms',
  boxSizing: 'border-box',
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
        {label}
        {required && <span style={{ color: '#16A34A', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

export default function ResumeBuilderPage({ onBack }: Props) {
  const [form, setForm] = useState<FormData>({
    name: '', role: '', experience: '', education: '',
    skills: '', workHistory: '', certifications: '', summary: '',
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  function set(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
      setError('');
    };
  }

  function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = '#16A34A';
  }
  function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    e.currentTarget.style.borderColor = '#E2E8F0';
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      setError('Full name is required to generate your resume.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await generateResumePdf({
        name: form.name,
        role: form.role,
        experience: form.experience,
        education: form.education,
        skills: form.skills,
        workHistory: form.workHistory,
        certifications: form.certifications,
        summary: form.summary,
      });

      const blob = new Blob([res.data], { type: 'application/pdf' });
      const fileName = `${form.name.replace(/\s+/g, '_')}_resume.pdf`;
      const file = new File([blob], fileName, { type: 'application/pdf' });

      const parts: string[] = [];
      if (form.name) parts.push(`Name: ${form.name}`);
      if (form.role) parts.push(`Target Role: ${form.role}`);
      if (form.experience) parts.push(`Experience: ${form.experience}`);
      if (form.education) parts.push(`Education: ${form.education}`);
      if (form.skills) parts.push(`Skills: ${form.skills}`);
      if (form.certifications) parts.push(`Certifications: ${form.certifications}`);
      if (form.summary) parts.push(`\nProfessional Summary:\n${form.summary}`);
      if (form.workHistory) parts.push(`\nWork History:\n${form.workHistory}`);
      const resumeText = parts.join('\n');

      setDone(true);
      setTimeout(() => onBack(file, resumeText), 1200);
    } catch (err) {
      console.error('Resume generation failed:', err);
      setError('Failed to generate resume. Please try again.');
    } finally {
      setLoading(false);
    }
  }

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
      zIndex: 20,
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .builder-card { animation: fadeUp 0.4s ease both; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Top bar */}
      <div style={{
        width: '100%',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid #E2E8F0',
        background: '#FFFFFF',
        flexShrink: 0,
      }}>
        <button
          onClick={() => onBack(null)}
          style={{
            width: 34, height: 34, borderRadius: 10,
            background: '#F8FAFC', border: '1.5px solid #E2E8F0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'background 150ms, border-color 150ms',
          }}
          onMouseEnter={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = '#F0FDF4';
            b.style.borderColor = '#BBF7D0';
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.background = '#F8FAFC';
            b.style.borderColor = '#E2E8F0';
          }}
        >
          <ArrowLeft size={16} color="#64748B" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <FileText size={17} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', lineHeight: 1.2 }}>Build Your Resume</div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>AI-powered · PDF generated instantly</div>
          </div>
        </div>

        {/* Demo data button */}
        <button
          onClick={() => { setForm(DEMO_DATA); setError(''); }}
          style={{
            background: '#F0FDF4',
            border: '1px solid #BBF7D0',
            borderRadius: 10,
            padding: '6px 14px',
            fontSize: 12,
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

      {/* Form */}
      <div className="builder-card" style={{
        width: '100%',
        maxWidth: 640,
        padding: '40px 24px 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}>
        <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, margin: '0 0 32px' }}>
          Fill in your details below and we'll generate a professional, clean resume PDF for you — instantly.
        </p>

        {/* Card container */}
        <div style={{
          background: '#FFFFFF',
          borderRadius: 18,
          border: '1.5px solid #E2E8F0',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* Row 1: name + role */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Full Name" required>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="e.g. Roshaan Ahsan"
                style={FIELD_STYLE}
                onFocus={focusStyle}
                onBlur={blurStyle}
              />
            </Field>
            <Field label="Target Role">
              <input
                type="text"
                value={form.role}
                onChange={set('role')}
                placeholder="e.g. Senior Product Manager"
                style={FIELD_STYLE}
                onFocus={focusStyle}
                onBlur={blurStyle}
              />
            </Field>
          </div>

          {/* Row 2: experience + education */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Years of Experience">
              <input
                type="text"
                value={form.experience}
                onChange={set('experience')}
                placeholder="e.g. 4 years in SaaS / fintech"
                style={FIELD_STYLE}
                onFocus={focusStyle}
                onBlur={blurStyle}
              />
            </Field>
            <Field label="Education">
              <input
                type="text"
                value={form.education}
                onChange={set('education')}
                placeholder="e.g. BSc CS, University of Toronto"
                style={FIELD_STYLE}
                onFocus={focusStyle}
                onBlur={blurStyle}
              />
            </Field>
          </div>

          {/* Skills */}
          <Field label="Key Skills">
            <input
              type="text"
              value={form.skills}
              onChange={set('skills')}
              placeholder="e.g. Product strategy, Agile, SQL, Figma, Roadmapping, Stakeholder management"
              style={FIELD_STYLE}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </Field>

          {/* Divider */}
          <div style={{ height: 1, background: '#E8ECF3', margin: '4px 0' }} />

          {/* Work History */}
          <Field label="Work History">
            <WrappedTextarea
              value={form.workHistory}
              onChange={set('workHistory')}
              placeholder={`Company · Role · Period\nWhat you accomplished and delivered there.\n\nCompany · Role · Period\nWhat you accomplished and delivered there.`}
              style={{ minHeight: 130, padding: '12px 14px', fontSize: 14, fontFamily: 'Poppins, system-ui, sans-serif', color: '#0F172A', lineHeight: 1.6 }}
            />
          </Field>

          {/* Professional Summary */}
          <Field label="Professional Summary">
            <WrappedTextarea
              value={form.summary}
              onChange={set('summary')}
              placeholder="A 2–3 sentence overview of who you are and what you bring. Leave blank to keep it minimal."
              style={{ minHeight: 90, padding: '12px 14px', fontSize: 14, fontFamily: 'Poppins, system-ui, sans-serif', color: '#0F172A', lineHeight: 1.6 }}
            />
          </Field>

          {/* Certifications — optional */}
          <Field label="Certifications (optional)">
            <input
              type="text"
              value={form.certifications}
              onChange={set('certifications')}
              placeholder="e.g. PMP, AWS Solutions Architect, Google Analytics"
              style={FIELD_STYLE}
              onFocus={focusStyle}
              onBlur={blurStyle}
            />
          </Field>
        </div>

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

        {/* CTA */}
        <button
          onClick={handleCreate}
          disabled={loading || done}
          style={{
            marginTop: 28,
            padding: '15px 0',
            width: '100%',
            background: done
              ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
              : loading
              ? '#E8ECF3'
              : 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            color: loading ? '#94A3B8' : '#FFFFFF',
            border: 'none',
            borderRadius: 18,
            fontSize: 15,
            fontWeight: 600,
            cursor: loading || done ? 'default' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            boxShadow: (!loading && !done) ? '0 4px 24px rgba(22,163,74,0.28)' : 'none',
            transition: 'transform 150ms, box-shadow 150ms',
          }}
          onMouseEnter={(e) => {
            if (loading || done) return;
            const b = e.currentTarget as HTMLButtonElement;
            b.style.transform = 'translateY(-1px)';
            b.style.boxShadow = '0 8px 32px rgba(22,163,74,0.38)';
          }}
          onMouseLeave={(e) => {
            const b = e.currentTarget as HTMLButtonElement;
            b.style.transform = 'translateY(0)';
            b.style.boxShadow = (!loading && !done) ? '0 4px 24px rgba(22,163,74,0.28)' : 'none';
          }}
        >
          {done ? (
            <><CheckCircle size={16} /> Resume created — attaching...</>
          ) : loading ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Generating your resume...</>
          ) : (
            <><FileText size={16} /> Create Resume</>
          )}
        </button>

        <p style={{ marginTop: 14, fontSize: 11, color: '#94A3B8', textAlign: 'center', lineHeight: 1.5 }}>
          Your resume PDF will be generated and attached to your profile setup automatically.
        </p>
      </div>
    </div>
  );
}
