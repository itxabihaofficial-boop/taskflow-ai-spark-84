// TanStack Query hooks for workspace data. Server responses are the source of
// truth; drag-and-drop moves are applied optimistically and rolled back on error.
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { api } from "./api";
import {
  COLUMNS,
  type ActivityItem,
  type Billing,
  type Board,
  type BoardSummary,
  type Integrations,
  type NotificationItem,
  type SearchResults,
  type SlackEvent,
  type TaskLink,
  type Column,
  type Dashboard,
  type Role,
  type Standup,
  type StandupPeriod,
  type Task,
  type TaskInput,
  type TaskPatch,
  type TeamDetail,
  type TeamSummary,
} from "./types";

export const qk = {
  teams: ["teams"] as const,
  team: (teamId: string) => ["team", teamId] as const,
  boards: (teamId: string) => ["boards", teamId] as const,
  tasks: (boardId: string) => ["tasks", boardId] as const,
  task: (key: string) => ["task", key] as const,
  taskActivity: (key: string) => ["task-activity", key] as const,
  dashboard: (teamId: string) => ["dashboard", teamId] as const,
  // Online user ids per team; written only by the real-time layer.
  presence: (teamId: string) => ["presence", teamId] as const,
  notifications: ["notifications"] as const,
  search: (teamId: string, q: string) => ["search", teamId, q] as const,
  billing: (teamId: string) => ["billing", teamId] as const,
  integrations: (teamId: string) => ["integrations", teamId] as const,
  standup: (teamId: string, period?: StandupPeriod) =>
    period ? (["standup", teamId, period] as const) : (["standup", teamId] as const),
};

type TaskResponse = { task: Task };
type TeamResponse = { team: TeamDetail };

// ---------------------------------------------------------------------------
// Queries

// The active workspace comes from the user's saved preference (first workspace otherwise);
// the active board is chosen per workspace by the caller (first board otherwise).
export function useWorkspace(activeTeamId: string | null, boardFor: (teamId: string) => string | null) {
  const teams = useQuery({
    queryKey: qk.teams,
    queryFn: () => api<{ teams: TeamSummary[] }>("/api/teams").then((r) => r.teams),
  });
  const team = teams.data?.find((t) => t.id === activeTeamId) ?? teams.data?.[0] ?? null;
  const teamId = team?.id ?? "";

  const detail = useQuery({
    queryKey: qk.team(teamId),
    queryFn: () => api<TeamResponse>(`/api/teams/${teamId}`).then((r) => r.team),
    enabled: Boolean(team),
  });
  const boards = useQuery({
    queryKey: qk.boards(teamId),
    queryFn: () => api<{ boards: BoardSummary[] }>(`/api/teams/${teamId}/boards`).then((r) => r.boards),
    enabled: Boolean(team),
  });
  const presence = useQuery({
    queryKey: qk.presence(teamId),
    queryFn: () => [] as string[],
    enabled: false,
  });

  // Live presence (when known) overrides the snapshot from the team request.
  const teamDetail = useMemo(() => {
    if (!detail.data) return null;
    const online = presence.data;
    if (!online) return detail.data;
    return { ...detail.data, members: detail.data.members.map((m) => ({ ...m, online: online.includes(m.id) })) };
  }, [detail.data, presence.data]);

  const boardList = boards.data ?? [];
  const activeBoardId = team ? boardFor(team.id) : null;
  return {
    teams: teams.data ?? [],
    team,
    teamDetail,
    members: teamDetail?.members ?? [],
    boards: boardList,
    board: boardList.find((b) => b.id === activeBoardId) ?? boardList[0] ?? null,
    isLoading: teams.isPending || (Boolean(team) && (boards.isPending || detail.isPending)),
    error: teams.error ?? boards.error ?? detail.error ?? null,
  };
}

export function useBoardTasks(boardId: string | undefined) {
  return useQuery({
    queryKey: qk.tasks(boardId ?? ""),
    queryFn: () => api<{ tasks: Task[] }>(`/api/boards/${boardId}/tasks`).then((r) => sortTasks(r.tasks)),
    enabled: Boolean(boardId),
  });
}

export function useDashboard(teamId: string | undefined) {
  return useQuery({
    queryKey: qk.dashboard(teamId ?? ""),
    queryFn: () => api<Dashboard>(`/api/teams/${teamId}/dashboard`),
    enabled: Boolean(teamId),
  });
}

