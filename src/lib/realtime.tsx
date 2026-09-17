// Socket.io client. Server events are merged straight into the TanStack Query
// cache, so every view (board, drawer, dashboard, team page) updates live.
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";

import { API_URL, getToken, timeZone } from "./api";
import { useAuth } from "./auth";
import { applyMove, applyRead, mergeTask, qk, removeTask } from "./queries";
import type { ActivityItem, Board, Dashboard, NotificationItem, Task } from "./types";

type TaskEvent = { task: Task; actorId: string | null; changes: Record<string, unknown> };
type Ack = { ok: boolean; online?: string[]; error?: string };
type NotificationsCache = { notifications: NotificationItem[]; unreadCount: number };

const SESSION_ENDED = /logged out|expired|Invalid token|no longer exists|password was changed/i;
const RealtimeContext = createContext<{ connected: boolean; onNotification: (fn: (n: NotificationItem) => void) => () => void }>({
  connected: false,
  onNotification: () => () => {},
});

export const useRealtime = () => useContext(RealtimeContext);

export function RealtimeProvider({ boardId, children }: { boardId: string | undefined; children: ReactNode }) {
  const qc = useQueryClient();
  const { user, expireSession } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const boardRef = useRef(boardId);
  const listeners = useRef(new Set<(n: NotificationItem) => void>());
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !getToken()) return;

    // The auth callback runs on every (re)connect, so a refreshed token is always used.
    const socket = io(API_URL, {
      auth: (cb) => cb({ token: getToken(), tz: timeZone() }),
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    // Coalesce bursts of events into one refetch per query.
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const invalidateSoon = (queryKey: QueryKey) => {
      const id = JSON.stringify(queryKey);
      clearTimeout(timers.get(id));
      timers.set(id, setTimeout(() => void qc.invalidateQueries({ queryKey }), 250));
    };

    const joinBoard = () => {
      if (boardRef.current) socket.emit("board:join", boardRef.current, () => {});
    };
    let readyBefore = false;

    socket.on("session:ready", ({ teamIds }: { teamIds: string[] }) => {
      setConnected(true);
      joinBoard();
      for (const teamId of teamIds) {
        socket.emit("presence:get", teamId, (res: Ack) => {
          if (res.ok && res.online) qc.setQueryData(qk.presence(teamId), res.online);
        });
      }
      // After a reconnect we may have missed events: refresh everything.
      if (readyBefore) void qc.invalidateQueries();
      readyBefore = true;
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      // A password change disconnects every socket; reconnect with whatever token we now hold.
      if (reason === "io server disconnect") setTimeout(() => socket.connect(), 800);
    });
    socket.on("connect_error", (err) => {
      setConnected(false);
      if (SESSION_ENDED.test(err.message)) expireSession();
    });
    socket.on("session:revoked", expireSession);

    socket.on("task:created", ({ task }: TaskEvent) => mergeTask(qc, task));
    socket.on("task:updated", ({ task }: TaskEvent) => {
      mergeTask(qc, task);
      invalidateSoon(qk.taskActivity(task.id));
    });
    socket.on("task:moved", ({ task }: TaskEvent) => {
      qc.setQueryData<Task[]>(qk.tasks(task.boardId), (list) => list && applyMove(list, task.id, task.column, task.position));
      mergeTask(qc, task);
      invalidateSoon(qk.taskActivity(task.id));
    });
    socket.on("task:deleted", ({ taskId, key, boardId: fromBoard }: { taskId: string; key: string; boardId: string }) =>
      removeTask(qc, { _id: taskId, id: key, boardId: fromBoard }),
    );

    socket.on("activity:new", ({ teamId, activity }: { teamId: string; activity: ActivityItem }) => {
      qc.setQueryData<Dashboard>(qk.dashboard(teamId), (d) =>
        d && { ...d, activity: [activity, ...d.activity.filter((a) => a.id !== activity.id)].slice(0, 20) },
      );
      // A deleted task has no history left to fetch.
      if (activity.taskKey && activity.type !== "task.deleted") invalidateSoon(qk.taskActivity(activity.taskKey));
    });
    socket.on("team:tasks-changed", ({ teamId }: { teamId: string }) => {
      invalidateSoon(qk.dashboard(teamId));
      invalidateSoon(qk.standup(teamId)); // the server caches briefs, so this is cheap
    });
    socket.on("team:updated", ({ teamId }: { teamId: string }) => {
      invalidateSoon(qk.team(teamId));
      invalidateSoon(qk.teams);
      invalidateSoon(qk.integrations(teamId));
      invalidateSoon(qk.billing(teamId));
    });
    socket.on("board:changed", ({ action, board }: { action: string; board: Board }) => {
      invalidateSoon(qk.boards(board.teamId));
      if (action === "reordered" || action === "updated") invalidateSoon(qk.tasks(board.id));
      if (action === "deleted") qc.removeQueries({ queryKey: qk.tasks(board.id) });
    });
    socket.on("presence:update", ({ teamId, online }: { teamId: string; online: string[] }) =>
      qc.setQueryData(qk.presence(teamId), online),
    );

    socket.on("notification:new", ({ notification }: { notification: NotificationItem }) => {
      qc.setQueryData<NotificationsCache>(qk.notifications, (prev) =>
        prev
          ? {
              notifications: [notification, ...prev.notifications.filter((n) => n.id !== notification.id)].slice(0, 50),
              unreadCount: prev.unreadCount + (notification.read ? 0 : 1),
            }
          : prev,
      );
      invalidateSoon(qk.notifications);
      listeners.current.forEach((fn) => fn(notification));
    });
    socket.on("notifications:read", ({ ids, unreadCount }: { ids: string[] | null; unreadCount: number }) =>
      applyRead(qc, ids, unreadCount),
    );

    return () => {
      timers.forEach(clearTimeout);
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [userId, qc, expireSession]);

  // Follow the board being shown.
  useEffect(() => {
    const previous = boardRef.current;
    boardRef.current = boardId;
    const socket = socketRef.current;
    if (!socket?.connected || !boardId || boardId === previous) return;
    socket.emit("board:join", boardId, () => {});
  }, [boardId]);

  const [value] = useState(() => ({
    onNotification: (fn: (n: NotificationItem) => void) => {
      listeners.current.add(fn);
      return () => {
        listeners.current.delete(fn);
      };
    },
  }));
  return <RealtimeContext.Provider value={{ connected, onNotification: value.onNotification }}>{children}</RealtimeContext.Provider>;
}
