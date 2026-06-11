import { useState, useRef, useEffect } from 'react';
import { Send, Trash2, Paperclip, Loader2, Copy, Check } from 'lucide-react';
import {
  sendChatMessage,
  updateProfile,
  inferProfileFromResume,
  extractResumeFile,
  reanalyzeAllJobs,
  updateDraftStatus,
  confirmDraft,
  getAgentDrafts,
  seedDemoRejections,
} from '@/lib/api';
import type {
  ConversationEntry,
  CareerProfile,
  AgentActionType,
  AgentDraft,
  ProactiveAction,
  AgentEvent,
  AgentDashboard,
  JobAnalysis,
  RejectionPattern,
  ActiveMission,
  MissionStepResult,
} from '@/types';
import SkillGapChart from '@/components/SkillGapChart';
import RejectionFunnelChart from '@/components/RejectionFunnelChart';

interface AgentChatProps {
  layout?: 'page' | 'sidebar';
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
  proactiveActions?: ProactiveAction[];
  agentDrafts?: AgentDraft[];
  setAgentDrafts?: (drafts: AgentDraft[]) => void;
  profileEditActive?: boolean;
  setProfileEditActive?: (v: boolean) => void;
  agentStatus?: 'idle' | 'working' | 'done';
  agentEvents?: AgentEvent[];
  dashboard?: AgentDashboard | null;
  onRefreshDashboard?: () => void;
  onRunAutonomous?: () => void;
  onChatMcpActivity?: (events: AgentEvent[]) => void;
  activeMission?: ActiveMission | null;
}

const BUBBLE_GRADIENT = 'linear-gradient(to bottom, #E8ECF3, #FFFFFF 28%, #FFFFFF 72%, #E8ECF3)';
const BUBBLE_SHADOW   = '0 4px 16px rgba(0,0,0,0.07)';
const USER_GRADIENT   = 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)';

const SILVER_INPUT_GRAD =
  'conic-gradient(from 0deg, #E8ECF3 0deg, #FFFFFF 70deg, #C8D0DE 160deg, #64748B 250deg, #E8ECF3 360deg)';

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
  .agent-input-silver-spin {
    position: absolute; inset: -100%;
    background: ${SILVER_INPUT_GRAD};
    animation: bubbleSpinBorder 2.8s linear infinite;
  }