export function useStandup(teamId: string | undefined, period: StandupPeriod) {
  return useQuery({
    queryKey: qk.standup(teamId ?? "", period),
    queryFn: () => api<{ standup: Standup }>(`/api/teams/${teamId}/standup?period=${period}`).then((r) => r.standup),
    enabled: Boolean(teamId),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRefreshStandup(teamId: string | undefined, period: StandupPeriod) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ standup: Standup }>(`/api/teams/${teamId}/standup?period=${period}&refresh=1`).then((r) => r.standup),
    onSuccess: (standup) => qc.setQueryData(qk.standup(teamId ?? "", period), standup),
  });
}

export function useTask(key: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.task(key ?? ""),
    queryFn: () => api<TaskResponse>(`/api/tasks/${key}`).then((r) => r.task),
    enabled: Boolean(key),
    placeholderData: () => (key ? findCachedTask(qc, key) : undefined),
  });
}

export function useTaskActivity(key: string | null) {
  return useQuery({
    queryKey: qk.taskActivity(key ?? ""),
    queryFn: () => api<{ activity: ActivityItem[] }>(`/api/tasks/${key}/activity`).then((r) => r.activity),
    enabled: Boolean(key),
  });
}

// ---------------------------------------------------------------------------
// Cache helpers (also used by the real-time layer)

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => COLUMNS.indexOf(a.column) - COLUMNS.indexOf(b.column) || a.position - b.position);
}

export function findCachedTask(qc: QueryClient, key: string): Task | undefined {
  for (const [, list] of qc.getQueriesData<Task[]>({ queryKey: ["tasks"] })) {
    const hit = list?.find((t) => t.id === key);
    if (hit) return hit;
  }
  return undefined;
}

export function mergeTask(qc: QueryClient, task: Task) {
  qc.setQueryData<Task[]>(qk.tasks(task.boardId), (list) => {
    if (!list) return list;
    const exists = list.some((t) => t._id === task._id);
    return sortTasks(exists ? list.map((t) => (t._id === task._id ? { ...t, ...task } : t)) : [...list, task]);
  });
  qc.setQueryData<Task>(qk.task(task.id), (prev) => (prev ? { ...prev, ...task } : prev));
}

export function removeTask(qc: QueryClient, task: Pick<Task, "_id" | "id" | "boardId">) {
  qc.setQueryData<Task[]>(qk.tasks(task.boardId), (list) => list?.filter((t) => t._id !== task._id));
  qc.removeQueries({ queryKey: qk.task(task.id) });
  qc.removeQueries({ queryKey: qk.taskActivity(task.id) });
}

// Reorders a cached board list as if `key` were dropped at `index` in `column`.
export function applyMove(list: Task[], key: string, column: Column, index: number): Task[] {
  const moving = list.find((t) => t.id === key);
  if (!moving) return list;
  const rest = list.filter((t) => t.id !== key);
  const byPosition = (a: Task, b: Task) => a.position - b.position;
  const updated = new Map<string, Task>();

  const target = rest.filter((t) => t.column === column).sort(byPosition);
  target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...moving, column });
  target.forEach((t, i) => updated.set(t.id, { ...t, position: i }));
  if (moving.column !== column) {
    rest
      .filter((t) => t.column === moving.column)
      .sort(byPosition)
      .forEach((t, i) => updated.set(t.id, { ...t, position: i }));
  }
  return sortTasks([...rest.filter((t) => !updated.has(t.id)), ...updated.values()]);
}

function invalidateAround(qc: QueryClient, task: Pick<Task, "id" | "teamId">) {
  void qc.invalidateQueries({ queryKey: qk.dashboard(task.teamId) });
  void qc.invalidateQueries({ queryKey: qk.taskActivity(task.id) });
}

// ---------------------------------------------------------------------------
// Task mutations

export function useCreateTask(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TaskInput) =>
      api<TaskResponse>(`/api/boards/${boardId}/tasks`, { method: "POST", body: input }).then((r) => r.task),
    onSuccess: (task) => {
      qc.setQueryData(qk.task(task.id), task);
      mergeTask(qc, task);
      invalidateAround(qc, task);
    },
  });
}

