import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Paperclip, Loader2 } from 'lucide-react';
import { sendChatMessage, updateProfile, inferProfileFromResume, extractResumeFile, reanalyzeAllJobs } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ConversationEntry, CareerProfile, View, AgentActionType, AgentEvent, AgentDraft, AgentPipelineSummary } from '@/types';

interface AgentChatProps {
  messages: ConversationEntry[];
  addMessage: (
    role: 'user' | 'agent',
    text: string,
    actionType?: AgentActionType | null,
    actionData?: Record<string, unknown> | null,
  ) => void;
  clearMessages: () => void;
  profile: Partial<CareerProfile> | null;
  setProfile: (p: Partial<CareerProfile>) => void;
  uiHints: { showPatternAlert: boolean; highlightStaleApplications: string[]; staleCount: number };
  setUiHints: (h: AgentChatProps['uiHints']) => void;
  activeView: View;
  isOpen: boolean;
  onNavigate: (view: View) => void;
  agentStatus?: 'idle' | 'working' | 'done';
  agentEvents?: AgentEvent[];
  agentDrafts?: AgentDraft[];
  setAgentDrafts?: (drafts: AgentDraft[]) => void;
  pipelineSummary?: AgentPipelineSummary | null;
  profileEditActive?: boolean;
  setProfileEditActive?: (v: boolean) => void;
}

const BUBBLE_GRADIENT = 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)';
const BUBBLE_SHADOW   = '0 4px 16px rgba(0,0,0,0.07)';
const USER_GRADIENT   = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)';

const CHAT_STYLES = `
  @keyframes bubbleSpinBorder { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes agentPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
  @keyframes chatSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes liveIntentIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  .live-intent-bubble { animation: liveIntentIn 180ms ease forwards; }
  .agent-chat-textarea::-webkit-scrollbar { width: 4px; }
  .agent-chat-textarea::-webkit-scrollbar-track { background: transparent; }
  .agent-chat-textarea::-webkit-scrollbar-thumb { background: #C8D0DE; border-radius: 2px; }
  .agent-chat-textarea { scrollbar-width: thin; scrollbar-color: #C8D0DE transparent; }
`;

