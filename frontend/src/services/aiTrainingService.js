import { apiFetch } from './apiClient';

/**
 * Phase 2 live endpoints:
 * - GET /api/users/me/ai-training/summary?from&to
 * - GET /api/users/me/ai-training/scorecards?from&to&campaign&outcome&minScore&limit
 * - GET /api/users/me/ai-training/trend?from&to
 * - GET /api/users/me/ai-training/drills?from&to
 * - POST /api/users/me/ai-training/drills/:drillId/status
 */
export function getAiTrainingSummary(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/users/me/ai-training/summary${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAiTrainingScorecards(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.campaign && params.campaign !== 'all') qs.set('campaign', params.campaign);
  if (params.outcome && params.outcome !== 'all') qs.set('outcome', params.outcome);
  if (params.minScore && params.minScore !== 'all') qs.set('minScore', String(params.minScore));
  if (params.limit) qs.set('limit', String(params.limit));
  return apiFetch(`/api/users/me/ai-training/scorecards${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAiTrainingTrend(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/users/me/ai-training/trend${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function getAiTrainingDrills(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/users/me/ai-training/drills${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function updateAiTrainingDrillStatus(drillId, status) {
  return apiFetch(`/api/users/me/ai-training/drills/${encodeURIComponent(drillId)}/status`, {
    method: 'POST',
    body: { status },
  });
}

export function getAiCoachingPlan(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.refresh) qs.set('refresh', 'true');
  return apiFetch(`/api/users/me/ai-training/coaching-plan${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export function updateAiCoachingTask(taskId, body) {
  return apiFetch(`/api/users/me/ai-training/coaching-plan/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    body,
  });
}

export function getAiCoachingImpact(params = {}) {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  return apiFetch(`/api/users/me/ai-training/coaching-plan/impact${qs.toString() ? `?${qs.toString()}` : ''}`, { method: 'GET' });
}

export async function getAiTrainingBundle(params = {}) {
  const [summaryRes, trendRes, scorecardsRes, drillsRes, coachingPlanRes, coachingImpactRes] = await Promise.all([
    getAiTrainingSummary(params),
    getAiTrainingTrend(params),
    getAiTrainingScorecards(params),
    getAiTrainingDrills(params),
    getAiCoachingPlan(params),
    getAiCoachingImpact(params),
  ]);
  return {
    summary: summaryRes?.summary || { avgScore: 0, reviewedCalls: 0, improvementPct: 0, pendingDrills: 0 },
    trend: Array.isArray(trendRes?.points) ? trendRes.points : [],
    scorecards: Array.isArray(scorecardsRes?.rows) ? scorecardsRes.rows : [],
    drills: Array.isArray(drillsRes?.rows) ? drillsRes.rows : [],
    coachingPlan: coachingPlanRes?.plan || null,
    coachingTasks: Array.isArray(coachingPlanRes?.tasks) ? coachingPlanRes.tasks : [],
    coachingImpact: coachingImpactRes || null,
  };
}