export function useMoveTask(boardId: string | undefined) {
  const qc = useQueryClient();
  const listKey = qk.tasks(boardId ?? "");
  return useMutation({
    mutationFn: ({ key, column, position }: { key: string; column: Column; position: number }) =>
      api<TaskResponse>(`/api/tasks/${key}/move`, { method: "POST", body: { column, position } }).then((r) => r.task),
    onMutate: async ({ key, column, position }) => {
      await qc.cancelQueries({ queryKey: listKey });
      const previous = qc.getQueryData<Task[]>(listKey);
      if (previous) qc.setQueryData(listKey, applyMove(previous, key, column, position));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey, ctx.previous);
    },
    onSuccess: (task) => {
      mergeTask(qc, task);
      invalidateAround(qc, task);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey }),
  });
}

function useTaskAction<V>(request: (vars: V) => Promise<TaskResponse>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => request(vars).then((r) => r.task),
    onSuccess: (task) => {
      mergeTask(qc, task);
      invalidateAround(qc, task);
    },
  });
}

export const useUpdateTask = () =>
  useTaskAction(({ key, patch }: { key: string; patch: TaskPatch }) =>
    api<TaskResponse>(`/api/tasks/${key}`, { method: "PATCH", body: patch }),
  );

export const useAddComment = () =>
  useTaskAction(({ key, body }: { key: string; body: string }) =>
    api<TaskResponse>(`/api/tasks/${key}/comments`, { method: "POST", body: { body } }),
  );

export const useAddSubtask = () =>
  useTaskAction(({ key, title }: { key: string; title: string }) =>
    api<TaskResponse>(`/api/tasks/${key}/subtasks`, { method: "POST", body: { title } }),
  );

// Checkbox toggles apply instantly and roll back if the server rejects them.
export function useUpdateSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, subtaskId, done }: { key: string; subtaskId: string; done: boolean }) =>
      api<TaskResponse>(`/api/tasks/${key}/subtasks/${subtaskId}`, { method: "PATCH", body: { done } }).then((r) => r.task),
    onMutate: async ({ key, subtaskId, done }) => {
      await qc.cancelQueries({ queryKey: qk.task(key) });
      const previous = qc.getQueryData<Task>(qk.task(key));
      if (previous?.subtaskList) {
        const subtaskList = previous.subtaskList.map((s) => (s.id === subtaskId ? { ...s, done } : s));
        const subtasksDone = subtaskList.filter((s) => s.done).length;
        qc.setQueryData<Task>(qk.task(key), {
          ...previous,
          subtaskList,
          subtasksDone,
          subtasks: `${subtasksDone}/${subtaskList.length}`,
        });
      }
      return { previous };
    },
    onError: (_err, { key }, ctx) => {
      if (ctx?.previous) qc.setQueryData(qk.task(key), ctx.previous);
    },
    onSuccess: (task) => {
      mergeTask(qc, task);
      invalidateAround(qc, task);
    },
  });
}

export const useDeleteSubtask = () =>
  useTaskAction(({ key, subtaskId }: { key: string; subtaskId: string }) =>
    api<TaskResponse>(`/api/tasks/${key}/subtasks/${subtaskId}`, { method: "DELETE" }),
  );

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: Task) => api(`/api/tasks/${task.id}`, { method: "DELETE" }).then(() => task),
    onSuccess: (task) => {
      removeTask(qc, task);
      void qc.invalidateQueries({ queryKey: qk.dashboard(task.teamId) });
    },
  });
}

// ---------------------------------------------------------------------------
// AI Assist

export type AssistResult = {
  intent: "create_task" | "add_subtasks" | "summarize_comments" | "unsupported";
  reply: string;
  source: "llm" | "rules";
  model: string | null;
  notice: string | null;
  task?: Task;
  summary?: string;
  subtasksAdded?: string[];
};

export function useAiAssist(boardId: string) {
  const qc = useQueryClient();
  return useMutation({
    // taskKey gives the assistant the open task as context (subtasks, comment summaries).
    mutationFn: ({ text, taskKey }: { text: string; taskKey?: string }) =>
      api<AssistResult>("/api/ai/assist", { method: "POST", body: { text, boardId, ...(taskKey && { taskKey }) } }),
    onSuccess: (result) => {
      if (!result.task) return;
      qc.setQueryData<Task>(qk.task(result.task.id), (prev) => ({ ...prev, ...result.task! }));
      mergeTask(qc, result.task);
      invalidateAround(qc, result.task);
    },
  });
}