export default function AgentChat({
  messages, addMessage, clearMessages, setProfile, isOpen,
  profileEditActive = false, setProfileEditActive,
}: AgentChatProps) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isExtractingResume, setIsExtractingResume] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Live intent — derived from what the user is currently typing
  const liveIntent = !profileEditActive && input.trim().length > 3
    ? detectChatIntent(input)
    : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, liveIntent]);

  async function handleFileUpload(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      addMessage('agent', 'Please upload a PDF or Word document (.pdf, .doc, .docx).');
      return;
    }
    addMessage('user', `📎 ${file.name}`);
    setIsExtractingResume(true);
    try {
      const { data: extracted } = await extractResumeFile(file);
      const text = extracted.text || '';
      if (!text) {
        addMessage('agent', 'Could not extract text from that file. Try a different format or paste your About Me directly.');
        return;
      }
      // Use Gemini to intelligently extract role, industry, skills, etc.
      const { data: updatedProfile } = await inferProfileFromResume(text);
      setProfile?.(updatedProfile);
      setProfileEditActive?.(false);
      addMessage(
        'agent',
        'Profile updated from your resume. Want me to re-score your current jobs against the new profile?',
        'RECOMPARE_PROMPT',
        null,
      );
    } catch {
      addMessage('agent', 'Failed to process your resume. Please try again or paste your About Me directly.');
    } finally {
      setIsExtractingResume(false);
    }
  }

  function detectChatIntent(text: string): 'EDIT_PROFILE' | null {
    const EDIT_PATTERNS = [
      /\bedit\s+(?:my\s+)?(?:profile|resume|bio|about)\b/i,
      /\bupdate\s+(?:my\s+)?(?:profile|resume|bio|about)\b/i,
      /\bchange\s+(?:my\s+)?(?:profile|resume|bio|about)\b/i,
      /\bmodify\s+(?:my\s+)?(?:profile|resume|bio|about)\b/i,
      /\bi\s+want\s+to\s+(?:edit|update|change|modify)\b/i,
      /\b(?:update|edit|change)\s+my\s+info\b/i,
    ];
    return EDIT_PATTERNS.some((p) => p.test(text)) ? 'EDIT_PROFILE' : null;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping || isExtractingResume) return;
    setInput('');

    if (profileEditActive) {
      const cancelPattern = /\b(cancel|no|stop|don'?t|revert|nevermind|never\s+mind|forget\s+it)\b/i;
      if (cancelPattern.test(text)) {
        addMessage('user', text);
        setProfileEditActive?.(false);
        addMessage('agent', 'Profile update cancelled. Your current profile is unchanged.');
        return;
      }
      addMessage('user', text);
      setIsTyping(true);
      try {
        const updates = extractProfileFields(text);
        const { data: updatedProfile } = await updateProfile(updates);
        setProfile?.(updatedProfile);
        setProfileEditActive?.(false);
        addMessage(
          'agent',
          'Profile updated. Want me to re-score your current jobs against the new profile?',
          'RECOMPARE_PROMPT',
          null,
        );
      } catch {
        addMessage('agent', 'Failed to update your profile. Please try again.');
      } finally {
        setIsTyping(false);
      }
      return;
    }

    // ── Normal chat ───────────────────────────────────────────────────────────
    addMessage('user', text);
    setIsTyping(true);
    try {
      const { data } = await sendChatMessage(text);
      addMessage('agent', data.reply, data.actionType ?? null, data.actionData ?? null);
    } catch {
      addMessage('agent', 'Sorry, I had trouble processing that. Please try again.');
    } finally {
      setIsTyping(false);
    }
  }

  async function handleSuggestionAction(action: string) {
    if (action === 'TRIGGER_EDIT_PROFILE') {
      setProfileEditActive?.(true);
      addMessage(
        'agent',
        'Got it — paste your new About Me below, or use the upload button to drop your resume (PDF or DOCX). Type "cancel" to keep your current profile.',
        'PROFILE_EDIT_REQUEST',
        null,
      );
      return;
    }

    if (action === 'RECOMPARE_YES') {
      addMessage('user', 'Yes, re-score my jobs');
      setIsTyping(true);
      try {
        const { data } = await reanalyzeAllJobs();
        if (!data.total) {
          addMessage('agent', "No jobs to re-score yet — you haven't analyzed any positions. Head to the Analyze tab to add some.");
        } else {
          addMessage('agent', `Done — ${data.count} of ${data.total} job${data.total !== 1 ? 's' : ''} re-scored against your updated profile. Check the Pipeline tab to see new match scores.`);
        }
      } catch {
        addMessage('agent', 'Re-scoring ran into an issue. You can re-analyze jobs individually from the Analyze tab.');
      } finally {
        setIsTyping(false);
      }
      return;
    }

    if (action === 'RECOMPARE_NO') {
      addMessage('user', "No, I'll add new jobs");
      addMessage('agent', 'Got it — your profile is updated. Head to the Analyze tab to score new positions against it.');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  return (
    <aside style={{
      width: isOpen ? 320 : 0,
      flexShrink: 0,
      transition: 'width 200ms ease-in-out',
      overflow: 'hidden',
      background: '#FFFFFF',
      borderLeft: isOpen ? '1px solid #E2E8F0' : 'none',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <style>{CHAT_STYLES}</style>
      <div style={{ width: 320, minWidth: 320, height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{
          height: 56, flexShrink: 0, display: 'flex', alignItems: 'center',
          borderBottom: '1px solid #E2E8F0', paddingLeft: 20, paddingRight: 12,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', fontFamily: 'Poppins, sans-serif' }}>Agent</span>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={() => {
                if (window.confirm('Clear conversation history?')) {
                  clearMessages();
                  setProfileEditActive?.(false);
                }
              }}
              title="Clear chat"
              style={{ width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#CBD5E1', minHeight: 'unset', transition: 'color 120ms, background 120ms' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#DC2626'; (e.currentTarget as HTMLButtonElement).style.background = '#FEF2F2'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#CBD5E1'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* ── Messages ────────────────────────────────────────────────── */}
        <div
          className="no-scrollbar"
          style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 60 }}>
              <p style={{ fontSize: 12, fontWeight: 300, color: '#94A3B8', textAlign: 'center', lineHeight: 1.6 }}>
                Ask me anything about your job search, or use the edit icon to update your profile.
              </p>
            </div>
          )}
          {messages
            .filter((msg) => {
              const t = msg.text.trim();
              return t !== '' && t !== '[resume text pasted]';
            })
            .map((msg, i) => (
              <MessageBubble key={i} message={msg} onAction={handleSuggestionAction} />
            ))}
          {/* ── Live intent bubble — appears while user is typing ─────── */}
          {liveIntent === 'EDIT_PROFILE' && (
            <div className="live-intent-bubble" style={{ display: 'flex', alignItems: 'flex-start' }}>
              <SpinBorder variant="agent" style={{ maxWidth: '88%' }}>
                <button
                  onClick={() => {
                    const t = input.trim();
                    setInput('');
                    if (t) addMessage('user', t);
                    handleSuggestionAction('TRIGGER_EDIT_PROFILE');
                  }}
                  style={{
                    display: 'block', width: '100%',
                    padding: '10px 13px',
                    background: BUBBLE_GRADIENT,
                    border: '1px solid #E2E8F0',
                    borderRadius: '4px 18px 18px 18px',
                    cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'Poppins, sans-serif', minHeight: 'unset',
                    transition: 'background 120ms',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = BUBBLE_GRADIENT; }}
                >
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#16A34A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                    Tap to confirm
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#374151', lineHeight: 1.4 }}>
                    Edit my profile →
                  </span>
                </button>
              </SpinBorder>
            </div>
          )}
          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} style={{ height: 12 }} />
        </div>

        {/* ── Input area ──────────────────────────────────────────────── */}
        <div style={{ padding: '10px 12px 12px', borderTop: '1px solid #E2E8F0', flexShrink: 0 }}>
          {profileEditActive && (
            <div style={{
              marginBottom: 8, padding: '6px 12px', borderRadius: 10,
              background: 'linear-gradient(to right, #F0FDF4, #DCFCE7)',
              border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', flexShrink: 0, animation: 'agentPulse 1.4s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#15803D' }}>
                Profile edit mode — type bio or upload resume
              </span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            <ChatTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={profileEditActive ? 'Paste your new About Me here, or upload a resume…' : 'Ask RetrofitAI anything…'}
              rows={1}
              spinning={profileEditActive}
            />

            {/* Resume upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isExtractingResume || isTyping}
              title="Upload resume (PDF or DOCX)"
              style={{
                width: 42, height: 42, flexShrink: 0, borderRadius: 12, minHeight: 'unset',
                background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
                color: '#FFFFFF', border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: isExtractingResume || isTyping ? 'wait' : 'pointer',
                opacity: isExtractingResume || isTyping ? 0.55 : 1,
                transition: 'opacity 120ms',
              }}
              onMouseEnter={(e) => { if (!isExtractingResume && !isTyping) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
              onMouseLeave={(e) => { if (!isExtractingResume && !isTyping) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
            >
              {isExtractingResume
                ? <Loader2 size={14} style={{ animation: 'chatSpin 1s linear infinite' }} />
                : <Paperclip size={14} />}
            </button>

            {/* Send */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping || isExtractingResume}
              className={cn()}
              style={{
                width: 42, height: 42, flexShrink: 0, borderRadius: 12, minHeight: 'unset',
                background: input.trim() && !isTyping && !isExtractingResume
                  ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
                  : '#F1F5F9',
                color: input.trim() && !isTyping && !isExtractingResume ? '#FFFFFF' : '#94A3B8',
                border: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() && !isTyping && !isExtractingResume ? 'pointer' : 'not-allowed',
                transition: 'background 120ms, color 120ms',
              }}
              onMouseEnter={(e) => { if (input.trim() && !isTyping && !isExtractingResume) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #15803D 0%, #166534 100%)'; }}
              onMouseLeave={(e) => { if (input.trim() && !isTyping && !isExtractingResume) (e.currentTarget as HTMLButtonElement).style.background = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'; }}
            >
              <Send size={14} />
            </button>
          </div>
          <p style={{ fontSize: 11, fontWeight: 300, color: '#16A34A', opacity: 0.6, textAlign: 'center', marginTop: 6 }}>
            Not a licensed career counselor or employment advisor
          </p>
        </div>
      </div>
    </aside>
  );
}

// ─── Profile field extraction (shared by text bio + file upload) ──────────────

function extractProfileFields(text: string): Record<string, unknown> {
  const yearsMatch = text.match(/(\d+)\s*(?:\+\s*)?years?/i);
  const years = yearsMatch ? parseInt(yearsMatch[1]) : undefined;
  const skillKws = ['Go','Python','TypeScript','JavaScript','Java','Rust','Node.js','PostgreSQL','MongoDB','Redis','Kafka','Kubernetes','Docker','AWS','GCP','Azure','GraphQL','gRPC','Distributed Systems','System Design','React'];
  const foundSkills = skillKws.filter(s => new RegExp(`\\b${s}\\b`, 'i').test(text));
  const currentRole = text.match(/(?:I(?:'m| am) a[n]?\s+)([\w\s]+?Engineer|[\w\s]+?Developer|[\w\s]+?Manager|[\w\s]+?Designer)/i)?.[1]?.trim();
  const targetRole = text.match(/targeting\s+([\w\s]+?(?:Engineer|Developer|Manager|Director|Lead))/i)?.[1]?.trim();
  const industryMap: [RegExp, string][] = [
    [/\bfintech\b/i, 'Fintech'], [/\bedtech\b/i, 'Edtech'], [/\bhealthcare\b/i, 'Healthcare'],
    [/\bsaas\b/i, 'SaaS'], [/\bcrypto\b/i, 'Crypto'], [/\bweb3\b/i, 'Web3'],
    [/\bdev[\s-]?tools?\b/i, 'Dev Tools'], [/\bgaming\b/i, 'Gaming'],
    [/\binfrastructure\b/i, 'Infrastructure'], [/\benterprise\b/i, 'Enterprise'],
  ];
  const targetIndustry = industryMap.find(([rx]) => rx.test(text))?.[1];
  const updates: Record<string, unknown> = { resumeText: text };
  if (years) updates.yearsExperience = years;
  if (foundSkills.length > 0) updates.skills = foundSkills;
  if (currentRole) updates.currentRole = currentRole;
  if (targetRole) updates.targetRole = targetRole;
  if (targetIndustry) updates.targetIndustry = targetIndustry;
  return updates;
}

// ─── SpinBorder — rotating gradient ring for agent action messages ────────────

function SpinBorder({ children, variant = 'agent', style }: {
  children: React.ReactNode;
  variant?: 'agent' | 'user';
  style?: React.CSSProperties;
}) {
  const grad = variant === 'agent'
    ? 'conic-gradient(from 0deg, #16A34A 0deg, #86EFAC 90deg, #BBF7D0 150deg, #86EFAC 240deg, #15803D 360deg)'
    : 'conic-gradient(from 0deg, #C8D0DE 0deg, #E8ECF3 90deg, #FFFFFF 150deg, #E8ECF3 240deg, #C8D0DE 360deg)';
  const outerRadius = variant === 'agent' ? '4px 18px 18px 18px' : '18px 4px 18px 18px';
  return (
    <div style={{ position: 'relative', padding: 2, borderRadius: outerRadius, overflow: 'hidden', ...style }}>
      <div style={{ position: 'absolute', inset: '-100%', background: grad, animation: 'bubbleSpinBorder 2.6s linear infinite' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message, onAction }: { message: ConversationEntry; onAction?: (action: string) => void }) {
  const isAgent = message.role === 'agent';
  const isSuggest = message.actionType === 'EDIT_PROFILE_SUGGEST';
  const isAgentAction = isAgent && message.actionType != null && message.actionType !== 'ONBOARDING_COMPLETE';
  const isUserAction  = !isAgent && message.actionType === 'PROFILE_EDIT_TRIGGER';

  const displayText = isAgent ? sanitizeMessage(message.text) : message.text;
  if (!displayText.trim()) return null;

  const bubbleStyle: React.CSSProperties = {
    padding: '9px 13px',
    borderRadius: isAgent ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
    fontSize: 13, fontWeight: 400, lineHeight: 1.55,
    ...(isAgent
      ? { background: BUBBLE_GRADIENT, color: '#374151', border: '1px solid #E2E8F0', boxShadow: BUBBLE_SHADOW }
      : { background: USER_GRADIENT, color: '#FFFFFF', border: 'none', boxShadow: BUBBLE_SHADOW }),
  };

  const bubbleContent = (
    <>
      <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{displayText}</span>
      {isSuggest && (
        <button
          onClick={() => onAction?.('TRIGGER_EDIT_PROFILE')}
          style={{
            display: 'block', width: '100%', marginTop: 10,
            padding: '8px 14px', borderRadius: 10,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            color: '#FFFFFF', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
            minHeight: 'unset', textAlign: 'center', transition: 'opacity 120ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Edit my profile →
        </button>
      )}
      {message.actionType === 'RECOMPARE_PROMPT' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button
            onClick={() => onAction?.('RECOMPARE_YES')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
              color: '#FFFFFF', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
              minHeight: 'unset', transition: 'opacity 120ms',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.8'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            Yes, re-score →
          </button>
          <button
            onClick={() => onAction?.('RECOMPARE_NO')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: BUBBLE_GRADIENT,
              color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
              minHeight: 'unset', transition: 'opacity 120ms',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            No, I'll add new
          </button>
        </div>
      )}
    </>
  );

  const textEl = <div style={bubbleStyle}>{bubbleContent}</div>;

  if (isAgentAction) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <SpinBorder variant="agent" style={{ maxWidth: '88%' }}>{textEl}</SpinBorder>
      </div>
    );
  }
  if (isUserAction) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SpinBorder variant="user" style={{ maxWidth: '88%' }}>{textEl}</SpinBorder>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', justifyContent: isAgent ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '88%', ...bubbleStyle }}>{bubbleContent}</div>
    </div>
  );
}

// ─── Chat Textarea ────────────────────────────────────────────────────────────

function ChatTextarea({ spinning = false, onFocus, onBlur, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { spinning?: boolean }) {
  const [focused, setFocused] = useState(false);
  const SILVER_GRAD = 'conic-gradient(from 0deg, #C8D0DE 0deg, #E8ECF3 90deg, #FFFFFF 150deg, #E8ECF3 240deg, #C8D0DE 360deg)';
  return (
    <div style={{
      flex: 1,
      position: 'relative',
      borderRadius: 18,
      overflow: 'hidden',
      padding: spinning ? 2 : 0,
    }}>
      {spinning && (
        <div style={{
          position: 'absolute', inset: '-100%',
          background: SILVER_GRAD,
          animation: 'bubbleSpinBorder 2.6s linear infinite',
        }} />
      )}
      <div style={{
        position: 'relative', zIndex: 1,
        borderRadius: spinning ? 16 : 18,
        border: spinning ? 'none' : `1px solid ${focused ? '#C8D0DE' : '#E2E8F0'}`,
        overflow: 'hidden',
        background: '#F8FAFC',
        minHeight: 42, maxHeight: 112,
        display: 'flex',
        transition: spinning ? 'none' : 'border-color 150ms',
      }}>
        <textarea
          {...rest}
          className="agent-chat-textarea"
          style={{
            flex: 1, resize: 'none', border: 'none', borderRadius: 0,
            padding: '11px 12px 11px 14px',
            overflowY: 'auto',
            fontSize: 13, fontFamily: 'Poppins, sans-serif', fontWeight: 400,
            lineHeight: '20px',
            background: 'transparent', color: '#0F172A',
            outline: 'none', boxShadow: 'none',
            minHeight: 42, maxHeight: 112,
            display: 'block', boxSizing: 'border-box',
          }}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        />
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: 'flex' }}>
      <div style={{ padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: BUBBLE_GRADIENT, border: '1px solid #E2E8F0', boxShadow: BUBBLE_SHADOW }}>
        <div className="dots-pulse"><span /><span /><span /></div>
      </div>
    </div>
  );
}

// ─── sanitizeMessage ──────────────────────────────────────────────────────────

function sanitizeMessage(text: string): string {
  const trimmed = text.trim();
  const stripped = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  if (!stripped.startsWith('{')) return text;
  try {
    const parsed = JSON.parse(stripped) as Record<string, unknown>;
    if (typeof parsed.reply === 'string') return sanitizeMessage(parsed.reply);
    if (parsed.matchScore !== undefined || parsed.jobTitle !== undefined) {
      const company = (parsed.company as string) || 'this company';
      const score = parsed.matchScore ?? '?';
      return `Analysis complete for ${company}: ${score}/100.`;
    }
    return 'Got it — anything else I can help you with?';
  } catch {
    if (stripped.startsWith('{')) {
      const m = stripped.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (m) return m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      return 'Got it — anything else I can help you with?';
    }
  }
  return text;
}
