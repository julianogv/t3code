import {
  AuthTerminalReadScope,
  type EnvironmentId,
  type TerminalSummary,
} from "@t3tools/contracts";

import { GLOBAL_TERMINALS_THREAD_ID } from "../../globalTerminalsStore";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentScope } from "../../state/session";
import { terminalEnvironment } from "../../state/terminal";

export type GlobalTerminalRunState = "running" | "exited" | "stopped";

/** Server summaries of the sidebar terminals by id; null until the first metadata snapshot lands. */
export function useGlobalTerminalSummaries(
  environmentId: EnvironmentId | null,
): ReadonlyMap<string, TerminalSummary> | null {
  const canRead = useEnvironmentScope(environmentId, AuthTerminalReadScope);
  const metadata = useEnvironmentQuery(
    environmentId === null || !canRead
      ? null
      : terminalEnvironment.metadata({ environmentId, input: null }),
  );
  if (metadata.data === null) return null;
  const summaries = new Map<string, TerminalSummary>();
  for (const summary of metadata.data) {
    if (summary.threadId === GLOBAL_TERMINALS_THREAD_ID) {
      summaries.set(summary.terminalId, summary);
    }
  }
  return summaries;
}

export function globalTerminalRunState(
  summary: TerminalSummary | undefined,
): GlobalTerminalRunState {
  if (summary === undefined) return "stopped";
  return summary.status === "running" || summary.status === "starting" ? "running" : "exited";
}