// ---------------------------------------------------------------------------
// Team mutations

export function useUpdateMember(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, patch }: { userId: string; patch: { role?: Role; canManage?: boolean } }) =>
      api<TeamResponse>(`/api/teams/${teamId}/members/${userId}`, { method: "PATCH", body: patch }).then((r) => r.team),
    onSuccess: (team) => {
      qc.setQueryData(qk.team(team.id), team);
      void qc.invalidateQueries({ queryKey: qk.teams });
    },
  });
}

export function useInvite(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: Role }) =>
      api<TeamResponse & { status: "added" | "invited" }>(`/api/teams/${teamId}/invites`, { method: "POST", body }),
    onSuccess: ({ team }) => qc.setQueryData(qk.team(team.id), team),
  });
}

export function useRevokeInvite(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      api<TeamResponse>(`/api/teams/${teamId}/invites/${inviteId}`, { method: "DELETE" }).then((r) => r.team),
    onSuccess: (team) => qc.setQueryData(qk.team(team.id), team),
  });
}

// ---------------------------------------------------------------------------
// Workspaces

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string }) =>
      api<TeamResponse>("/api/teams", { method: "POST", body }).then((r) => r.team),
    onSuccess: (team) => {
      qc.setQueryData(qk.team(team.id), team);
      void qc.invalidateQueries({ queryKey: qk.teams });
    },
  });
}

export function useRenameTeam(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; description?: string }) =>
      api<TeamResponse>(`/api/teams/${teamId}`, { method: "PATCH", body }).then((r) => r.team),
    onSuccess: (team) => {
      qc.setQueryData(qk.team(team.id), team);
      void qc.invalidateQueries({ queryKey: qk.teams });
    },
  });
}

// Removing someone else returns the updated team; removing yourself means leaving.
export function useRemoveMember(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<TeamResponse | null>(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: (res) => {
      if (res?.team) qc.setQueryData(qk.team(res.team.id), res.team);
      void qc.invalidateQueries({ queryKey: qk.teams });
    },
  });
}

// ---------------------------------------------------------------------------
// Boards

export function useCreateBoard(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; category?: string; key?: string }) =>
      api<{ board: BoardSummary }>(`/api/teams/${teamId}/boards`, { method: "POST", body }).then((r) => r.board),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.boards(teamId ?? "") }),
  });
}

export function useUpdateBoard(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, patch }: { boardId: string; patch: { name?: string; description?: string; category?: string } }) =>
      api<{ board: Board }>(`/api/boards/${boardId}`, { method: "PATCH", body: patch }).then((r) => r.board),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.boards(teamId ?? "") }),
  });
}

export function useDeleteBoard(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => api(`/api/boards/${boardId}`, { method: "DELETE" }).then(() => boardId),
    onSuccess: (boardId) => {
      qc.removeQueries({ queryKey: qk.tasks(boardId) });
      void qc.invalidateQueries({ queryKey: qk.boards(teamId ?? "") });
      void qc.invalidateQueries({ queryKey: qk.dashboard(teamId ?? "") });
    },
  });
}

export type SortBy = "due" | "priority" | "risk" | "title";

export function useSortColumn(boardId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ column, by }: { column: Column; by: SortBy }) =>
      api<{ tasks: Task[] }>(`/api/boards/${boardId}/sort`, { method: "POST", body: { column, by } }).then((r) => r.tasks),
    onSuccess: (tasks) => qc.setQueryData(qk.tasks(boardId ?? ""), sortTasks(tasks)),
  });
}

// ---------------------------------------------------------------------------
// Task links

export const useAddLink = () =>
  useTaskAction(({ key, url, title }: { key: string; url: string; title?: string }) =>
    api<TaskResponse>(`/api/tasks/${key}/links`, { method: "POST", body: { url, ...(title ? { title } : {}) } }),
  );

export const useRemoveLink = () =>
  useTaskAction(({ key, linkId }: { key: string; linkId: TaskLink["id"] }) =>
    api<TaskResponse>(`/api/tasks/${key}/links/${linkId}`, { method: "DELETE" }),
  );

// ---------------------------------------------------------------------------
// Search

