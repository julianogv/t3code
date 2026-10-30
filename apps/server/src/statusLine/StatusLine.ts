import type { StatusLineRenderInput, StatusLineRenderResult } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveClaudeHomePath } from "../provider/Drivers/ClaudeHome.ts";
import * as ProcessRunner from "../processRunner.ts";

const ClaudeStatusLineSettings = Schema.Struct({
  statusLine: Schema.optional(
    Schema.Struct({
      type: Schema.optional(Schema.String),
      command: Schema.String,
    }),
  ),
});
const decodeClaudeSettings = Schema.decodeUnknownOption(
  Schema.fromJsonString(ClaudeStatusLineSettings),
);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

// Claude Code allows 300ms per refresh; scripts that probe local services need a little more.
const STATUS_LINE_TIMEOUT = "5 seconds";
const STATUS_LINE_MAX_OUTPUT_BYTES = 16 * 1024;

export class StatusLine extends Context.Service<
  StatusLine,
  {
    readonly render: (input: StatusLineRenderInput) => Effect.Effect<StatusLineRenderResult>;
  }
>()("t3/statusLine/StatusLine") {}

/** Same shape Claude Code pipes to `statusLine.command`, so existing scripts run unchanged. */
const toClaudeStatusLinePayload = (input: StatusLineRenderInput) => {
  const contextWindow = input.contextWindow;
  const usedPercentage =
    contextWindow?.usedPercentage ??
    (contextWindow?.maxTokens
      ? (contextWindow.usedTokens / contextWindow.maxTokens) * 100
      : undefined);
  return {
    hook_event_name: "Status",
    session_id: input.sessionId ?? null,
    cwd: input.cwd,
    model: { id: input.model.id, display_name: input.model.displayName },
    workspace: { current_dir: input.cwd, project_dir: input.projectDir ?? input.cwd },
    version: "t3code",
    output_style: { name: "default" },
    effort: input.effort === undefined ? null : { level: input.effort },
    cost: {
      total_cost_usd: input.costUsd ?? 0,
      total_cost: input.costUsd ?? 0,
    },
    context_window: {
      total_input_tokens: contextWindow?.inputTokens ?? contextWindow?.usedTokens ?? 0,
      total_output_tokens: contextWindow?.outputTokens ?? 0,
      context_window_size: contextWindow?.maxTokens ?? null,
      used_percentage: usedPercentage === undefined ? null : Math.round(usedPercentage),
      remaining_percentage: usedPercentage === undefined ? null : Math.round(100 - usedPercentage),
      current_usage:
        contextWindow === undefined
          ? null
          : {
              input_tokens: contextWindow.inputTokens ?? contextWindow.usedTokens,
              output_tokens: contextWindow.outputTokens ?? 0,
              cache_read_input_tokens: contextWindow.cachedInputTokens ?? 0,
              cache_creation_input_tokens: 0,
            },
    },
    exceeds_200k_tokens: (contextWindow?.usedTokens ?? 0) > 200_000,
  };
};

const make = Effect.gen(function* StatusLineMake() {
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcess.Platform;

  // Only user-level settings: a project's .claude/settings.json would let any opened repo pick
  // the command this RPC runs.
  const readCommand = Effect.fn("StatusLine.readCommand")(function* () {
    const claudeHome = yield* resolveClaudeHomePath({ homePath: "" }, process.env).pipe(
      Effect.provideService(Path.Path, path),
    );
    const raw = yield* fileSystem
      .readFileString(path.join(claudeHome, "settings.json"))
      .pipe(Effect.option);
    return Option.flatMap(raw, decodeClaudeSettings).pipe(
      Option.flatMapNullishOr((settings) => settings.statusLine?.command.trim()),
      Option.filter((command) => command.length > 0),
    );
  });

  const render = Effect.fn("StatusLine.render")(function* (input: StatusLineRenderInput) {
    const command = yield* readCommand();
    if (Option.isNone(command)) {
      return { configured: false, lines: [] } satisfies StatusLineRenderResult;
    }
    const shell =
      platform === "win32"
        ? { command: "cmd.exe", args: ["/d", "/s", "/c", command.value] }
        : { command: "/bin/sh", args: ["-c", command.value] };
    return yield* processRunner
      .run({
        ...shell,
        cwd: input.cwd,
        stdin: encodeJson(toClaudeStatusLinePayload(input)),
        stdinOptional: true,
        timeout: STATUS_LINE_TIMEOUT,
        timeoutBehavior: "timedOutResult",
        maxOutputBytes: STATUS_LINE_MAX_OUTPUT_BYTES,
        outputMode: "truncate",
      })
      .pipe(
        Effect.map((output): StatusLineRenderResult => {
          const lines = output.stdout.replace(/\s+$/u, "").split(/\r?\n/u);
          if (output.timedOut) {
            return { configured: true, lines: [], error: "statusLine command timed out" };
          }
          return {
            configured: true,
            lines: lines.length === 1 && lines[0] === "" ? [] : lines,
            ...(output.code !== null && output.code !== 0
              ? { error: output.stderr.trim() || `statusLine command exited with ${output.code}` }
              : {}),
          };
        }),
        Effect.catch((error) =>
          Effect.succeed<StatusLineRenderResult>({
            configured: true,
            lines: [],
            error: error.message,
          }),
        ),
      );
  });

  return StatusLine.of({ render });
});

export const layer = Layer.effect(StatusLine, make);
