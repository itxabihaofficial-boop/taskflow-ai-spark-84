// Sidebar workspace switcher and the "new workspace" dialog.
import { Check, ChevronDown, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";
import { useCreateTeam } from "@/lib/queries";
import type { TeamSummary } from "@/lib/types";

import { FormMessage, Modal, PopMenu, plural } from "./ui";

export function WorkspaceSwitcher({
  teams,
  team,
  loading,
  onSwitch,
}: {
  teams: TeamSummary[];
  team: TeamSummary | null;
  loading: boolean;
  onSwitch: (teamId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const title = team?.name ?? (loading ? "Loading…" : "No workspace");
  return (
    <div className="menu-wrap workspace-wrap">
      <button
        className="workspace"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Workspace: ${title}. Switch workspace`}
        title={team ? `${team.name} · ${plural(team.memberCount, "member")}` : title}
        onClick={() => setOpen(!open)}
      >
        <span className="workspace-mark">{team?.name.charAt(0).toUpperCase() ?? "·"}</span>
        <span className="workspace-copy">
          <strong>{title}</strong>
          <small>
            {team ? team.description || "Team workspace" : "Create one to get started"}
            {team && team.plan !== "Free" ? ` · ${team.plan}` : ""}
          </small>
        </span>
        <ChevronDown />
      </button>
      {open && (
        <PopMenu className="workspace-menu" onClose={() => setOpen(false)}>
          <p>Your workspaces</p>
          {teams.map((t) => (
            <button
              key={t.id}
              role="menuitemradio"
              aria-checked={t.id === team?.id}
              onClick={() => {
                setOpen(false);
                if (t.id !== team?.id) onSwitch(t.id);
              }}
            >
              <span className="workspace-mark small">{t.name.charAt(0).toUpperCase()}</span>
              <span>
                {t.name}
                <small>
                  {t.myRole} · {plural(t.memberCount, "member")}
                </small>
              </span>
              {t.id === team?.id && <Check />}
            </button>
          ))}
          <button
            onClick={() => {
              setOpen(false);
              setCreating(true);
            }}
          >
            <Plus />
            <span>New workspace</span>
          </button>
        </PopMenu>
      )}
      {creating && (
        <CreateWorkspaceModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            onSwitch(created.id);
          }}
        />
      )}
    </div>
  );
}

export function CreateWorkspaceModal({ onClose, onCreated }: { onClose: () => void; onCreated: (team: { id: string; name: string }) => void }) {
  const create = useCreateTeam();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    create.mutate(
      { name: name.trim(), ...(description.trim() ? { description: description.trim() } : {}) },
      {
        onSuccess: (team) => {
          toast.success(`Created ${team.name}`);
          onCreated(team);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  return (
    <Modal title="New workspace" description="A separate space with its own members, boards and plan." onClose={onClose}>
      <form className="modal-body form-grid" onSubmit={submit}>
        <label className="full">
          Workspace name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme Marketing" required minLength={2} maxLength={80} />
        </label>
        <label className="full">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Team workspace" maxLength={120} />
        </label>
        <div className="full">
          <FormMessage error={error} />
        </div>
        <div className="modal-actions full">
          <button type="button" className="outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={create.isPending || name.trim().length < 2}>
            {create.isPending ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
