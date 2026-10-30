import * as Schema from "effect/Schema";

import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

/** Thread facts the server maps onto Claude Code's statusLine stdin JSON. */
export const StatusLineRenderInput = Schema.Struct({
  cwd: TrimmedNonEmptyString,
  projectDir: Schema.optional(TrimmedNonEmptyString),
  sessionId: Schema.optional(TrimmedNonEmptyString),
  model: Schema.Struct({
    id: TrimmedNonEmptyString,
    displayName: TrimmedNonEmptyString,
  }),
  effort: Schema.optional(TrimmedNonEmptyString),
  contextWindow: Schema.optional(
    Schema.Struct({
      usedTokens: NonNegativeInt,
      maxTokens: Schema.optional(PositiveInt),
      usedPercentage: Schema.optional(Schema.Number.check(Schema.isFinite())),
      inputTokens: Schema.optional(NonNegativeInt),
      outputTokens: Schema.optional(NonNegativeInt),
      cachedInputTokens: Schema.optional(NonNegativeInt),
    }),
  ),
  costUsd: Schema.optional(Schema.Number.check(Schema.isFinite())),
});
export type StatusLineRenderInput = typeof StatusLineRenderInput.Type;

/** `configured: false` means no Claude `statusLine.command` is set, so clients render nothing. */
export const StatusLineRenderResult = Schema.Struct({
  configured: Schema.Boolean,
  lines: Schema.Array(Schema.String),
  error: Schema.optional(Schema.String),
});
export type StatusLineRenderResult = typeof StatusLineRenderResult.Type;