`;

export default function AgentChat({
  layout = 'page',
  messages,
  addMessage,
  clearMessages,
  setProfile,
  proactiveActions = [],
  agentDrafts = [],
  setAgentDrafts,
  profileEditActive = false,
  setProfileEditActive,
  agentStatus = 'idle',
  agentEvents = [],
  dashboard = null,
  onRefreshDashboard,
  onRunAutonomous,
  onChatMcpActivity,
  activeMission = null,
}: AgentChatProps) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isExtractingResume, setIsExtractingResume] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  const DEMO_BIO = "Hi, I'm Alex Chen. I'm a Senior Software Engineer with 7 years of experience building distributed backend systems at scale. I have a BS in Computer Science from UC Berkeley. My core skills include Go, Python, distributed systems design, Kubernetes, PostgreSQL, Redis, gRPC, and cloud infrastructure on GCP and AWS. Most recently I've been building high-throughput data pipelines and real-time APIs serving millions of users. I'm targeting Staff Engineer and Senior Backend Engineer roles at product-led companies — fintech, dev tools, and infrastructure. I've been applying for 3 months, sent about 18 applications, and gotten almost no response.";
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPage = layout === 'page';
  const isAgentWorking = agentStatus === 'working';

  const liveIntent = !profileEditActive && input.trim().length > 3
    ? detectChatIntent(input)
    : null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, liveIntent, agentDrafts.length]);

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
        addMessage('agent', 'Could not extract text from that file. Try a different format or paste your bio directly.');
        return;
      }
      const { data: updatedProfile } = await inferProfileFromResume(text);
      setProfile(updatedProfile);
      setProfileEditActive?.(false);
      addMessage(
        'agent',
        'Profile updated from your resume. Want me to re-score your current jobs against the new profile?',
        'RECOMPARE_PROMPT',
        null,
      );
    } catch {
      addMessage('agent', 'Failed to process your resume. Please try again or paste your bio directly.');
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

  function applyChatMcpActivity(data: { mcpActivity?: AgentEvent[] }) {
    if (data.mcpActivity?.length) onChatMcpActivity?.(data.mcpActivity);
  }

  async function afterAgentResponse(data: {
    actionType?: string | null;
    actionData?: Record<string, unknown> | null;
    mcpActivity?: AgentEvent[];
  }) {
    applyChatMcpActivity(data);
    if (data.actionType === 'WEEKLY_BRIEFING_RESULT' || data.actionType === 'PATTERN_ANALYSIS_RESULT') {
      try {
        const { data: draftsRes } = await getAgentDrafts();
        if (draftsRes?.data) setAgentDrafts?.(draftsRes.data);
      } catch { /* non-fatal */ }
    }
    onRefreshDashboard?.();
  }

  async function handleLoadDemo() {
    setDemoLoading(true);
    try {
      await updateProfile({
        resumeText: DEMO_BIO,
        currentRole: 'Senior Software Engineer',
        targetRole: 'Staff Engineer',
        targetIndustry: 'Fintech',
        yearsExperience: 7,
        skills: ['Go', 'Python', 'Kubernetes', 'PostgreSQL', 'Redis', 'gRPC', 'Distributed Systems'],
        agentMode: 'ACTIVE_SEARCH',
      });
      await seedDemoRejections();
      addMessage('agent', 'Demo loaded: Alex Chen profile + 3 rejections (Stripe, Shopify, Google). Watch the MCP panel — the agent is analyzing your pipeline now.');
      await onRefreshDashboard?.();
      onRunAutonomous?.();
    } catch {
      addMessage('agent', 'Failed to load demo data. Please try again.');
    } finally {
      setDemoLoading(false);
    }
  }

  async function handleQuickAction(message: string) {
    if (/edit\s+my\s+profile/i.test(message)) {
      handleSuggestionAction('TRIGGER_EDIT_PROFILE');
      return;
    }
    if (message.startsWith('Paste a job')) {
      addMessage('agent', 'Paste any job description in the box below — include the full posting text for the best match score.');
      return;
    }
    addMessage('user', message);
    setIsTyping(true);
    try {
      const { data } = await sendChatMessage(message);
      addMessage('agent', data.reply, data.actionType ?? null, data.actionData ?? null);
      await afterAgentResponse(data);
    } catch {
      addMessage('agent', 'Sorry, I had trouble processing that. Please try again.');
    } finally {
      setIsTyping(false);
    }
  }

  async function handleCoverLetterPick(company: string) {
    if (isTyping) return;
    const text = `Generate cover letter for ${company}`;
    addMessage('user', text);
    setIsTyping(true);
    try {
      const { data } = await sendChatMessage(text);
      addMessage('agent', data.reply, data.actionType ?? null, data.actionData ?? null);
      await afterAgentResponse(data);
    } catch {
      addMessage('agent', 'Sorry, I had trouble generating that cover letter. Please try again.');
    } finally {
      setIsTyping(false);
    }
  }

  async function handleProactiveAction(action: ProactiveAction) {
    let message = action.label;
    if (action.intent === 'FOLLOW_UP' && action.company) {
      message = `draft follow up for ${action.company}`;
    } else if (action.intent === 'WEEKLY_REPORT') {
      message = 'generate weekly briefing';
    } else if (action.intent === 'PATTERN_ANALYSIS') {
      message = 'run pattern analysis';
    }
    addMessage('user', message);
    setIsTyping(true);
    try {
      const { data } = await sendChatMessage(message);
      addMessage('agent', data.reply, data.actionType ?? null, data.actionData ?? null);
      await afterAgentResponse(data);
    } catch {
      addMessage('agent', 'Sorry, I had trouble processing that. Please try again.');
    } finally {
      setIsTyping(false);
    }
  }

  async function handleDraftApprove(draftId: string) {
    const draft = agentDrafts.find((d) => d._id === draftId);
    if (!draft) return;
    try {
      if (draft.type === 'pattern' || draft.type === 'briefing') {
        await confirmDraft(draftId);
        const label = draft.type === 'pattern' ? 'Rejection pattern' : 'Weekly briefing';
        addMessage('agent', `${label} approved and saved to your profile.`);
      } else {
        await updateDraftStatus(draftId, 'sent');
        addMessage('agent', `Marked follow-up for ${draft.company} as sent.`);
      }
      setAgentDrafts?.(agentDrafts.filter((d) => d._id !== draftId));
      onRefreshDashboard?.();
      getAgentDrafts().then(({ data: draftsRes }) => {
        if (draftsRes?.data) setAgentDrafts?.(draftsRes.data);
      }).catch(() => {});
    } catch {
      addMessage('agent', 'Failed to approve draft. Please try again.');
    }
  }

  async function handleDraftDismiss(draftId: string) {
    const draft = agentDrafts.find((d) => d._id === draftId);
    try {
      if (draft?.type === 'pattern' || draft?.type === 'briefing') {
        await updateDraftStatus(draftId, 'dismissed');
      } else {
        await updateDraftStatus(draftId, 'dismissed');
      }
      setAgentDrafts?.(agentDrafts.filter((d) => d._id !== draftId));
      onRefreshDashboard?.();
      getAgentDrafts().then(({ data: draftsRes }) => {
        if (draftsRes?.data) setAgentDrafts?.(draftsRes.data);
      }).catch(() => {});
    } catch {
      addMessage('agent', 'Failed to dismiss draft.');
    }
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
        setProfile(updatedProfile);
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

    addMessage('user', text);
    setIsTyping(true);
    try {
      const { data } = await sendChatMessage(text);
      addMessage('agent', data.reply, data.actionType ?? null, data.actionData ?? null);
      await afterAgentResponse(data);
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
        'Paste your new About Me below, or upload your resume (PDF or DOCX). Type "cancel" to keep your current profile.',
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
          addMessage('agent', "No jobs to re-score yet — paste a job description and I'll analyze it.");
        } else {
          addMessage('agent', `Done — ${data.count} of ${data.total} job${data.total !== 1 ? 's' : ''} re-scored against your updated profile.`);
        }
      } catch {
        addMessage('agent', 'Re-scoring ran into an issue. Try asking me to analyze a specific job.');
      } finally {
        setIsTyping(false);
      }
      return;
    }

    if (action === 'RECOMPARE_NO') {
      addMessage('user', "No, I'll add new jobs");
      addMessage('agent', 'Got it — paste any job description and I\'ll score it against your profile.');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  const outerStyle: React.CSSProperties = isPage
    ? { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#F8FAFC', overflow: 'hidden' }
    : {
        width: 320,
        flexShrink: 0,
        background: '#FFFFFF',
        borderLeft: '1px solid #E2E8F0',
        display: 'flex',
        flexDirection: 'column',
      };

  const innerStyle: React.CSSProperties = isPage
    ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, maxWidth: 680, width: '100%', margin: '0 auto' }
    : { width: 320, minWidth: 320, height: '100%', display: 'flex', flexDirection: 'column' };

  return (
    <div style={outerStyle}>
      <style>{CHAT_STYLES}</style>

      <div style={{ ...innerStyle, flex: 1, minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          flexShrink: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          padding: isPage ? '8px 16px 0' : '0 12px',
        }}>
          <button
            onClick={() => {
              if (window.confirm('Clear conversation?')) {
                clearMessages();
                setProfileEditActive?.(false);
              }
            }}
            title="Clear chat"
            style={{
              width: 28, height: 28, borderRadius: 8, background: 'transparent', border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              color: '#CBD5E1', minHeight: 'unset',
            }}
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Messages */}
        <div
          className="no-scrollbar"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isPage ? '8px 16px 0' : '12px 12px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 24, gap: 16 }}>
              <div style={{ textAlign: 'center', maxWidth: 400 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#16A34A', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 8px' }}>
                  Ready when you are
                </p>
                <p style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', lineHeight: 1.5, margin: '0 0 8px' }}>
                  I'll read your pipeline from MongoDB, find where you're losing, and take action.
                </p>
                <p style={{ fontSize: 13, fontWeight: 300, color: '#94A3B8', lineHeight: 1.6, margin: 0 }}>
                  Use the panel on the left, or type below. Paste a full job description for scoring, or ask "run pattern analysis" after 3 rejections.
                </p>
              </div>
              {isAgentWorking && (
                <div style={{ padding: '10px 16px', borderRadius: 12, background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16A34A', animation: 'agentPulse 1.2s ease-in-out infinite' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#15803D' }}>Agent running autonomous pipeline via MongoDB MCP…</span>
                </div>
              )}
            </div>
          )}

          {messages
            .filter((msg) => {
              const t = msg.text.trim();
              return t !== '' && t !== '[resume text pasted]';
            })
            .map((msg, i) => (
              <div key={i}>
                <MessageBubble
                  message={msg}
                  onAction={handleSuggestionAction}
                  onCoverLetterPick={handleCoverLetterPick}
                  pickDisabled={isTyping}
                />
                {msg.actionType === 'PROACTIVE_BRIEFING' && proactiveActions.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 }}>
                    {proactiveActions.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => handleProactiveAction(action)}
                        disabled={isTyping}
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '8px 14px',
                          borderRadius: 999,
                          border: '1px solid #BBF7D0',
                          background: '#F0FDF4',
                          color: '#15803D',
                          cursor: isTyping ? 'not-allowed' : 'pointer',
                          fontFamily: 'Poppins, sans-serif',
                        }}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}

          {agentDrafts.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#64748B', letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0 }}>
                Agent drafts — review &amp; approve
              </p>
              {agentDrafts.map((draft) => (
                <DraftCard
                  key={draft._id}
                  draft={draft}
                  onApprove={() => handleDraftApprove(draft._id)}
                  onDismiss={() => handleDraftDismiss(draft._id)}
                />
              ))}
            </div>
          )}

          {liveIntent === 'EDIT_PROFILE' && (
            <div className="live-intent-bubble" style={{ display: 'flex', alignItems: 'flex-start', maxWidth: '88%' }}>
              <button
                onClick={() => {
                  const t = input.trim();
                  setInput('');
                  if (t) addMessage('user', t);
                  handleSuggestionAction('TRIGGER_EDIT_PROFILE');
                }}
                style={{
                  display: 'block', width: '100%', padding: '10px 13px',
                  background: BUBBLE_GRADIENT, border: '1px solid #E2E8F0',
                  borderRadius: '4px 18px 18px 18px', cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'Poppins, sans-serif', minHeight: 'unset', boxShadow: BUBBLE_SHADOW,
                }}
              >
                <span style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#16A34A', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>
                  Tap to confirm
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>Edit my profile →</span>
              </button>
            </div>
          )}

          {isTyping && <TypingIndicator />}
          <div ref={bottomRef} style={{ height: 12 }} />
        </div>

        {/* Input */}
        <div style={{
          padding: isPage ? '12px 16px 20px' : '10px 12px 12px',
          flexShrink: 0,
        }}>
          {profileEditActive && (
            <div style={{
              marginBottom: 8, padding: '6px 12px', borderRadius: 10,
              background: 'linear-gradient(to right, #F0FDF4, #DCFCE7)',
              border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#16A34A', animation: 'agentPulse 1.4s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: '#15803D' }}>Profile edit mode</span>
            </div>
          )}
          <div style={{ position: 'relative', padding: 2, borderRadius: 20, overflow: 'hidden' }}>
            <div className="agent-input-silver-spin" />
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', gap: 8, padding: '8px 10px',
              borderRadius: 18, background: '#FFFFFF',
              boxShadow: '0 4px 16px rgba(0,0,0,0.05)',
            }}>
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
                title="Upload resume"
                style={{
                  width: 40, height: 40, flexShrink: 0, borderRadius: 12,
                  background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: isExtractingResume || isTyping ? 'wait' : 'pointer',
                }}
              >
                {isExtractingResume
                  ? <Loader2 size={14} style={{ animation: 'chatSpin 1s linear infinite' }} />
                  : <Paperclip size={14} />}
              </button>

              <ChatTextarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={profileEditActive ? 'Paste your new About Me…' : 'Message RetrofitAI…'}
                rows={1}
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || isTyping || isExtractingResume}
                style={{
                  width: 40, height: 40, flexShrink: 0, borderRadius: 12,
                  background: input.trim() && !isTyping && !isExtractingResume
                    ? 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)'
                    : '#F1F5F9',
                  color: input.trim() && !isTyping && !isExtractingResume ? '#FFFFFF' : '#94A3B8',
                  border: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: input.trim() && !isTyping && !isExtractingResume ? 'pointer' : 'not-allowed',
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
          <p style={{ fontSize: 11, fontWeight: 300, color: '#94A3B8', textAlign: 'center', marginTop: 8 }}>
            RetrofitAI provides career guidance, not licensed career counseling.
          </p>
        </div>
      </div>

    </div>
  );
}

function draftTypeLabel(type?: AgentDraft['type']): string {
  if (type === 'pattern') return 'Rejection pattern';
  if (type === 'briefing') return 'Weekly briefing';
  return 'Follow-up';
}

function DraftCard({
  draft,
  onApprove,
  onDismiss,
}: {
  draft: AgentDraft;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const isApprovalDraft = draft.type === 'pattern' || draft.type === 'briefing';
  const typeLabel = draftTypeLabel(draft.type);

  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 14,
      background: '#FFFFFF',
      border: '1px solid #E2E8F0',
      boxShadow: BUBBLE_SHADOW,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {typeLabel}{draft.company ? ` — ${draft.company}` : ''}
      </p>
      <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginBottom: 4 }}>{draft.subject}</p>
      <p style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
        {draft.body}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={onApprove}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            color: '#FFFFFF', fontSize: 12, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
          }}
        >
          {isApprovalDraft ? 'Approve' : 'Mark sent'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 10, cursor: 'pointer',
            background: '#F8FAFC', color: '#64748B', border: '1px solid #E2E8F0',
            fontSize: 12, fontWeight: 600, fontFamily: 'Poppins, sans-serif',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

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

function ResultCard({ children, label, accent = '#16A34A' }: { children: React.ReactNode; label: string; accent?: string }) {
  return (
    <div style={{
      marginTop: 8, padding: '12px 14px', borderRadius: 14,
      background: '#FFFFFF', border: `1px solid ${accent}33`,
      boxShadow: BUBBLE_SHADOW,
    }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function MessageBubble({
  message,
  onAction,
  onCoverLetterPick,
  pickDisabled = false,
}: {
  message: ConversationEntry;
  onAction?: (action: string) => void;
  onCoverLetterPick?: (company: string) => void;
  pickDisabled?: boolean;
}) {
  const isAgent = message.role === 'agent';
  const isSuggest = message.actionType === 'EDIT_PROFILE_SUGGEST';
  const actionData = message.actionData;

  const displayText = isAgent ? sanitizeMessage(message.text) : message.text;
  if (!displayText.trim() && !actionData) return null;

  const bubbleStyle: React.CSSProperties = {
    padding: '10px 14px',
    borderRadius: isAgent ? '4px 18px 18px 18px' : '18px 4px 18px 18px',
    fontSize: 14, fontWeight: 400, lineHeight: 1.55,
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
            display: 'block', width: '100%', marginTop: 10, padding: '8px 14px', borderRadius: 10,
            background: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
            color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            fontFamily: 'Poppins, sans-serif',
          }}
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
              color: '#FFFFFF', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Yes, re-score →
          </button>
          <button
            onClick={() => onAction?.('RECOMPARE_NO')}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 10,
              background: BUBBLE_GRADIENT, color: '#64748B', border: '1px solid #E2E8F0', cursor: 'pointer',
              fontSize: 12, fontWeight: 600,
            }}
          >
            No, I'll add new
          </button>
        </div>
      )}
      {message.actionType === 'JOB_ANALYSIS_RESULT' && actionData?.jobAnalysis && (
        <JobAnalysisCard job={actionData.jobAnalysis as JobAnalysis} />
      )}
      {message.actionType === 'PATTERN_ANALYSIS_RESULT' && actionData?.pattern && (
        <PatternResultCard pattern={actionData.pattern as RejectionPattern} />
      )}
      {message.actionType === 'FOLLOW_UP_EMAIL' && actionData && (
        <ResultCard label="Follow-up draft" accent="#16A34A">
          <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: '0 0 6px' }}>{String(actionData.subject || '')}</p>
          <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0, maxHeight: 100, overflow: 'auto' }}>{String(actionData.body || '')}</p>
        </ResultCard>
      )}
      {message.actionType === 'WEEKLY_BRIEFING_RESULT' && actionData?.briefing && (
        <BriefingResultCard briefing={actionData.briefing as Record<string, unknown>} />
      )}
      {message.actionType === 'MISSION_DEBRIEF' && actionData?.result && (
        <MissionResultCard
          result={actionData.result as MissionStepResult}
          onPickCoverLetter={onCoverLetterPick}
          pickDisabled={pickDisabled}
        />
      )}
    </>
  );

  return (
    <div style={{ display: 'flex', justifyContent: isAgent ? 'flex-start' : 'flex-end' }}>
      <div style={{ maxWidth: '92%', ...bubbleStyle }}>{bubbleContent}</div>
    </div>
  );
}

function verdictColor(v: string): string {
  if (v === 'APPLY_NOW') return '#15803D';
  if (v === 'SKIP') return '#DC2626';
  return '#D97706';
}

function JobAnalysisCard({ job }: { job: JobAnalysis }) {
  const gaps = (job.gaps || []).slice(0, 3);
  return (
    <ResultCard label="Job match analysis">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <p style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>{job.company}</p>
          <p style={{ fontSize: 11, color: '#64748B', margin: '2px 0 0' }}>{job.jobTitle}</p>
        </div>
        <span style={{ fontSize: 22, fontWeight: 700, color: job.matchScore >= 70 ? '#15803D' : job.matchScore >= 50 ? '#D97706' : '#DC2626' }}>
          {job.matchScore}
        </span>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#F8FAFC', color: verdictColor(job.verdict), border: '1px solid #E2E8F0' }}>
        {job.verdict?.replace(/_/g, ' ')}
      </span>
      {gaps.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', margin: '0 0 4px' }}>Top gaps</p>
          {gaps.map((g) => (
            <p key={g} style={{ fontSize: 11, color: '#64748B', margin: '2px 0' }}>• {g}</p>
          ))}
        </div>
      )}
    </ResultCard>
  );
}

function PatternResultCard({ pattern }: { pattern: RejectionPattern }) {
  const labels: Record<string, string> = {
    PRE_INTERVIEW: 'Resume / ATS filter',
    POST_INTERVIEW: 'Interview skills gap',
    FINAL_ROUND: 'Final round drop-off',
  };
  return (
    <ResultCard label="Rejection pattern" accent="#DC2626">
      <p style={{ fontSize: 14, fontWeight: 700, color: '#B91C1C', margin: '0 0 6px' }}>
        {labels[pattern.dominantPattern] || pattern.dominantPattern?.replace(/_/g, ' ')}
      </p>
      <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, margin: '0 0 8px' }}>{pattern.insight}</p>
      {(pattern.recommendedActions || []).slice(0, 2).map((a) => (
        <p key={a} style={{ fontSize: 11, color: '#64748B', margin: '4px 0' }}>→ {a}</p>
      ))}
    </ResultCard>
  );
}

function BriefingResultCard({ briefing }: { briefing: Record<string, unknown> }) {
  const score = briefing.momentumScore as number;
  const trend = briefing.momentumTrend as string;
  const actions = (briefing.priorityActions as { action?: string }[]) || [];
  return (
    <ResultCard label="Weekly briefing">
      <p style={{ fontSize: 24, fontWeight: 700, color: '#15803D', margin: '0 0 4px' }}>
        {score}<span style={{ fontSize: 12 }}>/100</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginLeft: 8 }}>{trend}</span>
      </p>
      {actions.slice(0, 2).map((a, i) => (
        <p key={i} style={{ fontSize: 11, color: '#64748B', margin: '4px 0' }}>• {a.action || String(a)}</p>
      ))}
    </ResultCard>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      title="Copy to clipboard"
      style={{
        position: 'absolute', top: 8, right: 8,
        padding: '4px 8px', borderRadius: 8, border: '1px solid #E2E8F0',
        background: '#F8FAFC', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
        fontSize: 10, fontWeight: 600, color: copied ? '#16A34A' : '#64748B',
        fontFamily: 'Poppins, sans-serif',
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function MissionResultCard({
  result,
  onPickCoverLetter,
  pickDisabled = false,
}: {
  result: MissionStepResult;
  onPickCoverLetter?: (company: string) => void;
  pickDisabled?: boolean;
}) {
  if (!result || result.type === 'insufficient_data' || result.type === 'no_stale_apps' || result.type === 'no_jobs' || result.type === 'unknown') {
    return null;
  }

  if (result.type === 'pattern_analysis') {
    const labels: Record<string, string> = {
      PRE_INTERVIEW: 'Resume / ATS filter',
      POST_INTERVIEW: 'Interview skills gap',
      FINAL_ROUND: 'Final round drop-off',
    };
    return (
      <ResultCard label="Rejection pattern analysis" accent="#DC2626">
        <p style={{ fontSize: 13, fontWeight: 700, color: '#B91C1C', margin: '0 0 6px' }}>
          {labels[result.dominantPattern] || result.dominantPattern.replace(/_/g, ' ')}
          <span style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', marginLeft: 8 }}>
            {result.patternConfidence} confidence
          </span>
        </p>
        <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, margin: '0 0 8px' }}>{result.insight}</p>
        {result.recommendedActions?.slice(0, 3).map((a) => (
          <p key={a} style={{ fontSize: 11, color: '#64748B', margin: '3px 0' }}>→ {a}</p>
        ))}
        {result.breakdown && (
          <RejectionFunnelChart breakdown={result.breakdown as { noResponse: number; phoneScreen: number; firstInterview: number; finalRound: number }} totalApplications={result.totalApplications} />
        )}
      </ResultCard>
    );
  }

  if (result.type === 'job_rankings' && result.jobs?.length) {
    const verdictStyle = (verdict: string) => {
      if (verdict === 'APPLY_NOW') return { bg: '#F0FDF4', color: '#15803D', label: 'Apply now' };
      if (verdict === 'APPLY_WITH_EDITS') return { bg: '#FEF9C3', color: '#A16207', label: 'Apply w/ edits' };
      return { bg: '#F1F5F9', color: '#64748B', label: 'Skip' };
    };
    return (
      <ResultCard label="Job match rankings">
        {result.targetRole && (
          <p style={{ fontSize: 10, color: '#94A3B8', margin: '0 0 10px' }}>
            Targeting {result.targetRole} — sorted by MongoDB match scores
          </p>
        )}
        {result.jobs.map((job, i) => {
          const badge = verdictStyle(job.verdict);
          return (
            <div
              key={`${job.company}-${i}`}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 0', borderBottom: i < result.jobs.length - 1 ? '1px solid #F1F5F9' : 'none',
              }}
            >
              <span style={{
                fontSize: 11, fontWeight: 700, color: i === 0 ? '#15803D' : '#94A3B8',
                minWidth: 18, textAlign: 'center', marginTop: 2,
              }}>
                {i + 1}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  {job.company}
                  <span style={{
                    marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#15803D',
                    padding: '2px 6px', borderRadius: 6, background: '#F0FDF4',
                  }}>
                    {job.matchScore}/100
                  </span>
                </p>
                <p style={{ fontSize: 10, color: '#94A3B8', margin: '3px 0 0', lineHeight: 1.35 }}>
                  {job.jobTitle}
                  {job.topGap ? ` · gap: ${job.topGap}` : ''}
                </p>
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 6,
                background: badge.bg, color: badge.color, flexShrink: 0, marginTop: 2,
              }}>
                {badge.label}
              </span>
            </div>
          );
        })}
      </ResultCard>
    );
  }

  if (result.type === 'skill_gaps') {
    return (
      <ResultCard label="Skill gap analysis">
        {result.topKeywords?.slice(0, 6).map((kw) => (
          <div key={kw.keyword} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              flex: 1, height: 6, borderRadius: 3,
              background: `linear-gradient(to right, #16A34A ${Math.min(100, kw.count * 33)}%, #E8ECF3 ${Math.min(100, kw.count * 33)}%)`,
            }} />
            <span style={{ fontSize: 11, color: '#374151', minWidth: 120, fontFamily: 'Poppins, sans-serif' }}>{kw.keyword}</span>
            <span style={{ fontSize: 10, color: '#94A3B8', minWidth: 40, textAlign: 'right' }}>×{kw.count} jobs</span>
          </div>
        ))}
        {result.chartData && <SkillGapChart data={result.chartData} topKeywords={result.topKeywords} />}
      </ResultCard>
    );
  }

  if (result.type === 'weekly_briefing') {
    return (
      <ResultCard label="Weekly momentum briefing">
        <p style={{ fontSize: 24, fontWeight: 700, color: '#15803D', margin: '0 0 4px' }}>
          {result.momentumScore}<span style={{ fontSize: 12 }}>/100</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748B', marginLeft: 8 }}>{result.momentumTrend}</span>
        </p>
        {result.priorityActions?.slice(0, 3).map((a, i) => (
          <p key={i} style={{ fontSize: 11, color: '#64748B', margin: '4px 0' }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: a.impact === 'HIGH' ? '#FEE2E2' : '#F1F5F9', color: a.impact === 'HIGH' ? '#DC2626' : '#64748B', marginRight: 6 }}>
              {a.impact}
            </span>
            {a.action}
          </p>
        ))}
      </ResultCard>
    );
  }

  if (result.type === 'followup_draft') {
    return (
      <ResultCard label={`Follow-up draft — ${result.company}`} accent="#16A34A">
        <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: '0 0 6px' }}>{result.subject}</p>
        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: 11, color: '#64748B', lineHeight: 1.5, whiteSpace: 'pre-wrap', margin: 0, maxHeight: 100, overflow: 'auto', paddingRight: 60 }}>
            {result.body}
          </p>
          <CopyButton text={result.body} />
        </div>
      </ResultCard>
    );
  }

  if (result.type === 'cover_letter_pick' && result.jobs?.length) {
    return (
      <ResultCard label="Choose a role for your cover letter">
        <p style={{ fontSize: 11, color: '#64748B', margin: '0 0 10px', lineHeight: 1.45 }}>
          Select a job below — I&apos;ll draft a tailored cover letter.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {result.jobs.map((job) => (
            <button
              key={job.company}
              type="button"
              disabled={pickDisabled || !onPickCoverLetter}
              onClick={() => onPickCoverLetter?.(job.company)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                background: pickDisabled ? '#F8FAFC' : '#FFFFFF',
                cursor: pickDisabled ? 'not-allowed' : 'pointer',
                fontFamily: 'Poppins, sans-serif',
                transition: 'border-color 150ms, background 150ms',
              }}
              onMouseEnter={(e) => {
                if (!pickDisabled) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#86EFAC';
                  (e.currentTarget as HTMLButtonElement).style.background = '#F0FDF4';
                }
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0';
                (e.currentTarget as HTMLButtonElement).style.background = pickDisabled ? '#F8FAFC' : '#FFFFFF';
              }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                {job.company}
                <span style={{
                  marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#15803D',
                  padding: '2px 6px', borderRadius: 6, background: '#F0FDF4',
                }}>
                  {job.matchScore}/100
                </span>
              </p>
              <p style={{ fontSize: 10, color: '#94A3B8', margin: '4px 0 0', lineHeight: 1.35 }}>
                {job.jobTitle}
              </p>
            </button>
          ))}
        </div>
      </ResultCard>
    );
  }

  if (result.type === 'cover_letter') {
    return (
      <ResultCard label={`Cover letter — ${result.company} (${result.matchScore}/100)`} accent="#15803D">
        <div style={{ position: 'relative' }}>
          <p style={{ fontSize: 11, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0, maxHeight: 160, overflow: 'auto', paddingRight: 60 }}>
            {result.coverLetterText}
          </p>
          <CopyButton text={result.coverLetterText} />
        </div>
        {result.coverLetterStrategy && (
          <p style={{ fontSize: 10, color: '#64748B', margin: '8px 0 0', fontStyle: 'italic' }}>
            Strategy: {result.coverLetterStrategy}
          </p>
        )}
      </ResultCard>
    );
  }

  return null;
}

function ChatTextarea({ onFocus, onBlur, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div style={{ flex: 1, minHeight: 40, maxHeight: 120, display: 'flex' }}>
      <textarea
        {...rest}
        className="agent-chat-textarea"
        style={{
          flex: 1, resize: 'none', border: 'none', borderRadius: 0,
          padding: '10px 4px', overflowY: 'auto',
          fontSize: 14, fontFamily: 'Poppins, sans-serif', fontWeight: 400, lineHeight: '20px',
          background: 'transparent', color: '#0F172A', outline: 'none',
          minHeight: 40, maxHeight: 120, display: 'block', boxSizing: 'border-box',
          boxShadow: 'none',
        }}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  );
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex' }}>
      <div style={{ padding: '10px 14px', borderRadius: '4px 18px 18px 18px', background: BUBBLE_GRADIENT, border: '1px solid #E2E8F0', boxShadow: BUBBLE_SHADOW }}>
        <div className="dots-pulse"><span /><span /><span /></div>
      </div>
    </div>
  );
}

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
