import { useEffect, useRef } from 'react';
import { Database, FilePlus, Pencil, Trash2, Cpu, ChevronLeft, ChevronRight } from 'lucide-react';
import type { AgentEvent } from '@/types';

interface AgentEventsPanelProps {
  events: AgentEvent[];
  expanded?: boolean;
  onToggle?: () => void;
  isStreaming?: boolean;
  maxEvents?: number;
}

const VISIBLE_TYPES = ['agent_start', 'step_start', 'step_complete', 'tool_call', 'tool_result', 'plan_ready'] as const;

function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getOpIcon(op?: string) {
  const size = 11;
  if (op === 'FIND') return <Database size={size} color="#16A34A" />;
  if (op === 'INSERT') return <FilePlus size={size} color="#15803D" />;
  if (op === 'UPDATE') return <Pencil size={size} color="#D97706" />;
  if (op === 'DELETE') return <Trash2 size={size} color="#DC2626" />;
  if (op === 'GEMINI') return <Cpu size={size} color="#7C3AED" />;
  return <Database size={size} color="#94A3B8" />;
}

function getOpLabel(op?: string, collection?: string): string {
  const col = (collection || '').replace(/_/g, ' ');
  if (op === 'FIND') return `Read ${col}`;
  if (op === 'INSERT') return `Save to ${col}`;
  if (op === 'UPDATE') return `Update ${col}`;
  if (op === 'DELETE') return `Delete from ${col}`;
  if (op === 'GEMINI') {
    const labels: Record<string, string> = {
      'analyze_patterns': 'Gemini: Analyze rejections',
      'generate_briefing': 'Gemini: Build briefing',
      'draft_followup': 'Gemini: Draft follow-up',
      'plan_mission': 'Gemini: Plan mission',
      'generate_cover_letter': 'Gemini: Write cover letter',
    };
    return labels[collection || ''] || `Gemini: ${col}`;
  }
  return col || op || 'Operation';
}

function formatEvent(event: AgentEvent): {
  icon: React.ReactNode;
  primary: string;
  secondary?: string;
  tag: string;
  tagColor: string;
  bgColor: string;
  borderColor: string;
} {
  switch (event.type) {
    case 'agent_start':
    case 'step_start':
      return {
        icon: <span style={{ fontSize: 11 }}>▶</span>,
        primary: event.message || 'Starting…',
        tag: 'agent',
        tagColor: '#64748B',
        bgColor: '#F8FAFC',
        borderColor: '#E2E8F0',
      };
    case 'step_complete':
      return {
        icon: <span style={{ fontSize: 11 }}>✓</span>,
        primary: event.message || 'Done',
        tag: 'step done',
        tagColor: '#16A34A',
        bgColor: '#F0FDF4',
        borderColor: '#BBF7D0',
      };
    case 'plan_ready':
      return {
        icon: <Cpu size={11} color="#7C3AED" />,
        primary: event.missionTitle || event.message || 'Mission planned',
        secondary: event.steps ? `${event.steps.length} steps queued` : undefined,
        tag: 'plan ready',
        tagColor: '#7C3AED',
        bgColor: '#FAF5FF',
        borderColor: '#E9D5FF',
      };
    case 'tool_call':
      return {
        icon: getOpIcon(event.op),
        primary: getOpLabel(event.op, event.collection),
        secondary: event.detail ? event.detail.slice(0, 48) : undefined,
        tag: 'mcp tool',
        tagColor: '#15803D',
        bgColor: '#F0FDF4',
        borderColor: '#86EFAC',
      };
    case 'tool_result':
      return {
        icon: <span style={{ fontSize: 11, color: '#16A34A' }}>↳</span>,
        primary: (typeof event.result === 'string' ? event.result : null) || event.message || 'Done',
        tag: 'result',
        tagColor: '#94A3B8',
        bgColor: '#FAFAFA',
        borderColor: '#E2E8F0',
      };
    default:
      return {
        icon: <span style={{ fontSize: 11 }}>·</span>,
        primary: event.message || event.type,
        tag: event.type.replace(/_/g, ' '),
        tagColor: '#94A3B8',
        bgColor: '#F8FAFC',
        borderColor: '#E2E8F0',
      };
  }
}

