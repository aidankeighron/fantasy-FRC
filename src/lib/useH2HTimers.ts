"use client";

import { useEffect, useState } from "react";

export interface H2HWeekTimestamps {
  draftOpensAt: { toMillis: () => number };
  draftClosesAt: { toMillis: () => number };
  eventsStartDate: { toMillis: () => number };
  eventsEndDate: { toMillis: () => number };
  scoringAt: { toMillis: () => number };
}

export type H2HPhase = "pre-draft" | "drafting" | "events-live" | "awaiting-score" | "completed";

export interface H2HTimerState {
  phase: H2HPhase;
  label: string;
  target: number;
  remaining: number;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(" ");
}

export function useH2HTimers(week: H2HWeekTimestamps | null): H2HTimerState | null {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!week) return null;

  const draftOpens = week.draftOpensAt.toMillis();
  const draftCloses = week.draftClosesAt.toMillis();
  const eventsEnd = week.eventsEndDate.toMillis();
  const scoring = week.scoringAt.toMillis();

  if (now < draftOpens) {
    return { phase: "pre-draft", label: "Draft opens in", target: draftOpens, remaining: draftOpens - now };
  }
  if (now < draftCloses) {
    return { phase: "drafting", label: "Draft closes in", target: draftCloses, remaining: draftCloses - now };
  }
  if (now < eventsEnd) {
    return { phase: "events-live", label: "Events end in", target: eventsEnd, remaining: eventsEnd - now };
  }
  if (now < scoring) {
    return { phase: "awaiting-score", label: "Scoring in", target: scoring, remaining: scoring - now };
  }
  return { phase: "completed", label: "Week complete", target: 0, remaining: 0 };
}
