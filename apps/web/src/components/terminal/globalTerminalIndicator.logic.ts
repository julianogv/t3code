import type { TerminalSummary } from "@t3tools/contracts";

import { type GlobalTerminalRunState, globalTerminalRunState } from "./useGlobalTerminalSummaries";

/** "finished": the shell is alive but the command typed into it has ended. */
export type GlobalTerminalIndicator = GlobalTerminalRunState | "finished";

/** Shell pid each terminal's command was last seen running under. */
export type GlobalTerminalCommandPids = ReadonlyMap<string, number>;

export function trackGlobalTerminalCommandPids(
  previous: GlobalTerminalCommandPids,
  summaries: ReadonlyMap<string, TerminalSummary>,
): GlobalTerminalCommandPids {
  let next: Map<string, number> | null = null;
  for (const [terminalId, summary] of summaries) {
    if (!summary.hasRunningSubprocess || summary.pid === null) continue;
    if (previous.get(terminalId) === summary.pid) continue;
    next ??= new Map(previous);
    next.set(terminalId, summary.pid);
  }
  return next ?? previous;
}

// Keyed by shell pid so a restarted shell, whose command has not been seen yet, stays green.
export function globalTerminalIndicator(
  summary: TerminalSummary | undefined,
  commandPid: number | undefined,
): GlobalTerminalIndicator {
  const runState = globalTerminalRunState(summary);
  if (
    runState === "running" &&
    summary !== undefined &&
    !summary.hasRunningSubprocess &&
    summary.pid !== null &&
    summary.pid === commandPid
  ) {
    return "finished";
  }
  return runState;
}

export const isEndedGlobalTerminalIndicator = (indicator: GlobalTerminalIndicator) =>
  indicator === "exited" || indicator === "finished";
