import { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { sessionInit, resetSession, getLatestBriefing, runAutonomousPipeline, getAgentDrafts, getInsights, getApplications as fetchApplications } from '@/lib/api';
import type { View, CareerProfile, Application, RejectionPattern, WeeklyBriefing, ConversationEntry, AgentActionType, FinalizeResult, AgentEvent, AgentDraft, AgentPipelineSummary } from '@/types';
import Sidebar from '@/components/Sidebar';
import AgentChat from '@/components/AgentChat';
import DashboardView from '@/views/DashboardView';
import AnalyzeView from '@/views/AnalyzeView';
import PipelineView from '@/views/PipelineView';
import InsightsView from '@/views/InsightsView';
import BriefingView from '@/views/BriefingView';
import LandingPage from '@/components/LandingPage';
import AgentSetupPage from '@/components/AgentSetupPage';
import ResumeBuilderPage from '@/components/ResumeBuilderPage';
import JobEntryPage from '@/components/JobEntryPage';
import AgentWorkingPage from '@/components/AgentWorkingPage';


type AppPage = 'landing' | 'setup' | 'resume-builder' | 'job-entry' | 'agent-working' | 'main';

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
  const [appPage, setAppPage] = useState<AppPage>('landing');
  const [setupResumeFile, setSetupResumeFile] = useState<File | null>(null);
  const [setupResumeText, setSetupResumeText] = useState('');
  const [userBio, setUserBio] = useState('');
  const [pendingJobs, setPendingJobs] = useState<string[]>([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [profileEditActive, setProfileEditActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'working' | 'done'>('idle');
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [agentDrafts, setAgentDrafts] = useState<AgentDraft[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState<AgentPipelineSummary | null>(null);
  const initRan = useRef(false);

  const addMessage = useCallback((
    role: 'user' | 'agent',
    text: string,
    actionType?: AgentActionType | null,
    actionData?: Record<string, unknown> | null,
  ) => {
    setMessages((prev) => [
      ...prev,
      { role, text, timestamp: new Date().toISOString(), actionType, actionData },
    ]);
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  const handleEditProfile = useCallback(() => {
    setChatOpen(true);
    addMessage('user', 'I want to Edit My Profile', 'PROFILE_EDIT_TRIGGER', null);
    addMessage(
      'agent',
      'Got it — paste your new About Me below, or use the upload button to drop your resume (PDF or DOCX). Type "cancel" to keep your current profile.',
      'PROFILE_EDIT_REQUEST',
      null,
    );
    setProfileEditActive(true);
  }, [addMessage]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    async function init() {
      try {
        const params = new URLSearchParams(window.location.search);
        const forceLanding = params.get('landing') === 'true';
        if (forceLanding) {
          window.history.replaceState({}, '', window.location.pathname);
          try { await resetSession(); } catch { /* non-fatal */ }
          setAppPage('landing');
          setLoading(false);
          return;
        }

        const { data } = await sessionInit();
        console.log('[App] session-init response:', { userId: data.userId, agentMode: data.agentMode, currentRole: data.profile?.currentRole });
        setProfile(data.profile);
        setUiHints(data.uiHints || { showPatternAlert: false, highlightStaleApplications: [], staleCount: 0 });

        if (data.agentMode !== 'NEW_USER') {
          // Returning user — go straight to dashboard with a clean slate
          setAppPage('main');
          addMessage('agent', 'Hi! Ask me anything — I\'ll help.');
        }
        // NEW_USER stays on 'landing' (the default)

        try {
          const { data: bData } = await getLatestBriefing();
          if (bData.available && bData.briefing) setBriefing(bData.briefing);
        } catch {
          // no briefing yet — leave null
        }

        // Fire autonomous agent pipeline for active users (non-blocking)
        if (['ACTIVE_SEARCH', 'RETURNING_USER', 'PATTERN_DETECTED'].includes(data.agentMode)) {
          setAgentStatus('working');
          runAutonomousPipeline((event: AgentEvent) => {
            setAgentEvents((prev) => [...prev, event]);
            if (event.type === 'pipeline_complete' && event.summary) {
              setAgentStatus('done');
              setPipelineSummary(event.summary);
              // Refresh downstream data now that agent has written to MongoDB
              fetchApplications().then(({ data: appsData }) => setApplications(appsData)).catch(() => {});
              getInsights().then(({ data: insData }) => { if (insData?.available && insData.pattern) setPattern(insData.pattern); }).catch(() => {});
              getLatestBriefing().then(({ data: bfData }) => { if (bfData?.available && bfData.briefing) setBriefing(bfData.briefing); }).catch(() => {});
              getAgentDrafts().then(({ data: draftsData }) => { if (draftsData?.data) setAgentDrafts(draftsData.data); }).catch(() => {});
            } else if (event.type === 'pipeline_skip' || event.type === 'pipeline_error') {
              setAgentStatus('idle');
            }
          }).catch(() => setAgentStatus('idle'));
        }
      } catch (err) {
        console.error('Session init failed:', err);
        setAppPage('landing');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [addMessage]);



  if (loading) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ background: '#F8FAFC', position: 'fixed', inset: 0, zIndex: 50 }}
      >
        <div className="dots-pulse">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  if (appPage === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => setAppPage('setup')}
      />
    );
  }

  if (appPage === 'setup') {
    return (
      <AgentSetupPage
        prefillFile={setupResumeFile}
        prefillResumeText={setupResumeText}
        onBuildResume={() => setAppPage('resume-builder')}
        onNext={(bio, resumeFile) => {
          setUserBio(bio || (resumeFile ? `Resume: ${resumeFile.name}` : ''));
          setAppPage('job-entry');
        }}
      />
    );
  }

  if (appPage === 'resume-builder') {
    return (
      <ResumeBuilderPage
        onBack={(file, resumeText) => {
          if (file) setSetupResumeFile(file);
          if (resumeText) setSetupResumeText(resumeText);
          setAppPage('setup');
        }}
      />
    );
  }

  if (appPage === 'job-entry') {
    return (
      <JobEntryPage
        onStart={(jobs) => {
          setPendingJobs(jobs);
          setAppPage('agent-working');
        }}
      />
    );
  }

  if (appPage === 'agent-working') {
    return (
      <AgentWorkingPage
        jobs={pendingJobs}
        bio={userBio}
        onComplete={(batchId, data) => {
          // Wipe stale state immediately
          setApplications([]);
          setPattern(null);
          setBriefing(null);
          setMessages([]);

          const agentMsg = data
            ? `I've scored all ${data.totalJobs} position${data.totalJobs !== 1 ? 's' : ''} against your profile. Check the Pipeline tab to see your matches — top jobs are already ranked and ready to apply.`
            : 'Analysis complete. Your jobs have been analyzed and added to your pipeline. Explore your results using the sidebar.';

          // Fetch fresh profile + applications in parallel, THEN switch to main so
          // the dashboard renders with data already loaded (no "Tell the agent" flash).
          Promise.all([
            fetchApplications().catch(() => ({ data: [] as Application[] })),
            sessionInit().catch(() => null),
          ]).then(([appsResult, initResult]) => {
            if (appsResult?.data) setApplications(appsResult.data);
            if (initResult?.data) {
              setProfile(initResult.data.profile);
              setUiHints(initResult.data.uiHints || { showPatternAlert: false, highlightStaleApplications: [], staleCount: 0 });
            }
            addMessage('agent', agentMsg);
            setAppPage('main');
          });
        }}
      />
    );
  }

  const momentumScore = briefing?.momentumScore ?? null;

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: '#F8FAFC', position: 'relative' }}>
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        momentumScore={momentumScore}
      />

      <main className="flex-1 overflow-y-auto min-w-0 no-scrollbar" style={{ background: '#F8FAFC', paddingRight: chatOpen ? 0 : 52 }}>
        {activeView === 'dashboard' && (
          <DashboardView
            profile={profile}
            applications={applications}
            setApplications={setApplications}
            pattern={pattern}
            briefing={briefing}
            uiHints={uiHints}
            onNavigate={setActiveView}
            onEditProfile={handleEditProfile}
          />
        )}
        {/* Always mounted — CSS hide preserves analysis state across tab switches */}
        <div style={{ display: activeView === 'analyze' ? 'block' : 'none' }}>
          <AnalyzeView
            applications={applications}
            setApplications={setApplications}
            addMessage={addMessage}
            openChat={() => setChatOpen(true)}
          />
        </div>
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

      {/* Toggle button + label */}
      <div
        style={{
          position: 'absolute',
          right: chatOpen ? 306 : 8,
          top: 14,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transition: 'right 200ms ease-in-out',
        }}
      >
        {!chatOpen && (
          <span style={{
            fontSize: 12,
            fontWeight: 500,
            color: '#16A34A',
            fontFamily: 'Poppins, sans-serif',
            whiteSpace: 'nowrap',
          }}>
            View Agent
          </span>
        )}
        <button
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? 'Hide agent' : 'Show agent'}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: '#16A34A',
            border: 'none',
            outline: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#FFFFFF',
            minHeight: 'unset',
            flexShrink: 0,
            transition: 'background 120ms',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#15803D'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#16A34A'; }}
        >
          {chatOpen ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
        </button>
      </div>

      <AgentChat
        messages={messages}
        addMessage={addMessage}
        clearMessages={clearMessages}
        profile={profile}
        setProfile={setProfile}
        uiHints={uiHints}
        setUiHints={setUiHints}
        activeView={activeView}
        isOpen={chatOpen}
        onNavigate={setActiveView}
        agentStatus={agentStatus}
        agentEvents={agentEvents}
        pipelineSummary={pipelineSummary}
        profileEditActive={profileEditActive}
        setProfileEditActive={setProfileEditActive}
      />
    </div>
  );
}
