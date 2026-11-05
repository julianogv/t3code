import type {
  ModelSelection,
  ServerProviderModel,
  StatusLineRenderInput,
} from "@t3tools/contracts";
import { getProviderOptionCurrentValue } from "@t3tools/shared/model";

import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";

export interface StatusLineSpanStyle {
  readonly color?: string;
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
}

export interface StatusLineSpan {
  readonly text: string;
  readonly style: StatusLineSpanStyle;
}

const ANSI_COLORS = [
  "#000000",
  "#cd3131",
  "#0dbc79",
  "#e5e510",
  "#2472c8",
  "#bc3fbc",
  "#11a8cd",
  "#e5e5e5",
] as const;
const ANSI_BRIGHT_COLORS = [
  "#666666",
  "#f14c4c",
  "#23d18b",
  "#f5f543",
  "#3b8eea",
  "#d670d6",
  "#29b8db",
  "#ffffff",
] as const;

function xterm256Color(index: number): string | undefined {
  if (index < 8) return ANSI_COLORS[index];
  if (index < 16) return ANSI_BRIGHT_COLORS[index - 8];
  if (index < 232) {
    const cube = index - 16;
    const level = (value: number) => (value === 0 ? 0 : 55 + value * 40);
    return `rgb(${level(Math.floor(cube / 36))}, ${level(Math.floor(cube / 6) % 6)}, ${level(cube % 6)})`;
  }
  if (index < 256) {
    const gray = 8 + (index - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
  }
  return undefined;
}

function applySgr(style: StatusLineSpanStyle, params: ReadonlyArray<number>): StatusLineSpanStyle {
  let next: { -readonly [Key in keyof StatusLineSpanStyle]: StatusLineSpanStyle[Key] } = {
    ...style,
  };
  for (let index = 0; index < params.length; index += 1) {
    const code = params[index] ?? 0;
    if (code === 0) next = {};
    else if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 22) {
      delete next.bold;
      delete next.dim;
    } else if (code === 23) delete next.italic;
    else if (code === 24) delete next.underline;
    else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      const color = code < 90 ? ANSI_COLORS[code - 30] : ANSI_BRIGHT_COLORS[code - 90];
      if (color !== undefined) next.color = color;
    } else if (code === 39) delete next.color;
    else if (code === 38 || code === 48) {
      const mode = params[index + 1];
      const color =
        mode === 5
          ? xterm256Color(params[index + 2] ?? -1)
          : mode === 2
            ? `rgb(${params[index + 2] ?? 0}, ${params[index + 3] ?? 0}, ${params[index + 4] ?? 0})`
            : undefined;
      index += mode === 5 ? 2 : mode === 2 ? 4 : 0;
      // Background colours fight the app theme, so only foreground is kept.
      if (code === 38 && color !== undefined) next.color = color;
    }
  }
  return next;
}

const ESCAPE_PATTERN = /\u001b(?:\[([0-9;]*)([A-Za-z])|\][^\u0007\u001b]*(?:\u0007|\u001b\\))/gu;

/** Claude Code statusline scripts print ANSI SGR; map it onto styled spans and drop other escapes. */
export function parseStatusLineAnsi(line: string): ReadonlyArray<StatusLineSpan> {
  const spans: StatusLineSpan[] = [];
  let style: StatusLineSpanStyle = {};
  let cursor = 0;
  const push = (text: string) => {
    if (text.length > 0) spans.push({ text, style });
  };
  for (const match of line.matchAll(ESCAPE_PATTERN)) {
    push(line.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (match[2] === "m") {
      const params = (match[1] ?? "").split(";").map((part) => Number.parseInt(part || "0", 10));
      style = applySgr(style, params);
    }
  }
  push(line.slice(cursor));
  return spans;
}

export interface StatusLineRow {
  readonly id: string;
  readonly spans: ReadonlyArray<StatusLineSpan & { readonly id: string }>;
}

/** Output lines have no identity beyond their position, so ids are positional. */
export function toStatusLineRows(lines: ReadonlyArray<string>): ReadonlyArray<StatusLineRow> {
  return lines.map((line, lineIndex) => ({
    id: `line-${lineIndex}`,
    spans: parseStatusLineAnsi(line).map((span, spanIndex) => ({
      ...span,
      id: `span-${lineIndex}-${spanIndex}`,
    })),
  }));
}

/** Falls back to the model's default effort, which the picker shows but the selection omits. */
export function resolveStatusLineEffort(
  selection: ModelSelection | null | undefined,
  models: ReadonlyArray<ServerProviderModel>,
  reportedSelection: ModelSelection | null | undefined,
): string | undefined {
  if (!selection) return undefined;
  const descriptor = models
    .find((model) => model.slug === selection.model)
    ?.capabilities?.optionDescriptors?.find((candidate) => candidate.id === "effort");
  const value = descriptor
    ? getProviderOptionCurrentValue(descriptor, selection, reportedSelection)
    : selection.options?.find((option) => option.id === "effort")?.value;
  return typeof value === "string" ? value : undefined;
}

export function buildStatusLineRenderInput(input: {
  readonly cwd: string | null;
  readonly projectDir: string | null;
  readonly sessionId: string | null;
  readonly modelId: string | null | undefined;
  readonly modelDisplayName: string | null;
  readonly effort: string | undefined;
  readonly contextWindow: ContextWindowSnapshot | null;
}): StatusLineRenderInput | null {
  const cwd = input.cwd?.trim();
  const modelId = input.modelId?.trim();
  if (!cwd || !modelId) return null;
  const context = input.contextWindow;
  return {
    cwd,
    ...(input.projectDir ? { projectDir: input.projectDir } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    model: { id: modelId, displayName: input.modelDisplayName?.trim() || modelId },
    ...(input.effort ? { effort: input.effort } : {}),
    ...(context
      ? {
          contextWindow: {
            usedTokens: context.usedTokens,
            ...(context.maxTokens !== null ? { maxTokens: context.maxTokens } : {}),
            ...(context.usedPercentage !== null ? { usedPercentage: context.usedPercentage } : {}),
            ...(context.inputTokens !== null ? { inputTokens: context.inputTokens } : {}),
            ...(context.outputTokens !== null ? { outputTokens: context.outputTokens } : {}),
            ...(context.cachedInputTokens !== null
              ? { cachedInputTokens: context.cachedInputTokens }
              : {}),
          },
        }
      : {}),
    ...(context?.cost && context.cost.currency === "USD" ? { costUsd: context.cost.amount } : {}),
  };
}
