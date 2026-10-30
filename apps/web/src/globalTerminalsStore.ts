import { ThreadId } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { randomUUID } from "~/lib/utils";
import { resolveStorage } from "./lib/storage";

/**
 * Sidebar terminals are not tied to a thread, so they share one reserved thread id
 * on the server terminal manager, the same way onboarding's setup terminal does.
 */
export const GLOBAL_TERMINALS_THREAD_ID = ThreadId.make("sidebar-global-terminals");

export interface GlobalTerminalDefinition {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  /** Typed into the shell once when it starts; empty opens a plain shell. */
  readonly command: string;
  /** Started when the app connects to a server where it is not already running. */
  readonly autostart?: boolean;
}

export interface GlobalTerminalDraft {
  readonly name: string;
  readonly cwd: string;
  readonly command: string;
  readonly autostart: boolean;
}

interface GlobalTerminalsState {
  readonly terminals: ReadonlyArray<GlobalTerminalDefinition>;
  readonly collapsed: boolean;
  readonly addTerminal: (draft: GlobalTerminalDraft) => GlobalTerminalDefinition;
  readonly updateTerminal: (id: string, draft: GlobalTerminalDraft) => void;
  readonly removeTerminal: (id: string) => void;
  readonly setCollapsed: (collapsed: boolean) => void;
}

const GLOBAL_TERMINALS_STORAGE_KEY = "t3code:global-terminals:v1";

export const useGlobalTerminalsStore = create<GlobalTerminalsState>()(
  persist(
    (set) => ({
      terminals: [],
      collapsed: false,
      addTerminal: (draft) => {
        const terminal = { id: `global-${randomUUID()}`, ...draft };
        set((state) => ({ terminals: [...state.terminals, terminal] }));
        return terminal;
      },
      updateTerminal: (id, draft) =>
        set((state) => ({
          terminals: state.terminals.map((terminal) =>
            terminal.id === id ? { ...terminal, ...draft } : terminal,
          ),
        })),
      removeTerminal: (id) =>
        set((state) => ({ terminals: state.terminals.filter((terminal) => terminal.id !== id) })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    {
      name: GLOBAL_TERMINALS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ terminals: state.terminals, collapsed: state.collapsed }),
    },
  ),
);

export function selectGlobalTerminal(
  terminals: ReadonlyArray<GlobalTerminalDefinition>,
  id: string,
): GlobalTerminalDefinition | null {
  return terminals.find((terminal) => terminal.id === id) ?? null;
}
