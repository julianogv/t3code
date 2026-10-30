import { AuthTerminalOperateScope, type EnvironmentId } from "@t3tools/contracts";

import {
  GLOBAL_TERMINALS_THREAD_ID,
  type GlobalTerminalDefinition,
} from "../../globalTerminalsStore";
import { useStableCallback } from "../../hooks/useStableCallback";
import { readEnvironmentScope } from "../../state/session";
import { terminalEnvironment } from "../../state/terminal";
import { useAtomCommand } from "../../state/use-atom-command";

/** Starts and stops sidebar terminals; shared by the terminal page and autostart. */
export function useGlobalTerminalActions(environmentId: EnvironmentId | null) {
  const openTerminal = useAtomCommand(terminalEnvironment.open, "terminal open");
  const writeTerminal = useAtomCommand(terminalEnvironment.write, "terminal write");
  const closeTerminal = useAtomCommand(terminalEnvironment.close, "terminal close");

  const stop = async (terminal: GlobalTerminalDefinition) => {
    if (environmentId === null) return;
    await closeTerminal({
      environmentId,
      input: { threadId: GLOBAL_TERMINALS_THREAD_ID, terminalId: terminal.id, deleteHistory: true },
    });
  };

  /** Resolves true once a fresh shell is running with the terminal's command typed in. */
  const start = async (terminal: GlobalTerminalDefinition): Promise<boolean> => {
    if (environmentId === null || !readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
      return false;
    }
    // A server that died keeps the old history on disk, and reopening would inherit it.
    // Dropping it first makes every start a fresh shell, so the command is always typed.
    await stop(terminal);
    const session = { threadId: GLOBAL_TERMINALS_THREAD_ID, terminalId: terminal.id };
    const opened = await openTerminal({
      environmentId,
      input: { ...session, cwd: terminal.cwd },
    });
    if (opened._tag !== "Success") return false;
    if (terminal.command.length > 0) {
      await writeTerminal({
        environmentId,
        input: { ...session, data: `${terminal.command}\n` },
      });
    }
    return true;
  };

  return { start: useStableCallback(start), stop: useStableCallback(stop) };
}