function ActivityBar({ events }: { events: AgentEvent[] }) {
  const toolEvents = events.filter((e) => e.type === 'tool_call').slice(-8);
  if (toolEvents.length < 2) return null;
  const maxH = 20;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: maxH, paddingBottom: 2 }}>
      {toolEvents.map((e, i) => {
        const h = Math.max(4, Math.round((i + 1) / toolEvents.length * maxH));
        return (
          <div
            key={i}
            style={{
              width: 6, height: h, borderRadius: 2,
              background: `rgba(22,163,74,${0.3 + (i / toolEvents.length) * 0.7})`,
              transition: 'height 300ms ease',
            }}
          />
        );
      })}
    </div>
  );
}

const PANEL_STYLES = `
  @keyframes eventFadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
  .mcp-event-row { animation: eventFadeIn 200ms ease forwards; }
  .no-scrollbar::-webkit-scrollbar { width: 3px; }
  .no-scrollbar::-webkit-scrollbar-track { background: transparent; }
  .no-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 2px; }
`;

export default function AgentEventsPanel({
  events,
  expanded = true,
  onToggle,
  isStreaming = false,
  maxEvents = 10,
}: AgentEventsPanelProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const visible = events
    .filter((e) => VISIBLE_TYPES.includes(e.type as typeof VISIBLE_TYPES[number]))
    .slice(-maxEvents);

  useEffect(() => {
    if (expanded) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events.length, expanded]);

  const toolCallCount = events.filter((e) => e.type === 'tool_call').length;

  return (
    <aside
      style={{
        width: expanded ? 360 : 44,
        flexShrink: 0,
        borderLeft: '1px solid #E2E8F0',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Poppins, sans-serif',
        transition: 'width 200ms ease',
        overflow: 'hidden',
      }}
    >
      <style>{PANEL_STYLES}</style>

      {/* Header */}
      <div style={{
        padding: expanded ? '12px 14px 10px' : '12px 8px',
        borderBottom: '1px solid #E2E8F0',
        background: 'linear-gradient(to bottom, #F0FDF4, #FFFFFF 60%)',
        flexShrink: 0,
      }}>
        {expanded ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                {isStreaming && (
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#16A34A', flexShrink: 0,
                    animation: 'agentPulse 1.2s ease-in-out infinite',
                    boxShadow: '0 0 0 2px rgba(22,163,74,0.2)',
                  }} />
                )}
                <Database size={11} color="#16A34A" />
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#16A34A', margin: 0 }}>
                  MongoDB MCP Live
                </p>
                {toolCallCount > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 9,
                    background: '#F0FDF4', color: '#15803D', border: '1px solid #86EFAC',
                  }}>
                    {toolCallCount} calls
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#0F172A', margin: 0 }}>
                  {isStreaming ? 'Agent executing tools…' : 'Tool call history'}
                </p>
                <ActivityBar events={events} />
              </div>
            </div>
            {onToggle && (
              <button
                onClick={onToggle}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#94A3B8', flexShrink: 0, marginTop: 2 }}
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            {isStreaming && (
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16A34A', animation: 'agentPulse 1.2s ease-in-out infinite' }} />
            )}
            <Database size={13} color="#16A34A" />
            {onToggle && (
              <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94A3B8' }}>
                <ChevronLeft size={13} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Events Feed */}
      {expanded && (
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
          {visible.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <Database size={20} color="#E2E8F0" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 11, color: '#C8D0DE', margin: 0, fontWeight: 400 }}>
                MongoDB MCP operations will appear here as the agent works
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {visible.map((event, i) => {
                const { icon, primary, secondary, tag, tagColor, bgColor, borderColor } = formatEvent(event);
                const ts = formatTimestamp(event.ts);
                const isMcpTool = event.type === 'tool_call';
                return (
                  <div
                    key={`${event.ts}-${event.type}-${i}`}
                    className="mcp-event-row"
                    style={{
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                      animationDelay: `${i * 20}ms`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.07em', color: tagColor,
                      }}>
                        {tag}
                      </span>
                      {ts && (
                        <span style={{ fontSize: 9, color: '#CBD5E1', fontVariantNumeric: 'tabular-nums', marginLeft: 'auto' }}>
                          {ts}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: isMcpTool ? 12 : 11,
                      fontWeight: isMcpTool ? 600 : 400,
                      color: isMcpTool ? '#14532D' : '#475569',
                      margin: 0, lineHeight: 1.4,
                    }}>
                      {primary}
                    </p>
                    {secondary && (
                      <p style={{
                        fontSize: 10, color: '#64748B', margin: '3px 0 0',
                        fontFamily: isMcpTool ? 'monospace' : 'Poppins, sans-serif',
                        lineHeight: 1.3,
                      }}>
                        {secondary}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </aside>
  );
}
