import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  type StatusLineRenderInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import type { ProviderInstance } from "@t3tools/provider-core/server/driver";

import * as ProcessRunner from "../processRunner.ts";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as StatusLine from "./StatusLine.ts";
import * as ServerSettings from "../serverSettings.ts";

const makeTestLayer = (
  settings: Parameters<typeof ServerSettings.layerTest>[0] = {},
  usageLimits?: ServerProvider["usageLimits"],
) =>
  StatusLine.layer.pipe(
    Layer.provide(ProcessRunner.layer),
    Layer.provide(ServerSettings.layerTest(settings)),
    Layer.provide(
      Layer.mock(ProviderInstanceRegistry.ProviderInstanceRegistry)({
        getInstance: () =>
          Effect.succeed(
            usageLimits === undefined
              ? undefined
              : ({
                  snapshot: { getSnapshot: Effect.succeed({ usageLimits } as ServerProvider) },
                } as ProviderInstance),
          ),
      }),
    ),
    Layer.provideMerge(NodeServices.layer),
  );
const TestLayer = makeTestLayer();

const input = (cwd: string): StatusLineRenderInput => ({
  cwd,
  sessionId: "claude-session-1",
  model: { id: "claude-opus-5-5", displayName: "Opus 5.5" },
  effort: "high",
  contextWindow: {
    usedTokens: 50_000,
    maxTokens: 200_000,
    inputTokens: 48_000,
    outputTokens: 2_000,
  },
  costUsd: 1.25,
});

// Lives outside Effect code because the service reads the real env var, which a Config can't stand in for.
const setClaudeConfigDir = (value: string | undefined): string | undefined => {
  const previous = process.env.CLAUDE_CONFIG_DIR;
  if (value === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = value;
  return previous;
};

// The service reads CLAUDE_CONFIG_DIR from process.env, like the Claude CLI it stands in for.
const withClaudeConfig = (settings: string | null, script: string | null) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "t3-status-line-" });
    if (script !== null) {
      yield* fs.writeFileString(path.join(root, "statusline.sh"), script);
      yield* fs.chmod(path.join(root, "statusline.sh"), 0o755);
    }
    if (settings !== null) {
      yield* fs.writeFileString(
        path.join(root, "settings.json"),
        settings.replaceAll("$ROOT", root),
      );
    }
    const previous = setClaudeConfigDir(root);
    yield* Effect.addFinalizer(() => Effect.sync(() => setClaudeConfigDir(previous)));
    return root;
  });

describe("StatusLine.render", () => {
  it.effect("pipes Claude's statusLine JSON to the configured command and returns its lines", () =>
    Effect.gen(function* () {
      const root = yield* withClaudeConfig(
        `{"statusLine":{"type":"command","command":"$ROOT/statusline.sh"}}`,
        [
          "#!/bin/sh",
          "input=$(cat)",
          'echo "$input" | node -e \'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log([j.model.display_name,j.effort.level,j.session_id,j.workspace.current_dir,j.context_window.used_percentage,j.context_window.context_window_size,j.context_window.total_input_tokens,j.context_window.total_output_tokens,j.cost.total_cost_usd].join("|"))})\'',
          "echo second line",
        ].join("\n"),
      );
      const result = yield* (yield* StatusLine.StatusLine).render(input(root));

      assert.deepStrictEqual(
        result,
        {
          configured: true,
          lines: [
            `Opus 5.5|high|claude-session-1|${root}|25|200000|48000|2000|1.25`,
            "second line",
          ],
        },
        "Expected the script to see Claude-shaped fields and both output lines to come back",
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("reports unconfigured when settings.json has no statusLine", () =>
    Effect.gen(function* () {
      const root = yield* withClaudeConfig(`{"model":"opus"}`, null);
      const result = yield* (yield* StatusLine.StatusLine).render(input(root));

      assert.deepStrictEqual(
        result,
        { configured: false, lines: [] },
        "Expected no status line when the user has not configured one",
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("surfaces a failing command's stderr instead of failing the request", () =>
    Effect.gen(function* () {
      const root = yield* withClaudeConfig(
        `{"statusLine":{"type":"command","command":"echo broken >&2; exit 3"}}`,
        null,
      );
      const result = yield* (yield* StatusLine.StatusLine).render(input(root));

      assert.deepStrictEqual(
        result,
        { configured: true, lines: [], error: "broken" },
        "Expected the command's stderr as the error",
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("reads the thread's Claude instance home and passes its rate limits", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const instanceHome = yield* fs.makeTempDirectoryScoped({ prefix: "t3-status-line-home-" });
      yield* fs.writeFileString(
        path.join(instanceHome, "settings.json"),
        `{"statusLine":{"type":"command","command":"echo instance home; cat"}}`,
      );
      const root = yield* withClaudeConfig(
        `{"statusLine":{"type":"command","command":"echo default home"}}`,
        null,
      );
      const instanceId = ProviderInstanceId.make("claude-personal");
      const result = yield* Effect.gen(function* () {
        return yield* (yield* StatusLine.StatusLine).render({
          ...input(root),
          providerInstanceId: instanceId,
        });
      }).pipe(
        Effect.provide(
          makeTestLayer(
            {
              providerInstances: {
                [instanceId]: {
                  driver: ProviderDriverKind.make("claudeAgent"),
                  config: { homePath: instanceHome },
                },
              },
            },
            {
              checkedAt: "2026-11-12T10:00:00.000Z",
              windows: [
                {
                  id: "five_hour",
                  kind: "session",
                  label: "Session",
                  usedPercent: 42,
                  resetsAt: "2026-11-12T15:00:00.000Z",
                },
                { id: "seven_day", kind: "weekly", label: "Weekly", usedPercent: 7 },
              ],
            },
          ),
        ),
      );

      assert.deepStrictEqual(
        result.lines[0],
        "instance home",
        "Expected the command from the instance's homePath settings.json",
      );
      assert.deepStrictEqual(
        JSON.parse(result.lines[1] ?? "{}").rate_limits,
        {
          five_hour: { used_percentage: 42, resets_at: 1_794_495_600 },
          seven_day: { used_percentage: 7 },
        },
        "Expected the instance's usage windows in Claude Code's rate_limits shape",
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
