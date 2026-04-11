// Pending cloud generation jobs — survive page reload
import { saveImage, loadImage } from "./imageDb";

export interface PendingJob {
  id: string;
  nodeId: string;
  nodeType: string;
  operationName?: string; // Veo operation name
  promptId?: string;      // ComfyUI prompt ID
  model: string;
  prompt: string;
  startTime: number;
  status: "pending" | "polling" | "completed" | "failed";
}

const STORAGE_KEY = "flowstudio_pending_jobs";

export function getPendingJobs(): PendingJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addPendingJob(job: PendingJob): void {
  const jobs = getPendingJobs();
  jobs.push(job);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function updatePendingJob(id: string, update: Partial<PendingJob>): void {
  const jobs = getPendingJobs().map((j) =>
    j.id === id ? { ...j, ...update } : j
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function removePendingJob(id: string): void {
  const jobs = getPendingJobs().filter((j) => j.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function clearCompletedJobs(): void {
  const jobs = getPendingJobs().filter((j) => j.status === "pending" || j.status === "polling");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}
