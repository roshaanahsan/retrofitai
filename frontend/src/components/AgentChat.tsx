import { useState, useRef, useEffect } from 'react';
import { Send, AlertTriangle } from 'lucide-react';
import { sendChatMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ConversationEntry, CareerProfile, View } from '@/types';

interface AgentChatProps {
  messages: ConversationEntry[];
  addMessage: (role: 'user' | 'agent', text: string) => void;
  profile: Partial<CareerProfile> | null;
  setProfile: (p: Partial<CareerProfile>) => void;
  uiHints: { showPatternAlert: boolean; highlightStaleApplications: string[]; staleCount: number };
  setUiHints: (h: AgentChatProps['uiHints']) => void;
  activeView: View;
}

export default function AgentChat({ messages, addMessage, uiHints }: AgentChatProps) {
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  async function handleSend() {
    const text = input.trim();
    if (!text || isTyping) return;
    setInput('');
    addMessage('user', text);
    setIsTyping(true);
    try {
      const { data } = await sendChatMessage(text);
      addMessage('agent', data.reply);
    } catch {
      addMessage('agent', 'Sorry, I had trouble processing that. Please try again.');
    } finally {
      setIsTyping(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <aside
      className="w-[320px] shrink-0 flex flex-col z-10"
      style={{ background: '#09090B', boxShadow: '-1px 0 12px 0 rgba(0,0,0,0.22)', position: 'relative', zIndex: 1 }}
    >
      {/* Header */}
      <div
        className="h-14 flex items-center px-4 shrink-0"
        style={{ boxShadow: '0 1px 0 0 rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2">
          <svg width="20" height="11" viewBox="0 0 20 11" fill="none">
            <path d="M10 5.5C10 5.5 7.8 2.5 5.5 2.5C3.567 2.5 2 4.067 2 6C2 7.933 3.567 9.5 5.5 9.5C7.8 9.5 10 6.5 10 6.5" stroke="#00e5ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M10 5.5C10 5.5 12.2 2.5 14.5 2.5C16.433 2.5 18 4.067 18 6C18 7.933 16.433 9.5 14.5 9.5C12.2 9.5 10 6.5 10 6.5" stroke="#00e5ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[13px] font-semibold" style={{ color: '#FAFAFA' }}>Agent</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {isTyping && <div className="dots-pulse"><span /><span /><span /></div>}
        </div>
      </div>

      {/* Stale alert */}
      {uiHints.staleCount > 0 && (
        <div
          className="mx-3 mt-3 p-3 rounded-lg flex items-start gap-2.5"
          style={{
            background: 'rgba(28,20,0,0.6)',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.18)',
          }}
        >
          <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium" style={{ color: '#FBBF24' }}>
              {uiHints.staleCount} application{uiHints.staleCount > 1 ? 's' : ''} going cold
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: '#92400E' }}>
              No response after 7+ days
            </p>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-center" style={{ color: '#3F3F46' }}>
              Conversation starts here.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3" style={{ boxShadow: '0 -1px 0 0 rgba(255,255,255,0.04)' }}>
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask HireIQ anything..."
            rows={1}
            className="flex-1 resize-none rounded-md px-3 py-2 text-[13px] max-h-32 overflow-y-auto"
            style={{
              minHeight: '36px',
              background: 'rgba(39,39,42,0.60)',
              color: '#FAFAFA',
              outline: 'none',
              boxShadow: '0 1px 4px 0 rgba(0,0,0,0.18)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(99,102,241,0.50), 0 1px 4px 0 rgba(0,0,0,0.18)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 12px 0 rgba(0,0,0,0.30)';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isTyping}
            className={cn(
              'shrink-0 w-9 h-9 flex items-center justify-center rounded-md transition-colors',
              input.trim() && !isTyping
                ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                : 'cursor-not-allowed'
            )}
            style={
              !input.trim() || isTyping
                ? { background: 'rgba(39,39,42,0.60)', color: '#52525B' }
                : undefined
            }
          >
            <Send size={13} />
          </button>
        </div>
        <p className="text-[10px] mt-2 text-center" style={{ color: '#3F3F46' }}>
          Not a licensed career counselor or employment advisor
        </p>
      </div>
    </aside>
  );
}

function MessageBubble({ message }: { message: ConversationEntry }) {
  const isAgent = message.role === 'agent';
  return (
    <div className={cn('flex flex-col', isAgent ? 'items-start' : 'items-end')}>
      <div
        className={cn(
          'max-w-[88%] px-3 py-2.5 rounded-lg text-[13px] leading-relaxed',
          isAgent ? 'rounded-tl-sm' : 'rounded-tr-sm'
        )}
        style={
          isAgent
            ? { background: 'rgba(39,39,42,0.70)', color: '#A1A1AA', boxShadow: '0 1px 4px 0 rgba(0,0,0,0.14)' }
            : { background: 'rgba(30,27,75,0.80)', color: '#C7D2FE', boxShadow: '0 1px 4px 0 rgba(99,102,241,0.10)' }
        }
      >
        <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message.text}</span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start">
      <div
        className="px-3 py-3 rounded-lg rounded-tl-sm"
        style={{ background: 'rgba(39,39,42,0.70)', boxShadow: '0 1px 4px 0 rgba(0,0,0,0.14)' }}
      >
        <div className="dots-pulse">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
