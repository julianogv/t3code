import { describe, expect, it } from "vite-plus/test";

import { parseStatusLineAnsi } from "./ClaudeStatusLine.logic";

describe("parseStatusLineAnsi", () => {
  it("maps SGR colours and weights onto spans and drops other escapes", () => {
    /** Statusline scripts colour segments with SGR and may emit OSC 8 hyperlinks. */
    expect(
      parseStatusLineAnsi(
        "\u001b[1;32mmain\u001b[0m | \u001b[38;5;196mctx 87%\u001b[39m \u001b]8;;https://x\u0007link\u001b]8;;\u0007",
      ),
    ).toEqual([
      { text: "main", style: { bold: true, color: "#0dbc79" } },
      { text: " | ", style: {} },
      { text: "ctx 87%", style: { color: "rgb(255, 0, 0)" } },
      { text: " ", style: {} },
      { text: "link", style: {} },
    ]);
  });
});
