import { useEffect, useState, useCallback, useRef } from 'react';
import { sessionInit } from '@/lib/api';
import type { View, CareerProfile, Application, RejectionPattern, WeeklyBriefing, ConversationEntry } from '@/types';
import Sidebar from '@/components/Sidebar';
import AgentChat from '@/components/AgentChat';
import DashboardView from '@/views/DashboardView';
import AnalyzeView from '@/views/AnalyzeView';
import PipelineView from '@/views/PipelineView';
import InsightsView from '@/views/InsightsView';
import BriefingView from '@/views/BriefingView';

export default function App() {
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [profile, setProfile] = useState<Partial<CareerProfile> | null>(null);
  const [applications, setApplications] = useState<Application[]>([] as Application[]);
  const [pattern, setPattern] = useState<RejectionPattern | null>(null);
  const [briefing, setBriefing] = useState<WeeklyBriefing | null>(null);
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [uiHints, setUiHints] = useState<{ showPatternAlert: boolean; highlightStaleApplications: string[]; staleCount: number }>({
    showPatternAlert: false,
    highlightStaleApplications: [],
    staleCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const initRan = useRef(false);

  const addMessage = useCallback((role: 'user' | 'agent', text: string) => {
    setMessages((prev) => [...prev, { role, text, timestamp: new Date().toISOString() }]);
  }, []);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    async function init() {
      try {
        const { data } = await sessionInit();
        setProfile(data.profile);
        setUiHints(data.uiHints || { showPatternAlert: false, highlightStaleApplications: [], staleCount: 0 });

        const history = data.profile?.conversationHistory ?? [];
        if (history.length > 0) {
          setMessages(history.slice(-30));
        } else if (data.agentMode === 'NEW_USER') {
          addMessage('agent', "Welcome to HireIQ. I'm your career strategy agent. Let's start by building your profile. What's your current role and how many years of experience do you have?");
        }

        if (data.proactiveBriefing) {
          addMessage('agent', data.proactiveBriefing);
        }
      } catch (err) {
        console.error('Session init failed:', err);
        addMessage('agent', "Welcome to HireIQ. I'm your career strategy agent. What's your current role and how many years of experience do you have?");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [addMessage]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#09090B' }}>
        <div className="dots-pulse">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  const momentumScore = briefing?.momentumScore ?? null;

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'transparent', position: 'relative', zIndex: 1 }}>
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        momentumScore={momentumScore}
        briefing={briefing}
      />

      <main className="flex-1 overflow-y-auto min-w-0" style={{ position: 'relative', zIndex: 1 }}>
        {activeView === 'dashboard' && (
          <DashboardView
            profile={profile}
            applications={applications}
            setApplications={setApplications}
            pattern={pattern}
            briefing={briefing}
            uiHints={uiHints}
            onNavigate={setActiveView}
          />
        )}
        {activeView === 'analyze' && (
          <AnalyzeView
            applications={applications}
            setApplications={setApplications}
            addMessage={addMessage}
          />
        )}
        {activeView === 'pipeline' && (
          <PipelineView
            applications={applications}
            setApplications={setApplications}
            addMessage={addMessage}
          />
        )}
        {activeView === 'insights' && (
          <InsightsView
            pattern={pattern}
            setPattern={setPattern}
            applications={applications}
            addMessage={addMessage}
          />
        )}
        {activeView === 'briefing' && (
          <BriefingView
            briefing={briefing}
            setBriefing={setBriefing}
            addMessage={addMessage}
          />
        )}
      </main>

      <AgentChat
        messages={messages}
        addMessage={addMessage}
        profile={profile}
        setProfile={setProfile}
        uiHints={uiHints}
        setUiHints={setUiHints}
        activeView={activeView}
      />
    </div>
  );
}
