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

export interface ConversationEntry {
  role: 'user' | 'agent';
  text: string;
  timestamp: string;
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

export interface SessionInitResponse {
  userId: string;
  agentMode: CareerProfile['agentMode'];
  profile: Partial<CareerProfile>;
  proactiveBriefing: string | null;
  uiHints: {
    showPatternAlert: boolean;
    highlightStaleApplications: string[];
    staleCount: number;
  };
}

export type View = 'dashboard' | 'analyze' | 'pipeline' | 'insights' | 'briefing';
