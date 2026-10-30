import { useAtomValue } from "@effect/atom-react";
import { type FormEvent, useId, useState } from "react";

import {
  type GlobalTerminalDefinition,
  type GlobalTerminalDraft,
  useGlobalTerminalsStore,
} from "../../globalTerminalsStore";
import { primaryEnvironmentIdAtom } from "../../state/primaryEnvironment";
import { serverEnvironment } from "../../state/server";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

/** Creates a sidebar terminal, or edits `terminal` when one is given. */
export function GlobalTerminalEditorDialog({
  open,
  onOpenChange,
  terminal,
  defaultCwd,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminal: GlobalTerminalDefinition | null;
  defaultCwd: string | null;
  onSaved?: (terminal: GlobalTerminalDefinition) => void;
}) {
  // A fresh form per opening, so a reopened dialog never shows the last edit's leftovers.
  const [openCount, setOpenCount] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOpenCount(openCount + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <GlobalTerminalEditorForm
          key={openCount}
          terminal={terminal}
          defaultCwd={defaultCwd}
          onClose={() => onOpenChange(false)}
          {...(onSaved ? { onSaved } : {})}
        />
      </DialogPopup>
    </Dialog>
  );
}

function GlobalTerminalEditorForm({
  terminal,
  defaultCwd,
  onClose,
  onSaved,
}: {
  terminal: GlobalTerminalDefinition | null;
  defaultCwd: string | null;
  onClose: () => void;
  onSaved?: (terminal: GlobalTerminalDefinition) => void;
}) {
  const formId = useId();
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const addTerminal = useGlobalTerminalsStore((state) => state.addTerminal);
  const updateTerminal = useGlobalTerminalsStore((state) => state.updateTerminal);
  const [name, setName] = useState(terminal?.name ?? "");
  const [cwd, setCwd] = useState(terminal?.cwd ?? defaultCwd ?? serverConfig?.cwd ?? "");
  const [command, setCommand] = useState(terminal?.command ?? "");
  const [autostart, setAutostart] = useState(terminal?.autostart ?? false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const draft: GlobalTerminalDraft = {
      name: name.trim(),
      cwd: cwd.trim(),
      command: command.trim(),
      autostart,
    };
    if (draft.name.length === 0) return setError("Give the terminal a name.");
    if (draft.cwd.length === 0) return setError("Choose a working directory.");
    if (terminal) {
      updateTerminal(terminal.id, draft);
      onSaved?.({ ...terminal, ...draft });
    } else {
      onSaved?.(addTerminal(draft));
    }
    onClose();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{terminal ? "Edit terminal" : "New terminal"}</DialogTitle>
        <DialogDescription>
          Sidebar terminals run on this machine's T3 server and keep running while no window shows
          them.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <form id={formId} onSubmit={submit}>
          <fieldset className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-name`}>Name</Label>
              <Input
                id={`${formId}-name`}
                autoFocus
                placeholder="kiro-gateway"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-cwd`}>Working directory</Label>
              <Input
                id={`${formId}-cwd`}
                placeholder="/home/me/project"
                value={cwd}
                onChange={(event) => setCwd(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-command`}>Command (optional)</Label>
              <Input
                id={`${formId}-command`}
                placeholder="uv run python main.py"
                value={command}
                onChange={(event) => setCommand(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Typed into the shell each time it starts. Leave empty for a plain shell.
              </p>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-sm dark:border-transparent dark:bg-white/[0.035]">
              <span>Start automatically when T3 Code opens</span>
              <Switch
                checked={autostart}
                onCheckedChange={(checked) => setAutostart(Boolean(checked))}
              />
            </label>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </fieldset>
        </form>
      </DialogPanel>
      <DialogFooter variant="bare">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button form={formId} type="submit">
          {terminal ? "Save changes" : "Create terminal"}
        </Button>
      </DialogFooter>
    </>
  );
}
