import { randomUUID } from "node:crypto";

// In-memory store for in-flight avatar generations. Generation takes ~a minute —
// longer than the prod proxy (Vercel rewrite → Railway) keeps a request open —
// so the POST route starts a job here and returns its id; the client polls. The
// work runs in the background of the (persistent) Node server, so it survives
// the POST response completing. Single-process store: jobs are lost on restart
// (the client just re-generates), which is fine at this app's scale.

type AvatarJobStatus = "pending" | "done" | "error";

interface AvatarJob {
  /** Owner the job was created for — the status route checks this. */
  userId: string;
  status: AvatarJobStatus;
  image: string | null;
  error: string | null;
  createdAt: number;
}

const TTL_MS = 10 * 60_000;
const jobs = new Map<string, AvatarJob>();

function prune(): void {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, job] of jobs) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}

export function createAvatarJob(userId: string): string {
  prune();
  const id = randomUUID();
  jobs.set(id, { userId, status: "pending", image: null, error: null, createdAt: Date.now() });
  return id;
}

export function completeAvatarJob(id: string, image: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "done";
    job.image = image;
  }
}

export function failAvatarJob(id: string, error: string): void {
  const job = jobs.get(id);
  if (job) {
    job.status = "error";
    job.error = error;
  }
}

export function getAvatarJob(id: string): AvatarJob | undefined {
  return jobs.get(id);
}
