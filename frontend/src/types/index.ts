export interface CareerProfile {
  _id: string;
  currentRole: string;
  targetRole: string;
  targetIndustry: string;
  yearsExperience: number;
  skills: string[];
  salaryMin: number;
  salaryMax: number;
  location: string;
  urgency: 'immediate' | 'moderate' | 'exploring';
  agentMode: 'NEW_USER' | 'PROFILE_COMPLETE' | 'ACTIVE_SEARCH' | 'RETURNING_USER';
  conversationHistory: ConversationEntry[];
}

export type AgentActionType =
  | 'JOB_ANALYSIS_RESULT'
  | 'ADD_TO_PIPELINE_CONFIRM'
  | 'FOLLOW_UP_EMAIL'
  | 'WEEKLY_BRIEFING_RESULT'
  | 'PROACTIVE_BRIEFING'
  | 'ONBOARDING_COMPLETE'
  | 'MISSION_DEBRIEF'
  | 'PROFILE_EDIT_TRIGGER'
  | 'PROFILE_EDIT_REQUEST'
  | 'EDIT_PROFILE_SUGGEST'
  | 'RECOMPARE_PROMPT'
  | 'PATTERN_ANALYSIS_RESULT';

export interface FinalizeResult {
  rankedJobs: {
    _id: string;
    jobTitle: string;
    company: string;
    matchScore: number;
    verdict: string;
    strongMatches: string[];
    gaps: string[];
  }[];
  topJob: { _id: string; jobTitle: string; company: string; matchScore: number };
  criticalGap: string | null;
  criticalGapCount: number;
  totalJobs: number;
  newApplicationsCreated: number;
  coverLetterReady: boolean;
  coverLetterJobId: string;
}

export interface AgentWorkingComplete {
  data: FinalizeResult | null;
  profileError?: string;
  finalizeError?: string;
  analysisSucceeded: number;
  analysisFailed: number;
}

export interface ProactiveAction {
  id: string;
  label: string;
  intent: 'FOLLOW_UP' | 'PATTERN_ANALYSIS' | 'WEEKLY_REPORT';
  company?: string;
}

export interface ConversationEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
  actionType?: AgentActionType | null;
  actionData?: Record<string, unknown> | null;
}

export interface JobAnalysis {
  _id: string;
  userId: string;
  analyzedAt: string;
  jobTitle: string;
  company: string;
  jobDescriptionRaw: string;
  matchScore: number;
  strongMatches: string[];
  gaps: string[];
  missingKeywords: string[];
  postingAge: number | null;
  verdict: 'APPLY_NOW' | 'APPLY_WITH_EDITS' | 'SKIP';
  coverLetterGenerated: boolean;
  coverLetterText: string;
  coverLetterStrategy: string;
}

export interface Application {
  _id: string;
  userId: string;
  jobAnalysisId: string | null;
  company: string;
  role: string;
  appliedDate: string;
  status: 'APPLIED' | 'NO_RESPONSE' | 'PHONE_SCREEN' | 'INTERVIEW' | 'OFFER' | 'REJECTED';
  statusHistory: { status: string; date: string }[];
  rejectionStage: 'NO_RESPONSE' | 'PHONE_SCREEN' | 'FIRST_INTERVIEW' | 'FINAL_ROUND' | null;
  followUpSent: boolean;
  followUpDate: string | null;
  daysSinceApply: number;
  notes: string;
}

export interface RejectionPattern {
  _id: string;
  userId: string;
  lastCalculated: string;
  totalApplications: number;
  totalRejections: number;
  rejectionBreakdown: {
    noResponse: number;
    phoneScreen: number;
    firstInterview: number;
    finalRound: number;
  };
  dominantPattern: 'PRE_INTERVIEW' | 'POST_INTERVIEW' | 'FINAL_ROUND' | 'INSUFFICIENT_DATA';
  patternConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  insight: string;
  recommendedActions: string[];
  missingKeywordsAcrossRejections: string[];
}

export interface WeeklyBriefing {
  _id: string;
  userId: string;
  weekNumber: number;
  generatedAt: string;
  applicationsSentThisWeek: number;
  responseRate: number;
  interviewRate: number;
  industryAvgResponseRate: number;
  momentumScore: number;
  momentumTrend: 'UP' | 'DOWN' | 'STABLE';
  bestPerformingCategory: string;
  worstPerformingCategory: string;
  priorityActions: { action: string; impact: 'HIGH' | 'MEDIUM' | 'LOW'; dueDate: string | null }[];
  pdfGenerated: boolean;
  pdfPath: string | null;
}

export interface DashboardStats {
  totalApplications: number;
  rejections: number;
  interviews: number;
  staleCount: number;
  jobsAnalyzed: number;
  responseRate: number;
}