export function useSearch(teamId: string | undefined, query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: qk.search(teamId ?? "", q),
    queryFn: ({ signal }) =>
      api<SearchResults>(`/api/search?teamId=${teamId}&q=${encodeURIComponent(q)}`, { signal }),
    enabled: Boolean(teamId) && q.length > 0,
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });
}

// ---------------------------------------------------------------------------
// Notifications

type NotificationsResponse = { notifications: NotificationItem[]; unreadCount: number };

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<NotificationsResponse>("/api/notifications?limit=30"),
    refetchInterval: 5 * 60_000,
  });
}

// Applies a read receipt to the cached list (also used for events from other tabs).
export function applyRead(qc: QueryClient, ids: string[] | null, unreadCount?: number) {
  qc.setQueryData<NotificationsResponse>(qk.notifications, (prev) => {
    if (!prev) return prev;
    const notifications = prev.notifications.map((n) => (ids === null || ids.includes(n.id) ? { ...n, read: true } : n));
    return { notifications, unreadCount: unreadCount ?? notifications.filter((n) => !n.read).length };
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[] | "all") =>
      api<{ unreadCount: number }>("/api/notifications/read", {
        method: "POST",
        body: ids === "all" ? { all: true } : { ids },
      }),
    onMutate: (ids) => applyRead(qc, ids === "all" ? null : ids),
    onSuccess: (res, ids) => applyRead(qc, ids === "all" ? null : ids, res.unreadCount),
  });
}

// ---------------------------------------------------------------------------
// Billing

export function useBilling(teamId: string | undefined) {
  return useQuery({
    queryKey: qk.billing(teamId ?? ""),
    queryFn: () => api<{ billing: Billing }>(`/api/teams/${teamId}/billing`).then((r) => r.billing),
    enabled: Boolean(teamId),
  });
}

export function useUpgradeRequest(teamId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { tier: Billing["plan"]["tier"]; seats?: number; note?: string } | "cancel") =>
      body === "cancel"
        ? api<{ billing: Billing }>(`/api/teams/${teamId}/billing/upgrade-request`, { method: "DELETE" }).then((r) => r.billing)
        : api<{ billing: Billing }>(`/api/teams/${teamId}/billing/upgrade-request`, { method: "POST", body }).then((r) => r.billing),
    onSuccess: (billing) => qc.setQueryData(qk.billing(teamId ?? ""), billing),
  });
}

export async function contactSales(body: {
  name: string;
  email: string;
  company?: string;
  teamSize?: string;
  message?: string;
}) {
  return api<{ message: string }>("/api/contact", { method: "POST", body });
}

// ---------------------------------------------------------------------------
// Integrations

type IntegrationsResponse = { integrations: Integrations };

export function useIntegrations(teamId: string | undefined) {
  return useQuery({
    queryKey: qk.integrations(teamId ?? ""),
    queryFn: () => api<IntegrationsResponse>(`/api/teams/${teamId}/integrations`).then((r) => r.integrations),
    enabled: Boolean(teamId),
  });
}

export function useIntegrationAction(teamId: string | undefined) {
  const qc = useQueryClient();
  const base = `/api/teams/${teamId}/integrations`;
  return useMutation({
    mutationFn: async (
      action:
        | { type: "slack"; webhookUrl?: string; events?: SlackEvent[] }
        | { type: "slack-test" }
        | { type: "github" }
        | { type: "figma"; token: string }
        | { type: "disconnect"; provider: "slack" | "github" | "figma" },
    ) => {
      switch (action.type) {
        case "slack": {
          const { type: _type, ...body } = action;
          return api<IntegrationsResponse & { secret?: string }>(`${base}/slack`, { method: "PUT", body });
        }
        case "slack-test":
          return api<IntegrationsResponse & { secret?: string }>(`${base}/slack/test`, { method: "POST" });
        case "github":
          return api<IntegrationsResponse & { secret?: string }>(`${base}/github`, { method: "POST" });
        case "figma":
          return api<IntegrationsResponse & { secret?: string }>(`${base}/figma`, { method: "PUT", body: { token: action.token } });
        case "disconnect":
          return api<IntegrationsResponse & { secret?: string }>(`${base}/${action.provider}`, { method: "DELETE" });
      }
    },
    onSuccess: (res) => qc.setQueryData(qk.integrations(teamId ?? ""), res.integrations),
  });
}
