import type { TerminalSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  globalTerminalIndicator,
  trackGlobalTerminalCommandPids,
} from "./globalTerminalIndicator.logic";

const summary = (overrides: Partial<TerminalSummary> = {}): TerminalSummary => ({
  threadId: "global-terminals",
  terminalId: "global-1",
  cwd: "/repo",
  worktreePath: null,
  status: "running",
  pid: 100,
  exitCode: null,
  exitSignal: null,
  hasRunningSubprocess: false,
  label: "dev",
  updatedAt: "2026-11-13T10:00:00.000Z",
  ...overrides,
});

describe("globalTerminalIndicator", () => {
  it("turns finished once the command seen under the live shell ends", () => {
    const started = new Map([["global-1", summary()]]);
    const pidsAtStart = trackGlobalTerminalCommandPids(new Map(), started);
    expect(globalTerminalIndicator(started.get("global-1"), pidsAtStart.get("global-1"))).toBe(
      "running",
    );

    const commandRunning = new Map([["global-1", summary({ hasRunningSubprocess: true })]]);
    const pids = trackGlobalTerminalCommandPids(pidsAtStart, commandRunning);
    expect(globalTerminalIndicator(commandRunning.get("global-1"), pids.get("global-1"))).toBe(
      "running",
    );

    expect(globalTerminalIndicator(summary(), pids.get("global-1"))).toBe("finished");
  });

  it("stays running after a restart until the new shell's command is seen", () => {
    const pids = trackGlobalTerminalCommandPids(
      new Map(),
      new Map([["global-1", summary({ hasRunningSubprocess: true })]]),
    );

    expect(globalTerminalIndicator(summary({ pid: 200 }), pids.get("global-1"))).toBe("running");
  });

  it("keeps the same map when nothing new is running", () => {
    const pids = trackGlobalTerminalCommandPids(
      new Map(),
      new Map([["global-1", summary({ hasRunningSubprocess: true })]]),
    );

    expect(
      trackGlobalTerminalCommandPids(
        pids,
        new Map([["global-1", summary({ hasRunningSubprocess: true })]]),
      ),
    ).toBe(pids);
  });
});
