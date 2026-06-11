import axios from 'axios';
import type { AgentEvent } from '@/types';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

const API_BASE = '/api';

export const sessionInit = () => api.get('/agent/session-init');
export const resetSession = () => api.post('/agent/new-session');
export const sendChatMessage = (message: string) => api.post('/agent/chat', { message });

export const getProfile = () => api.get('/profile');
export const updateProfile = (data: Record<string, unknown>) => api.patch('/profile', data);
export const inferProfileFromResume = (resumeText: string) =>
  api.post('/profile/infer-from-resume', { resumeText }, { timeout: 30000 });

export const analyzeJob = (jobDescription: string, bio = '', batchId = '') =>
  api.post('/jobs/analyze', { jobDescription, bio, batchId }, { timeout: 120000 });
export const generateCoverLetter = (jobId: string) => api.post(`/jobs/${jobId}/cover-letter`, {}, { timeout: 45000 });
export const getJobAnalyses = (batchId = '') =>
  api.get(batchId ? `/jobs?batchId=${encodeURIComponent(batchId)}` : '/jobs');
export const reanalyzeAllJobs = () => api.post<{ count: number; total: number }>('/jobs/reanalyze-all', {}, { timeout: 120000 });

export const getApplications = () => api.get('/applications');
export const createApplication = (data: Record<string, unknown>) => api.post('/applications', data);
export const seedDemoRejections = () =>
  api.post<{ created: number; skipped?: boolean; data: unknown[] }>('/applications/seed-demo-rejections');
export const updateApplication = (appId: string, data: Record<string, unknown>) =>
  api.patch(`/applications/${appId}`, data);
export const requestFollowUp = (appId: string) => api.post(`/applications/${appId}/follow-up`);
export const deleteApplication = (appId: string) => api.delete(`/applications/${appId}`);

export const getInsights = () => api.get('/insights');
export const recalculateInsights = () => api.post('/insights/recalculate');

export const getLatestBriefing = () => api.get('/briefings/latest');
export const generateBriefing = () => api.post('/briefings/generate');
export const downloadBriefingPdf = (briefingId: string) =>
  api.get(`/briefings/download/${briefingId}`, { responseType: 'blob' });

export const generateResumePdf = (data: Record<string, string>) =>
  api.post('/resume/generate', data, { responseType: 'blob', timeout: 20000 });

export const finalizeAnalysis = (batchId: string, expectedCount?: number, skipCoverLetter = false) =>
  api.post('/agent/finalize-analysis', { batchId, expectedCount, skipCoverLetter }, { timeout: 90000 });

export const extractResumeFile = (file: File): Promise<{ data: { text: string } }> => {
  const form = new FormData();
  form.append('file', file);
  // Use fetch directly so the browser sets the correct multipart/form-data boundary
  return fetch('/api/resume/extract', {
    method: 'POST',
    body: form,
    credentials: 'include',
  }).then(async (r) => {
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || 'extract failed');
    return { data: json as { text: string } };
  });
};

// ─── Autonomous Pipeline (NDJSON streaming) ────────────────────────────────────

export async function runAutonomousPipeline(onEvent: (e: AgentEvent) => void): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/autonomous-run`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok || !response.body) {
    throw new Error(`autonomous-run failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try { onEvent(JSON.parse(trimmed) as AgentEvent); } catch { /* skip malformed line */ }
      }
    }
  }
}

// ─── Mission: user-initiated multi-step agent execution (NDJSON streaming) ────

export async function runMission(goal: string, onEvent: (e: AgentEvent) => void): Promise<void> {
  const response = await fetch(`${API_BASE}/agent/mission`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`mission failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try { onEvent(JSON.parse(trimmed) as AgentEvent); } catch { /* skip malformed */ }
      }
    }
  }
}

export const getResumeGaps = () => api.get('/jobs/resume-gaps');

// ─── Agent Drafts ──────────────────────────────────────────────────────────────

export const getAgentDrafts = () => api.get('/agent/drafts');
export const updateDraftStatus = (id: string, status: 'sent' | 'dismissed') =>
  api.patch(`/agent/drafts/${id}`, { status });
export const confirmDraft = (draftId: string) =>
  api.post(`/agent/confirm-draft/${draftId}`);
export const getLatestAgentRun = () => api.get('/agent/latest-run');

export default api;
