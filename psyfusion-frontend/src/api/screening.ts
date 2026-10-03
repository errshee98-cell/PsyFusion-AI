import { apiFetch } from './client';

export interface ScreeningResultSummary {
  id: string;
  riskScore: number;
  decision: 'low_risk' | 'elevated_risk' | 'abstain_review_needed';
  modalitiesUsed: string[];
  crossModalConflict: boolean;
  conflictMagnitude: number | null;
  perModalityScores: Record<string, number>;
  explanation: string;
  crisisTextFlag: boolean;
  crisisTextSeverity: 'imminent' | 'elevated' | null;
  needsClinicianReview: boolean;
  reviewed: boolean;
  createdAt: string;
}

export interface CrisisResources {
  message: string;
  resources: { name: string; contact: string }[];
  note: string;
}

export interface ScreeningResponse {
  result?: ScreeningResultSummary; // absent on the 503 degraded-service path
  resources?: CrisisResources;
  crisisFlag?: boolean;
}

/**
 * Submits one screening turn. Audio/video are optional File objects from a
 * future recorder/upload UI - the Screening page today only sends text, but
 * the request shape already matches what the backend (and the ML service
 * behind it) accepts.
 */
export async function submitScreening(
  text: string,
  options?: { audio?: File; video?: File }
): Promise<ScreeningResponse> {
  const form = new FormData();
  form.append('text', text);
  if (options?.audio) form.append('audio', options.audio);
  if (options?.video) form.append('video', options.video);

  return apiFetch<ScreeningResponse>('/api/screening', { method: 'POST', body: form });
}

export async function getScreeningHistory(page = 1): Promise<{ results: ScreeningResultSummary[]; page: number }> {
  return apiFetch(`/api/screening/history?page=${page}`);
}
