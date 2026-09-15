/**
 * The research queue: a pure state machine over candidate workflow states.
 *
 * Persistence is NOT here. V1 stores the queue in the browser (localStorage);
 * this module only computes the next state. That keeps the transitions testable
 * without a DOM and keeps "where is it stored" a single decision in the UI
 * layer. See docs/sourcing-v1.md for the persistence semantics.
 *
 * There is no PASS / ESCALATE / MONITOR / REJECT / INVEST. The states describe
 * research workflow position, never an investment decision.
 */

import type { Candidate, QueueEntry, QueueState } from "./types";

export const QUEUE_STORAGE_KEY = "davi.sourcing.queue.v1";

/** The state a candidate enters the queue in, given its canonical match. */
export function initialState(candidate: Candidate): QueueState {
  return candidate.existing.companyId ? "ALREADY_RESEARCHED" : "DISCOVERED";
}

/** Allowed manual transitions. ALREADY_RESEARCHED is terminal (link out instead). */
const TRANSITIONS: Record<QueueState, QueueState[]> = {
  DISCOVERED: ["QUEUED_FOR_RESEARCH", "ARCHIVED"],
  QUEUED_FOR_RESEARCH: ["RESEARCH_IN_PROGRESS", "DISCOVERED", "ARCHIVED"],
  RESEARCH_IN_PROGRESS: ["RESEARCH_HANDOFF_READY", "QUEUED_FOR_RESEARCH", "ARCHIVED"],
  RESEARCH_HANDOFF_READY: ["RESEARCH_IN_PROGRESS", "ARCHIVED"],
  ALREADY_RESEARCHED: [],
  ARCHIVED: ["DISCOVERED"],
};

export function canTransition(from: QueueState, to: QueueState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextStates(from: QueueState): QueueState[] {
  return TRANSITIONS[from] ?? [];
}

export interface QueueSnapshot {
  entries: QueueEntry[];
}

export function emptyQueue(): QueueSnapshot {
  return { entries: [] };
}

export function addToQueue(
  queue: QueueSnapshot,
  candidate: Candidate,
  now: string,
): QueueSnapshot {
  if (queue.entries.some((e) => e.candidateId === candidate.id)) return queue;
  return {
    entries: [
      ...queue.entries,
      { candidateId: candidate.id, candidate, state: initialState(candidate), updatedAt: now },
    ],
  };
}

export function setQueueState(
  queue: QueueSnapshot,
  candidateId: string,
  to: QueueState,
  now: string,
): QueueSnapshot {
  return {
    entries: queue.entries.map((e) => {
      if (e.candidateId !== candidateId) return e;
      if (!canTransition(e.state, to)) return e;
      return { ...e, state: to, updatedAt: now };
    }),
  };
}

export function removeFromQueue(queue: QueueSnapshot, candidateId: string): QueueSnapshot {
  return { entries: queue.entries.filter((e) => e.candidateId !== candidateId) };
}

export function clearQueue(): QueueSnapshot {
  return emptyQueue();
}

/** Parse a persisted snapshot defensively. A corrupt value yields an empty queue. */
export function parseQueue(raw: string | null): QueueSnapshot {
  if (!raw) return emptyQueue();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as QueueSnapshot).entries)) {
      return emptyQueue();
    }
    const entries = (parsed as QueueSnapshot).entries.filter(
      (e) =>
        e &&
        typeof e.candidateId === "string" &&
        typeof e.state === "string" &&
        e.candidate &&
        typeof e.candidate === "object",
    );
    return { entries };
  } catch {
    return emptyQueue();
  }
}
