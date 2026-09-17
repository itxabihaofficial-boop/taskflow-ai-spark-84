// Board picker (switch / create / edit / delete), column menu and the List view.
import { ArrowDownUp, CalendarDays, Check, ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";
import { useCreateBoard, useDeleteBoard, useSortColumn, useUpdateBoard, type SortBy } from "@/lib/queries";
import { COLUMNS, PRIORITIES, type BoardSummary, type Column, type Task, type TeamSummary } from "@/lib/types";

import { Avatar, FormMessage, Modal, PopMenu, notify } from "./ui";

type BoardForm = { name: string; category: string; description: string; key: string };

export function BoardPicker({
  team,
  boards,
  board,
  onSelect,
}: {
  team: TeamSummary | null;
  boards: BoardSummary[];
  board: BoardSummary | null;
  onSelect: (boardId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const remove = useDeleteBoard(team?.id);
  const canManage = team?.canManage ?? false;

  const destroy = () => {
    setOpen(false);
    if (!board) return;
    if (!window.confirm(`Delete the board “${board.name}” and all of its tasks? This can’t be undone.`)) return;
    const next = boards.find((b) => b.id !== board.id);
    remove.mutate(board.id, {
      onSuccess: () => {
        toast.success(`Deleted ${board.name}`);
        if (next) onSelect(next.id);
      },
      onError: notify("Couldn’t delete the board"),
    });
  };

  return (
    <div className="menu-wrap">
      <button className="board-picker" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{board?.name ?? "Boards"}</span>
        {boards.length > 1 && <small title={`${boards.length} boards in this workspace`}>{boards.length}</small>}
        <ChevronDown />
      </button>
      {open && (
        <PopMenu className="board-menu" onClose={() => setOpen(false)}>
          <p>Boards in {team?.name ?? "this workspace"}</p>
          {boards.map((b) => (
            <button
              key={b.id}
              role="menuitemradio"
              aria-checked={b.id === board?.id}
              onClick={() => {
                setOpen(false);
                onSelect(b.id);
              }}
            >
              <span>
                {b.name}
                <small>
                  {b.key} · {b.openTasks} open
                </small>
              </span>
              {b.id === board?.id && <Check />}
            </button>
          ))}
          <hr />
          <button
            disabled={!canManage}
            title={canManage ? undefined : "Ask a manager to create boards"}
            onClick={() => {
              setOpen(false);
              setDialog("create");
            }}
          >
            <Plus />
            <span>New board</span>
          </button>
          <button
            disabled={!canManage || !board}
            onClick={() => {
              setOpen(false);
              setDialog("edit");
            }}
          >
            <Pencil />
            <span>Edit board details</span>
          </button>
          <button className="danger" disabled={!canManage || boards.length < 2} title={boards.length < 2 ? "A workspace needs at least one board" : undefined} onClick={destroy}>
            <Trash2 />
            <span>Delete board</span>
          </button>
        </PopMenu>
      )}
      {dialog && (
        <BoardFormModal
          mode={dialog}
          teamId={team?.id}
          board={dialog === "edit" ? board : null}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setDialog(null);
            onSelect(saved.id);
          }}
        />
      )}
    </div>
  );
}

const keyFrom = (name: string) =>
  (name.match(/[A-Za-z]+/g) ?? [])
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(2, "X");

function BoardFormModal({
  mode,
  teamId,
  board,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  teamId: string | undefined;
  board: BoardSummary | null;
  onClose: () => void;
  onSaved: (board: { id: string }) => void;
}) {
  const create = useCreateBoard(teamId);
  const update = useUpdateBoard(teamId);
  const [form, setForm] = useState<BoardForm>({
    name: board?.name ?? "",
    category: board?.category ?? "",
    description: board?.description ?? "",
    key: board?.key ?? "",
  });
  const [keyTouched, setKeyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = create.isPending || update.isPending;
  const key = keyTouched || mode === "edit" ? form.key : keyFrom(form.name);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const details = {
      name: form.name.trim(),
      category: form.category.trim().toUpperCase(),
      description: form.description.trim(),
    };
    const done = {
      onSuccess: (saved: { id: string; name: string }) => {
        toast.success(mode === "create" ? `Created ${saved.name}` : "Board updated");
        onSaved(saved);
      },
      onError: (err: unknown) => setError(errorMessage(err)),
    };
    if (mode === "create") create.mutate({ ...details, key }, done);
    else if (board) update.mutate({ boardId: board.id, patch: details }, done);
  };

  return (
    <Modal
      title={mode === "create" ? "New board" : "Edit board"}
      description={mode === "create" ? "Boards group related work. Task ids use the board key (e.g. OPS-12)." : undefined}
      onClose={onClose}
    >
      <form className="modal-body form-grid" onSubmit={submit}>
        <label className="full">
          Board name
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Launch roadmap" required maxLength={80} />
        </label>
        <label>
          Label
          <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="PRODUCT & ENGINEERING" maxLength={40} />
        </label>
        <label>
          Task key
          <input
            value={key}
            disabled={mode === "edit"}
            onChange={(e) => {
              setKeyTouched(true);
              setForm({ ...form, key: e.target.value.toUpperCase() });
            }}
            pattern="[A-Za-z]{2,6}"
            title="2–6 letters"
            maxLength={6}
            required
          />
        </label>
        <label className="full">
          Description
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this board is for" maxLength={200} />
        </label>
        <div className="full">
          <FormMessage error={error} />
        </div>
        <div className="modal-actions full">
          <button type="button" className="outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={busy || !form.name.trim()}>
            {busy ? "Saving…" : mode === "create" ? "Create board" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SORTS: [SortBy, string][] = [
  ["due", "Sort by due date"],
  ["priority", "Sort by priority"],
  ["risk", "Sort by deadline risk"],
  ["title", "Sort by title"],
];

export function ColumnMenu({ boardId, column, onAdd }: { boardId: string | undefined; column: Column; onAdd: () => void }) {
  const [open, setOpen] = useState(false);
  const sort = useSortColumn(boardId);
  return (
    <span className="menu-wrap">
      <button aria-label={`${column} options`} aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal />
      </button>
      {open && (
        <PopMenu onClose={() => setOpen(false)}>
          <button
            onClick={() => {
              setOpen(false);
              onAdd();
            }}
          >
            <Plus />
            <span>Add task</span>
          </button>
          <hr />
          {SORTS.map(([by, label]) => (
            <button
              key={by}
              disabled={!boardId}
              onClick={() => {
                setOpen(false);
                sort.mutate({ column, by }, { onSuccess: () => toast.success(`${column}: ${label.toLowerCase()}`), onError: notify("Couldn’t sort the column") });
              }}
            >
              <ArrowDownUp />
              <span>{label}</span>
            </button>
          ))}
        </PopMenu>
      )}
    </span>
  );
}

type ListSort = "status" | "title" | "priority" | "risk" | "due";
const PRIORITY_ORDER = [...PRIORITIES].reverse();
const RISK_ORDER = ["High", "Medium", "Low"];

export function ListView({ tasks, loading, selected, onOpen }: { tasks: Task[]; loading: boolean; selected: string | null; onOpen: (key: string) => void }) {
  const [sort, setSort] = useState<{ by: ListSort; dir: 1 | -1 }>({ by: "status", dir: 1 });
  const rows = useMemo(() => {
    const cmp: Record<ListSort, (a: Task, b: Task) => number> = {
      status: (a, b) => COLUMNS.indexOf(a.column) - COLUMNS.indexOf(b.column) || a.position - b.position,
      title: (a, b) => a.title.localeCompare(b.title),
      priority: (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority),
      risk: (a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1) || RISK_ORDER.indexOf(a.risk) - RISK_ORDER.indexOf(b.risk),
      due: (a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    };
    return [...tasks].sort((a, b) => cmp[sort.by](a, b) * sort.dir);
  }, [tasks, sort]);

  const header = (by: ListSort, label: string) => (
    <button
      className={sort.by === by ? "active" : ""}
      aria-sort={sort.by === by ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      onClick={() => setSort(sort.by === by ? { by, dir: sort.dir === 1 ? -1 : 1 } : { by, dir: 1 })}
    >
      {label}
      {sort.by === by && <ArrowDownUp />}
    </button>
  );

  return (
    <section className="panel list-view" aria-label="Tasks as a list">
      <div className="list-head">
        {header("title", "Task")}
        {header("status", "Status")}
        {header("priority", "Priority")}
        {header("risk", "Risk")}
        {header("due", "Due")}
        <span>Assignees</span>
      </div>
      {loading && <p className="empty-state">Loading…</p>}
      {!loading && rows.length === 0 && <p className="empty-state">No tasks match these filters.</p>}
      {rows.map((t) => (
        <button key={t.id} data-key={t.id} className={selected === t.id ? "list-row selected" : "list-row"} onClick={() => onOpen(t.id)}>
          <span className="task-main">
            <strong>{t.title}</strong>
            <small>
              {t.id} · {t.project}
              {t.subtasksTotal ? ` · ${t.subtasks} subtasks` : ""}
            </small>
          </span>
          <span className="list-status">
            <i className={`col-dot c${COLUMNS.indexOf(t.column)}`} />
            {t.column}
          </span>
          <span>
            <span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span>
          </span>
          <span className={`risk ${t.risk.toLowerCase()}`}>
            <i />
            {t.risk}
            {t.riskScore !== null && t.column !== "Done" && <em>{Math.round(t.riskScore * 100)}%</em>}
          </span>
          <span className={t.overdue ? "due overdue" : "due"}>
            <CalendarDays />
            {t.due}
          </span>
          <span className="avatar-stack">
            {t.assignees.length === 0 && <small>Unassigned</small>}
            {t.assignees.map((a) => (
              <Avatar key={a.id} text={a.initials} src={a.avatarUrl} />
            ))}
          </span>
        </button>
      ))}
    </section>
  );
}
