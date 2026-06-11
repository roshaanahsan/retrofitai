import { useEffect, useState, useCallback, useRef } from 'react';
import {
  sessionInit,
  resetSession,
  runAutonomousPipeline,
  runMission,
  getAgentDrafts,
  getApplications as fetchApplications,
  updateProfile,
  seedDemoRejections,
} from '@/lib/api';
import type {
  CareerProfile,
  ConversationEntry,
  AgentActionType,
  AgentWorkingComplete,
  AgentEvent,
  AgentDraft,
  AgentPipelineSummary,
  ProactiveAction,
  AgentDashboard,
  ActiveMission,
} from '@/types';
import AgentChat from '@/components/AgentChat';
import AppHeader from '@/components/AppHeader';
import LandingPage from '@/components/LandingPage';
import AgentSetupPage from '@/components/AgentSetupPage';
import ResumeBuilderPage from '@/components/ResumeBuilderPage';
import JobEntryPage from '@/components/JobEntryPage';
import AgentWorkingPage from '@/components/AgentWorkingPage';
import MissionPanel from '@/components/MissionPanel';
import AgentEventsPanel from '@/components/AgentEventsPanel';

type AppPage = 'landing' | 'setup' | 'resume-builder' | 'job-entry' | 'agent-working' | 'main';

function buildPipelineSummaryMessage(summary: AgentPipelineSummary): string {
  const parts: string[] = [];
  if (summary.draftsCreated > 0) {
    parts.push(`${summary.draftsCreated} item${summary.draftsCreated !== 1 ? 's' : ''} awaiting your approval below`);
  }
  if (summary.patternUpdated && summary.dominantPattern) {
    parts.push(`rejection pattern draft: ${summary.dominantPattern.replace(/_/g, ' ').toLowerCase()}`);
  }
  if (summary.briefingGenerated && summary.momentumScore != null) {
    parts.push(`weekly briefing draft — momentum ${summary.momentumScore}/100`);
  }
  if (parts.length === 0) {
    return `Reviewed ${summary.appsScanned} application${summary.appsScanned !== 1 ? 's' : ''}. Ask me anything about your search.`;
  }
  return `I've reviewed your pipeline: ${parts.join('; ')}. Approve any drafts below when ready.`;
}

function buildProactiveFallbackFromInit(data: {
  proactiveBriefing?: string | null;
  uiHints?: { staleCount?: number };
  profile?: Partial<CareerProfile> | null;
}): string {
  if (data.proactiveBriefing?.trim()) return data.proactiveBriefing.trim();
  const stale = data.uiHints?.staleCount ?? 0;
  const parts: string[] = [];
  if (stale > 0) parts.push(`${stale} application${stale !== 1 ? 's' : ''} need follow-up`);
  if (data.profile?.targetRole) parts.push(`targeting ${data.profile.targetRole}`);
  if (parts.length === 0) {
    return "Welcome back. I'm your career agent — ask me to analyze jobs, track applications, or review patterns.";
  }
  return `Here's your pipeline status: ${parts.join('; ')}. What should we tackle first?`;
}

/** Replay onboarding work in the MCP panel — analysis runs before main screen mounts */
/** Only post mission step results that match the user's goal — avoids duplicate skill-gap cards */
function shouldPostMissionStepToChat(goal: string, stepId?: string): boolean {
  if (!stepId || stepId === 'read_profile') return false;
  const g = goal.toLowerCase();
  if (/reject|pattern|why/.test(g)) return stepId === 'find_pattern';
  if (/skill|gap/.test(g)) return stepId === 'find_gaps';
  if (/rank|best job|compare|prioritize/.test(g)) return stepId === 'rank_matches';
  if (/briefing|weekly|strategy|momentum/.test(g)) return stepId === 'generate_briefing';
  if (/cover|letter/.test(g) || (/prepare/.test(g) && /application/.test(g))) {
    return stepId === 'generate_cover_letter' || stepId === 'cover_letter_pick';
  }
  if (/follow/.test(g) || /stale/.test(g)) return stepId === 'draft_followup';
  return true;
}

