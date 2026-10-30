import type {
  EnvironmentId,
  StatusLineRenderInput,
  StatusLineRenderResult,
} from "@t3tools/contracts";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { memo, useState } from "react";

import { connectionAtomRuntime } from "../../connection/runtime";
import { useEnvironmentQuery } from "../../state/query";
import { toStatusLineRows } from "./ClaudeStatusLine.logic";

const statusLineQuery = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:status-line:render",
  tag: WS_METHODS.statusLineRender,
  staleTimeMs: 5_000,
  // Scripts often probe local services (health checks, credit balances) that change on their own.
  refreshIntervalMs: 30_000,
  idleTtlMs: 15_000,
});

/** Renders the user's Claude Code `statusLine.command` output under the composer. */
export const ClaudeStatusLine = memo(function ClaudeStatusLine(props: {
  readonly environmentId: EnvironmentId;
  readonly input: StatusLineRenderInput | null;
}) {
  const query = useEnvironmentQuery(
    props.input === null
      ? null
      : statusLineQuery({ environmentId: props.environmentId, input: props.input }),
  );
  // Every token update keys a new query; keep the previous output until it answers, as the CLI does.
  const [result, setResult] = useState<StatusLineRenderResult | null>(null);
  if (query.data !== null && query.data !== result) setResult(query.data);
  if (props.input === null || result === null || !result.configured) return null;
  if (result.lines.length === 0 && result.error === undefined) return null;

  return (
    <div
      data-chat-claude-status-line="true"
      className="mx-auto w-full min-w-0 max-w-(--chat-content-max-width) px-3 pt-1.5 font-mono text-muted-foreground text-xs"
    >
      {result.lines.length > 0 ? (
        toStatusLineRows(result.lines).map((row) => (
          <div key={row.id} className="truncate whitespace-pre">
            {row.spans.map((span) => (
              <span
                key={span.id}
                style={{
                  color: span.style.color,
                  fontWeight: span.style.bold ? 600 : undefined,
                  opacity: span.style.dim ? 0.7 : undefined,
                  fontStyle: span.style.italic ? "italic" : undefined,
                  textDecoration: span.style.underline ? "underline" : undefined,
                }}
              >
                {span.text}
              </span>
            ))}
          </div>
        ))
      ) : (
        <div className="truncate text-destructive-foreground/80">statusLine: {result.error}</div>
      )}
    </div>
  );
});
