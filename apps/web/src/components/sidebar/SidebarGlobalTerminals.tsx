import { useAtomValue } from "@effect/atom-react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { memo, useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { type GlobalTerminalDefinition, useGlobalTerminalsStore } from "../../globalTerminalsStore";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { Button } from "../ui/button";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { useSidebar } from "../ui/sidebar";
import { GlobalTerminalEditorDialog } from "../terminal/GlobalTerminalEditorDialog";
import { useGlobalTerminalActions } from "../terminal/useGlobalTerminalActions";
import {
  type GlobalTerminalRunState,
  globalTerminalRunState,
  useGlobalTerminalSummaries,
} from "../terminal/useGlobalTerminalSummaries";

const RUN_STATE_DOT: Record<GlobalTerminalRunState, string> = {
  running: "bg-success",
  exited: "bg-destructive",
  stopped: "bg-sidebar-muted-foreground/40",
};

const RUN_STATE_LABEL: Record<GlobalTerminalRunState, string> = {
  running: "Running",
  exited: "Exited",
  stopped: "Not running",
};

// Per page load, so a terminal the user stopped is not started again behind their back.
const autostartAttempted = new Set<string>();

export const SidebarGlobalTerminals = memo(function SidebarGlobalTerminals() {
  const terminals = useGlobalTerminalsStore((state) => state.terminals);
  const collapsed = useGlobalTerminalsStore((state) => state.collapsed);
  const setCollapsed = useGlobalTerminalsStore((state) => state.setCollapsed);
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const summaries = useGlobalTerminalSummaries(environmentId);
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const activeTerminalId = useLocation({
    select: (location) =>
      location.pathname.startsWith("/terminals/")
        ? decodeURIComponent(location.pathname.slice("/terminals/".length))
        : null,
  });
  const [creating, setCreating] = useState(false);
  const actions = useGlobalTerminalActions(environmentId);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- starts autostart terminals on the server once its first terminal snapshot shows they are not running
  useEffect(() => {
    // Null until the first snapshot; before it, every terminal would look stopped.
    if (summaries === null) return;
    for (const terminal of terminals) {
      if (!terminal.autostart || autostartAttempted.has(terminal.id)) continue;
      autostartAttempted.add(terminal.id);
      if (globalTerminalRunState(summaries.get(terminal.id)) !== "running") {
        void actions.start(terminal);
      }
    }
  }, [actions, summaries, terminals]);

  if (environmentId === null) return null;

  const runningCount = terminals.filter(
    (terminal) => globalTerminalRunState(summaries?.get(terminal.id)) === "running",
  ).length;

  const openTerminal = (terminal: GlobalTerminalDefinition) => {
    if (isMobile) setOpenMobile(false);
    void navigate({ to: "/terminals/$terminalId", params: { terminalId: terminal.id } });
  };

  return (
    <div className="mx-0.5 mb-1" data-testid="sidebar-global-terminals">
      <div className="group/global-terminals relative">
        <CollapsibleSectionHeader
          expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
          data-testid="sidebar-global-terminals-toggle"
          accessory={
            terminals.length > 0 ? (
              <span className="font-normal tabular-nums group-hover/global-terminals:invisible pointer-coarse:invisible">
                {runningCount}/{terminals.length}
              </span>
            ) : undefined
          }
        >
          Terminals
        </CollapsibleSectionHeader>
        {/* Sits over the count, which hides on hover, and left of the chevron. */}
        <span className="absolute inset-y-0 right-6 flex items-center opacity-0 focus-within:opacity-100 group-hover/global-terminals:opacity-100 pointer-coarse:opacity-100">
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="New terminal"
            onClick={() => setCreating(true)}
          >
            <PlusIcon aria-hidden />
          </Button>
        </span>
      </div>
      {collapsed ? null : terminals.length === 0 ? (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex h-7 w-full cursor-pointer items-center rounded-(--control-radius) px-2 text-left text-xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
        >
          Add a terminal
        </button>
      ) : (
        <ul className="flex flex-col gap-px">
          {terminals.map((terminal) => {
            const runState = globalTerminalRunState(summaries?.get(terminal.id));
            const active = activeTerminalId === terminal.id;
            return (
              <li key={terminal.id}>
                <button
                  type="button"
                  onClick={() => openTerminal(terminal)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-7 w-full cursor-pointer items-center gap-2 rounded-(--control-radius) px-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active
                      ? "bg-sidebar-row-active text-sidebar-foreground"
                      : "text-sidebar-foreground/85 hover:bg-sidebar-row-hover",
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", RUN_STATE_DOT[runState])}>
                    <span className="sr-only">{RUN_STATE_LABEL[runState]}</span>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{terminal.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <GlobalTerminalEditorDialog
        open={creating}
        onOpenChange={setCreating}
        terminal={null}
        defaultCwd={null}
        onSaved={openTerminal}
      />
    </div>
  );
});