function buildOnboardingRecapEvents(result: AgentWorkingComplete): AgentEvent[] {
  const base = Date.now();
  let t = base - 8000;
  const bump = (ms = 400) => { t += ms; return t; };

  const events: AgentEvent[] = [
    { type: 'agent_start', message: 'Onboarding: saving profile and scoring jobs', ts: bump(0) },
    { type: 'tool_call', op: 'UPDATE', collection: 'career_profiles', detail: 'infer-from-resume + ACTIVE_SEARCH', ts: bump() },
    { type: 'tool_result', result: 'Profile saved to MongoDB', ts: bump() },
  ];

  const succeeded = result.analysisSucceeded ?? 0;
  const failed = result.analysisFailed ?? 0;
  for (let i = 0; i < succeeded; i++) {
    events.push({
      type: 'tool_call',
      op: 'GEMINI',
      collection: 'job_analyses',
      detail: `Analyze job ${i + 1} of ${succeeded + failed}`,
      ts: bump(600),
    });
    const top = result.data?.topJob;
    const scoreNote = i === 0 && top ? `${top.company} — ${top.matchScore}/100` : 'Match score computed';
    events.push({ type: 'tool_result', result: scoreNote, ts: bump(200) });
    events.push({
      type: 'tool_call',
      op: 'UPDATE',
      collection: 'job_analyses',
      detail: 'upsert analysis',
      ts: bump(150),
    });
    events.push({ type: 'tool_result', result: 'Saved to MongoDB', ts: bump(100) });
  }

  if (failed > 0) {
    events.push({
      type: 'step_complete',
      message: `${failed} job${failed !== 1 ? 's' : ''} could not be analyzed`,
      ts: bump(),
    });
  }

  if (result.data && result.data.newApplicationsCreated > 0) {
    events.push({
      type: 'tool_call',
      op: 'INSERT',
      collection: 'applications',
      detail: `${result.data.newApplicationsCreated} pipeline application(s)`,
      ts: bump(),
    });
    events.push({
      type: 'step_complete',
      message: `${result.data.newApplicationsCreated} application(s) added to pipeline`,
      ts: bump(),
    });
  }

  if (result.data?.topJob) {
    events.push({
      type: 'step_complete',
      message: `Top match: ${result.data.topJob.company} (${result.data.topJob.matchScore}/100)`,
      ts: bump(),
    });
  }

  return events;
}