export interface DashboardPattern {
  dominantPattern: string | null;
  patternConfidence: string | null;
  insight: string | null;
  recommendedActions: string[];
  totalRejections?: number;
  readyForAnalysis?: boolean;
}

export interface DashboardApplication {
  _id: string;
  company: string;
  role: string;
  status: string;
  daysSinceApply: number;
  rejectionStage: string | null;
}

export interface DashboardTopJob {
  _id: string;
  company: string;
  jobTitle: string;
  matchScore: number;
  verdict: string;
}

export interface AgentDashboard {
  stats: DashboardStats;
  pattern: DashboardPattern | null;
  briefing: { weekNumber: number; momentumScore: number; momentumTrend: string } | null;
  applications: DashboardApplication[];
  topJobs: DashboardTopJob[];
  profileSummary: {
    name: string;
    currentRole: string;
    targetRole: string;
    yearsExperience: number;
    skills: string[];
  };
}

export interface SessionInitResponse {
  userId: string;
  agentMode: CareerProfile['agentMode'];
  profile: Partial<CareerProfile>;
  proactiveBriefing: string | null;
  proactiveActions: ProactiveAction[];
  uiHints: {
    showPatternAlert: boolean;
    highlightStaleApplications: string[];
    staleCount: number;
  };
  dashboard?: AgentDashboard;
}

// ─── Autonomous Agent Types ───────────────────────────────────────────────────

export interface AgentPipelineSummary {
  appsScanned: number;
  staleFound: number;
  draftsCreated: number;
  patternUpdated: boolean;
  patternConfidence: string | null;
  dominantPattern: string | null;
  briefingGenerated: boolean;
  momentumScore: number | null;
  momentumTrend: string | null;
}

export interface AgentEvent {
  type:
    | 'agent_start'
    | 'tool_call'
    | 'tool_result'
    | 'step_start'
    | 'step_complete'
    | 'pipeline_complete'
    | 'pipeline_skip'
    | 'pipeline_error'
    | 'plan_ready'
    | 'mission_complete'
    | 'mission_error';
  ts: number;
  message?: string;
  op?: string;
  collection?: string;
  detail?: string;
  company?: string;
  result?: string | MissionStepResult;
  summary?: AgentPipelineSummary;
  // mission fields
  missionTitle?: string;
  steps?: MissionStep[];
  stepIndex?: number;
  stepId?: string;
  stepCount?: number;
  stepResult?: MissionStepResult;
}

export interface MissionStep {
  id: string;
  title: string;
  description?: string;
  status?: 'pending' | 'running' | 'done' | 'error';
}

export type MissionStepResult =
  | { type: 'profile_summary'; targetRole: string; skillCount: number; skills: string[] }
  | { type: 'pattern_analysis'; dominantPattern: string; patternConfidence: string; insight: string; recommendedActions: string[]; breakdown: Record<string, number>; totalRejections: number; totalApplications: number }
  | { type: 'skill_gaps'; topKeywords: { keyword: string; count: number }[]; chartData: SkillGapChartData | null }
  | { type: 'weekly_briefing'; momentumScore: number; momentumTrend: string; priorityActions: { action: string; impact: string }[]; bestPerformingCategory: string }
  | { type: 'followup_draft'; draftId: string; company: string; subject: string; body: string }
  | { type: 'cover_letter'; company: string; jobTitle: string; matchScore: number; coverLetterText: string; coverLetterStrategy: string }
  | { type: 'cover_letter_pick'; jobs: { company: string; jobTitle: string; matchScore: number; verdict?: string }[] }
  | { type: 'job_rankings'; jobs: { company: string; jobTitle: string; matchScore: number; verdict: string; topGap: string | null }[]; targetRole?: string }
  | { type: 'insufficient_data' }
  | { type: 'no_stale_apps' }
  | { type: 'no_jobs' }
  | { type: 'unknown' }
  | { type: 'error'; error: string };

export interface SkillGapChartData {
  profileSkills: string[];
  strongMatches: string[];
  gaps: string[];
  company: string;
  jobTitle: string;
  matchScore: number;
}

export interface ActiveMission {
  goal: string;
  missionTitle: string;
  steps: MissionStep[];
  currentStepIndex: number;
  status: 'planning' | 'running' | 'complete' | 'error';
  results: Record<number, MissionStepResult>;
}

export interface AgentDraft {
  _id: string;
  userId: string;
  type?: 'followup' | 'pattern' | 'briefing';
  applicationId: string | null;
  company: string;
  role: string;
  subject: string;
  body: string;
  payload?: Record<string, unknown> | null;
  status: 'pending' | 'sent' | 'dismissed';
  createdAt: string;
  runId: string | null;
}
