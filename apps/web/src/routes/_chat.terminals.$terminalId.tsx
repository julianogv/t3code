import { createFileRoute } from "@tanstack/react-router";

import { GlobalTerminalPage } from "../components/terminal/GlobalTerminalPage";

function GlobalTerminalRouteView() {
  const { terminalId } = Route.useParams();
  return <GlobalTerminalPage terminalId={terminalId} />;
}

export const Route = createFileRoute("/_chat/terminals/$terminalId")({
  component: GlobalTerminalRouteView,
});