export default function App() {
  const [profile, setProfile] = useState<Partial<CareerProfile> | null>(null);
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [proactiveActions, setProactiveActions] = useState<ProactiveAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [appPage, setAppPage] = useState<AppPage>('landing');
  const [setupResumeFile, setSetupResumeFile] = useState<File | null>(null);
  const [setupResumeText, setSetupResumeText] = useState('');
  const [userBio, setUserBio] = useState('');
  const [pendingJobs, setPendingJobs] = useState<string[]>([]);
  const [profileEditActive, setProfileEditActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'working' | 'done'>('idle');
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const [agentDrafts, setAgentDrafts] = useState<AgentDraft[]>([]);
  const [dashboard, setDashboard] = useState<AgentDashboard | null>(null);
  const [activeMission, setActiveMission] = useState<ActiveMission | null>(null);
  const [eventsExpanded, setEventsExpanded] = useState(true);
  const initRan = useRef(false);
  const missionGoalRef = useRef('');

  const resetLocalState = useCallback(() => {
    setProfile(null);
    setMessages([]);
    setProactiveActions([]);
    setDashboard(null);
    setAgentDrafts([]);
    setAgentEvents([]);
    setActiveMission(null);
    setAgentStatus('idle');
    setUserBio('');
    setPendingJobs([]);
    setSetupResumeFile(null);
    setSetupResumeText('');
    setProfileEditActive(false);
  }, []);

  const handleFreshStart = useCallback(async () => {
    try {
      await resetSession();
    } catch {
      /* non-fatal — still proceed with local reset */
    }
    resetLocalState();
  }, [resetLocalState]);

  const refreshDashboard = useCallback(async () => {
    try {
      const { data } = await sessionInit();
      if (data.dashboard) setDashboard(data.dashboard);
      if (data.profile) setProfile(data.profile);
      if (data.proactiveActions) setProactiveActions(data.proactiveActions);
      const { data: draftsRes } = await getAgentDrafts();
      if (draftsRes?.data) setAgentDrafts(draftsRes.data);
    } catch { /* non-fatal */ }
  }, []);

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

  const handleLaunchMission = useCallback((goal: string) => {
    missionGoalRef.current = goal;
    setActiveMission({ goal, missionTitle: 'Planning…', steps: [], currentStepIndex: 0, status: 'planning', results: {} });
    setAgentStatus('working');
    setAgentEvents([]);

    runMission(goal, (event: AgentEvent) => {
      // Feed all events to the MCP panel
      setAgentEvents((prev) => [...prev, event]);

      if (event.type === 'plan_ready') {
        setActiveMission((prev) => prev ? {
          ...prev,
          missionTitle: event.missionTitle || goal,
          steps: (event.steps || []).map((s) => ({ ...s, status: 'pending' as const })),
          status: 'running',
        } : prev);
      }

      if (event.type === 'step_start') {
        setActiveMission((prev) => prev ? {
          ...prev,
          currentStepIndex: event.stepIndex ?? prev.currentStepIndex,
          steps: prev.steps.map((s, i) =>
            i === event.stepIndex ? { ...s, status: 'running' as const } : s
          ),
        } : prev);
      }

      if (event.type === 'step_complete') {
        setActiveMission((prev) => {
          if (!prev) return prev;
          const updated = { ...prev };
          updated.steps = prev.steps.map((s, i) =>
            i === event.stepIndex ? { ...s, status: 'done' as const } : s
          );
          updated.currentStepIndex = (event.stepIndex ?? prev.currentStepIndex) + 1;
          return updated;
        });
        if (event.message && shouldPostMissionStepToChat(missionGoalRef.current, event.stepId)) {
          addMessage('agent', event.message, 'MISSION_DEBRIEF', event as unknown as Record<string, unknown>);
        }
      }

      if (event.type === 'mission_complete') {
        setActiveMission((prev) => prev ? {
          ...prev,
          status: 'complete',
          steps: prev.steps.map((s) => ({ ...s, status: s.status === 'running' ? 'done' as const : s.status })),
        } : prev);
        setAgentStatus('idle');
        refreshDashboard();
        getAgentDrafts().then(({ data: d }) => { if (d?.data) setAgentDrafts(d.data); }).catch(() => {});
      }

      if (event.type === 'mission_error') {
        setActiveMission((prev) => prev ? { ...prev, status: 'error' } : prev);
        setAgentStatus('idle');
      }
    }).catch(() => {
      setActiveMission((prev) => prev ? { ...prev, status: 'error' } : prev);
      setAgentStatus('idle');
    });
  }, [refreshDashboard, addMessage]);

  const runAutonomousAgent = useCallback((
    onComplete?: (summary: AgentPipelineSummary) => void,
    options?: { appendEvents?: boolean },
  ) => {
    setAgentStatus('working');
    if (!options?.appendEvents) setAgentEvents([]);
    runAutonomousPipeline((event: AgentEvent) => {
      setAgentEvents((prev) => [...prev, event]);
      if (event.type === 'pipeline_complete' && event.summary) {
        setAgentStatus('idle');
        onComplete?.(event.summary);
        refreshDashboard();
        getAgentDrafts().then(({ data: draftsRes }) => {
          if (draftsRes?.data) setAgentDrafts(draftsRes.data);
        }).catch(() => {});
      } else if (event.type === 'pipeline_skip' || event.type === 'pipeline_error') {
        setAgentStatus('idle');
        getAgentDrafts().then(({ data: draftsRes }) => {
          if (draftsRes?.data) setAgentDrafts(draftsRes.data);
        }).catch(() => {});
      }
    }).catch(() => setAgentStatus('idle'));
  }, [refreshDashboard]);

  const handleLoadDemo = useCallback(async () => {
    try {
      await updateProfile({
        resumeText: "Hi, I'm Alex Chen. Senior Software Engineer, 7 years building distributed backend systems. Skills: Go, Python, Kubernetes, PostgreSQL, Redis, gRPC, Distributed Systems. Targeting Staff Engineer at fintech companies.",
        currentRole: 'Senior Software Engineer',
        targetRole: 'Staff Engineer',
        targetIndustry: 'Fintech',
        yearsExperience: 7,
        skills: ['Go', 'Python', 'Kubernetes', 'PostgreSQL', 'Redis', 'gRPC', 'Distributed Systems'],
        agentMode: 'ACTIVE_SEARCH',
      });
      await seedDemoRejections();
      addMessage('agent', 'Demo loaded: Alex Chen profile + 3 rejections (Stripe, Shopify, Google). Watch the MongoDB MCP panel on the right — the agent is analyzing your pipeline now.');
      await refreshDashboard();
      runAutonomousAgent();
    } catch {
      addMessage('agent', 'Failed to load demo data. Please try again.');
    }
  }, [refreshDashboard, addMessage, runAutonomousAgent]);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    async function init() {
      try {
        const params = new URLSearchParams(window.location.search);
        const forceLanding = params.get('landing') === 'true';
        if (forceLanding) {
          window.history.replaceState({}, '', window.location.pathname);
          await handleFreshStart();
          setAppPage('landing');
          setLoading(false);
          return;
        }

        const { data } = await sessionInit();
        setProfile(data.profile);
        setProactiveActions(data.proactiveActions || []);
        if (data.dashboard) setDashboard(data.dashboard);

        if (data.agentMode !== 'NEW_USER') {
          setAppPage('main');
          addMessage(
            'agent',
            buildProactiveFallbackFromInit({
              proactiveBriefing: data.proactiveBriefing,
              uiHints: data.uiHints,
              profile: data.profile,
            }),
            'PROACTIVE_BRIEFING',
            null,
          );
          getAgentDrafts().then(({ data: draftsRes }) => {
            if (draftsRes?.data) setAgentDrafts(draftsRes.data);
          }).catch(() => {});
        }

        // Drafts load via getAgentDrafts above — do NOT re-run autonomous pipeline on every refresh
      } catch (err) {
        console.error('Session init failed:', err);
        setAppPage('landing');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [addMessage, runAutonomousAgent, handleFreshStart]);

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
        onGetStarted={async () => {
          await handleFreshStart();
          setAppPage('setup');
        }}
      />
    );
  }

  if (appPage === 'setup') {
    return (
      <AgentSetupPage
        prefillFile={setupResumeFile}
        prefillResumeText={setupResumeText}
        onBuildResume={() => setAppPage('resume-builder')}
        onNext={(bio) => {
          const text = bio.trim();
          if (!text) return;
          setUserBio(text);
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
        onComplete={(_batchId, result: AgentWorkingComplete) => {
          setMessages([]);

          let agentMsg: string;
          if (result.profileError) {
            agentMsg = result.profileError;
          } else if (result.data && result.data.newApplicationsCreated > 0) {
            const { data } = result;
            agentMsg = `I've scored all ${data.totalJobs} position${data.totalJobs !== 1 ? 's' : ''} against your profile. Top match: ${data.topJob.company} (${data.topJob.matchScore}/100). ${data.newApplicationsCreated} application${data.newApplicationsCreated !== 1 ? 's' : ''} added to your pipeline. Ask me about any role or what to do next.`;
            if (result.analysisFailed > 0) {
              const total = result.analysisSucceeded + result.analysisFailed;
              agentMsg += ` Warning: ${result.analysisFailed} of ${total} job${total !== 1 ? 's' : ''} could not be analyzed.`;
            }
          } else if (result.data && result.data.totalJobs > 0) {
            const { data } = result;
            agentMsg = `Scored ${data.totalJobs} job${data.totalJobs !== 1 ? 's' : ''}. Top match: ${data.topJob.company} (${data.topJob.matchScore}/100).`;
            if (result.finalizeError) agentMsg += ` ${result.finalizeError}`;
          } else if (result.finalizeError) {
            agentMsg = result.finalizeError;
          } else if (result.analysisSucceeded > 0) {
            agentMsg = `Scored ${result.analysisSucceeded} job${result.analysisSucceeded !== 1 ? 's' : ''} against your profile. Ask me about any role or what to do next.`;
          } else {
            agentMsg =
              'Analysis could not be completed. Please go back, check your profile and job descriptions, then try again.';
          }

          Promise.all([
            fetchApplications().catch(() => null),
            sessionInit().catch(() => null),
          ]).then(([, initResult]) => {
            if (initResult?.data) {
              setProfile(initResult.data.profile);
              setProactiveActions(initResult.data.proactiveActions || []);
              if (initResult.data.dashboard) setDashboard(initResult.data.dashboard);
            }
            addMessage('agent', agentMsg);
            if (initResult?.data) {
              addMessage(
                'agent',
                buildProactiveFallbackFromInit({
                  proactiveBriefing: initResult.data.proactiveBriefing,
                  uiHints: initResult.data.uiHints,
                  profile: initResult.data.profile,
                }),
                'PROACTIVE_BRIEFING',
                null,
              );
            }
            setAgentEvents(buildOnboardingRecapEvents(result));
            setAppPage('main');
            runAutonomousAgent((summary) => {
              if (summary.draftsCreated > 0) {
                addMessage('agent', buildPipelineSummaryMessage(summary));
              }
            }, { appendEvents: true });
          });
        }}
      />
    );
  }

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: '#F8FAFC', fontFamily: 'Poppins, sans-serif' }}
    >
      <style>{`@keyframes agentPulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      <AppHeader agentStatus={agentStatus} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Left: Mission Control Panel */}
        <MissionPanel
          dashboard={dashboard}
          activeMission={activeMission}
          onLaunchMission={handleLaunchMission}
          onDismissMission={() => setActiveMission(null)}
          onRefreshDashboard={refreshDashboard}
          disabled={agentStatus === 'working'}
          onLoadDemo={handleLoadDemo}
          demoLoading={agentStatus === 'working' && !activeMission}
        />

        {/* Center: Agent Chat */}
        <AgentChat
          layout="page"
          messages={messages}
          addMessage={addMessage}
          clearMessages={clearMessages}
          profile={profile}
          setProfile={setProfile}
          proactiveActions={proactiveActions}
          agentDrafts={agentDrafts}
          setAgentDrafts={setAgentDrafts}
          profileEditActive={profileEditActive}
          setProfileEditActive={setProfileEditActive}
          agentStatus={agentStatus}
          agentEvents={agentEvents}
          dashboard={dashboard}
          onRefreshDashboard={refreshDashboard}
          onRunAutonomous={() => runAutonomousAgent()}
          onChatMcpActivity={(events) => {
            setAgentEvents((prev) => [...prev, ...events]);
            setEventsExpanded(true);
          }}
          activeMission={activeMission}
        />

        {/* Right: MongoDB MCP Live Panel */}
        <AgentEventsPanel
          events={agentEvents}
          expanded={eventsExpanded}
          onToggle={() => setEventsExpanded((v) => !v)}
          isStreaming={agentStatus === 'working'}
          maxEvents={10}
        />
      </div>
    </div>
  );
}
