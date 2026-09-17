// Top-bar bell: unread dot, notification panel and live toasts.
import { AtSign, Bell, CheckCheck, CheckCircle2, Clock3, MessageSquare, Sparkles, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useMarkRead, useNotifications } from "@/lib/queries";
import { useRealtime } from "@/lib/realtime";
import type { NotificationItem } from "@/lib/types";

import { Avatar, PopMenu, timeAgo } from "./ui";

const ICONS: Record<NotificationItem["type"], typeof Bell> = {
  assigned: UserPlus,
  comment: MessageSquare,
  mention: AtSign,
  completed: CheckCircle2,
  risk: Sparkles,
  due_soon: Clock3,
  daily_brief: Sparkles,
  workspace: Users,
};

export function NotificationsBell({ onOpen }: { onOpen: (n: NotificationItem) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const { onNotification } = useRealtime();
  const unread = data?.unreadCount ?? 0;
  const items = data?.notifications ?? [];

  const openItem = (n: NotificationItem) => {
    setOpen(false);
    if (!n.read) markRead.mutate([n.id]);
    onOpen(n);
  };

  // New notifications also appear as a toast with a shortcut to the item.
  useEffect(
    () =>
      onNotification((n) => {
        toast(n.title, {
          description: n.body || undefined,
          action: { label: "Open", onClick: () => openItem(n) },
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onNotification],
  );

  return (
    <div className="menu-wrap">
      <button
        className={unread > 0 ? "icon-btn has-alert" : "icon-btn"}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell />
      </button>
      {open && (
        <PopMenu className="notif-panel" onClose={() => setOpen(false)}>
          <header>
            <strong>Notifications</strong>
            {unread > 0 && <span>{unread} new</span>}
            <button disabled={unread === 0} onClick={() => markRead.mutate("all")}>
              <CheckCheck />
              Mark all read
            </button>
          </header>
          {!data && <p className="empty-state">Loading…</p>}
          {data && items.length === 0 && <p className="empty-state">You’re all caught up. Assignments, mentions and risk alerts will show up here.</p>}
          <div className="notif-list">
            {items.map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              return (
                <button key={n.id} className={n.read ? "notif-item" : "notif-item unread"} onClick={() => openItem(n)}>
                  <span className="notif-avatar">
                    <Avatar text={n.actor.initials} src={n.actor.avatarUrl} />
                    <i>
                      <Icon />
                    </i>
                  </span>
                  <span className="notif-copy">
                    <strong>{n.title}</strong>
                    {n.body && <small>{n.body}</small>}
                  </span>
                  <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>
                    {timeAgo(n.createdAt)}
                  </time>
                </button>
              );
            })}
          </div>
        </PopMenu>
      )}
    </div>
  );
}
