import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { AuthTerminalOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { PencilIcon, PlayIcon, RotateCwIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "../../appearanceFonts";
import { isElectron } from "../../env";
import {
  GLOBAL_TERMINALS_THREAD_ID,
  type GlobalTerminalDefinition,
  selectGlobalTerminal,
  useGlobalTerminalsStore,
} from "../../globalTerminalsStore";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { TerminalViewport } from "../ThreadTerminalDrawer";
import { Button } from "../ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { SidebarInset } from "../ui/sidebar";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { GlobalTerminalEditorDialog } from "./GlobalTerminalEditorDialog";
import { useGlobalTerminalActions } from "./useGlobalTerminalActions";
import { globalTerminalRunState, useGlobalTerminalSummaries } from "./useGlobalTerminalSummaries";

export function GlobalTerminalPage({ terminalId }: { terminalId: string }) {
  const terminal = useGlobalTerminalsStore((state) =>
    selectGlobalTerminal(state.terminals, terminalId),
  );
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      {terminal === null || environmentId === null ? (
        <>
          <WorkspacePageHeader electron={isElectron} />
          <Empty className="flex-1">
            <EmptyHeader className="max-w-md">
              <EmptyTitle>Terminal not found</EmptyTitle>
              <EmptyDescription>
                It was removed, or it was created in another browser.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </>
      ) : (
        <GlobalTerminalView terminal={terminal} environmentId={environmentId} />
      )}
    </SidebarInset>
  );
}

function GlobalTerminalView({
  terminal,
  environmentId,
}: {
  terminal: GlobalTerminalDefinition;
  environmentId: EnvironmentId;
}) {
  const navigate = useNavigate();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const canOperate = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const summaries = useGlobalTerminalSummaries(environmentId);
  const summary = summaries?.get(terminal.id);
  const runState = globalTerminalRunState(summary);
  const removeTerminal = useGlobalTerminalsStore((state) => state.removeTerminal);
  const actions = useGlobalTerminalActions(environmentId);
  const [editing, setEditing] = useState(false);
  // Bumped to remount the viewport so it attaches to the session start or restart just opened.
  const [viewportKey, setViewportKey] = useState(0);
  const threadRef = scopeThreadRef(environmentId, GLOBAL_TERMINALS_THREAD_ID);
  // Starting always replaces the old shell, so it also serves as restart.
  const start = async () => {
    if (await actions.start(terminal)) setViewportKey((key) => key + 1);
  };
  const stop = () => actions.stop(terminal);

  const remove = async () => {
    await stop();
    removeTerminal(terminal.id);
    void navigate({ to: "/" });
  };

  return (
    <>
      <WorkspacePageHeader electron={isElectron} className="border-b border-border">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h1 className="truncate text-sm font-medium">{terminal.name}</h1>
          <span className="hidden min-w-0 truncate font-mono text-xs text-muted-foreground sm:inline">
            {terminal.command || terminal.cwd}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
          {runState === "running" ? (
            <>
              <Button size="xs" variant="ghost" disabled={!canOperate} onClick={() => void start()}>
                <RotateCwIcon aria-hidden />
                Restart
              </Button>
              <Button size="xs" variant="ghost" disabled={!canOperate} onClick={() => void stop()}>
                <SquareIcon aria-hidden />
                Stop
              </Button>
            </>
          ) : (
            <Button size="xs" variant="ghost" disabled={!canOperate} onClick={() => void start()}>
              <PlayIcon aria-hidden />
              Start
            </Button>
          )}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Edit terminal"
            onClick={() => setEditing(true)}
          >
            <PencilIcon aria-hidden />
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Delete terminal"
            onClick={() => void remove()}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>
      </WorkspacePageHeader>
      <div data-thread-terminal-drawer className="min-h-0 flex-1 bg-(--terminal-background)">
        {runState === "running" ? (
          <TerminalViewport
            key={viewportKey}
            threadRef={threadRef}
            threadId={GLOBAL_TERMINALS_THREAD_ID}
            terminalId={terminal.id}
            terminalLabel={terminal.name}
            cwd={terminal.cwd}
            advancedTypography={advancedTypography}
            onSessionExited={() => undefined}
            autoFocus
            visible
            keybindings={keybindings}
          />
        ) : summaries === null ? null : (
          <Empty className="h-full">
            <EmptyHeader className="max-w-md">
              <EmptyTitle>
                {runState === "exited" ? "The process exited" : "This terminal is not running"}
              </EmptyTitle>
              <EmptyDescription>
                Starts a shell in <code className="font-mono">{terminal.cwd}</code>
                {terminal.command ? (
                  <>
                    {" "}
                    and runs <code className="font-mono">{terminal.command}</code>
                  </>
                ) : null}
                .
              </EmptyDescription>
              <div className="mt-5 flex justify-center">
                <Button size="sm" disabled={!canOperate} onClick={() => void start()}>
                  <PlayIcon aria-hidden />
                  Start
                </Button>
              </div>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <GlobalTerminalEditorDialog
        open={editing}
        onOpenChange={setEditing}
        terminal={terminal}
        defaultCwd={null}
      />
    </>
  );
}
