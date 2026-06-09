import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export const sessionInit = (demo = false) =>
  api.get(demo ? '/agent/session-init?demo=true' : '/agent/session-init');
export const sendChatMessage = (message: string) => api.post('/agent/chat', { message });

export const getProfile = () => api.get('/profile');
export const updateProfile = (data: Record<string, unknown>) => api.patch('/profile', data);

export const analyzeJob = (jobDescription: string) => api.post('/jobs/analyze', { jobDescription });
export const generateCoverLetter = (jobId: string) => api.post(`/jobs/${jobId}/cover-letter`);
export const getJobAnalyses = () => api.get('/jobs');

export const getApplications = () => api.get('/applications');
export const createApplication = (data: Record<string, unknown>) => api.post('/applications', data);
export const updateApplication = (appId: string, data: Record<string, unknown>) =>
  api.patch(`/applications/${appId}`, data);
export const requestFollowUp = (appId: string) => api.post(`/applications/${appId}/follow-up`);

export const getInsights = () => api.get('/insights');
export const recalculateInsights = () => api.post('/insights/recalculate');

export const getLatestBriefing = () => api.get('/briefings/latest');
export const generateBriefing = () => api.post('/briefings/generate');
export const downloadBriefingPdf = (briefingId: string) =>
  api.get(`/briefings/download/${briefingId}`, { responseType: 'blob' });

export default api;
