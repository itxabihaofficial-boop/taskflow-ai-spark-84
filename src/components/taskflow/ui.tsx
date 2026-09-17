// Small building blocks shared by the TaskFlow screens (styles live in src/styles.css).
import { ArrowRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const notify = (title: string) => (err: unknown) => {
  toast.error(title, { description: errorMessage(err) });
};

export function Logo() {
  return (
    <span className="logo">
      <span />
      <span />
      <span />
    </span>
  );
}

export function Avatar({ text, online = false, src }: { text: string; online?: boolean; src?: string | null | undefined }) {
  return (
    <span className="avatar">
      {src ? <img src={src} alt="" /> : text}
      {online && <i />}
    </span>
  );
}

export function PageHead({ eyebrow, title, copy, action }: { eyebrow?: string; title: ReactNode; copy: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
}

export function PanelHead({ title, count, action, onAction }: { title: string; count: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        <span>{count}</span>
      </div>
      {action && (
        <button onClick={onAction}>
          {action}
          <ArrowRight />
        </button>
      )}
    </div>
  );
}

export function PermissionToggle({
  defaultOn = false,
  on: controlled,
  onChange,
  label = "Toggle permissions",
  disabled = false,
}: {
  defaultOn?: boolean;
  on?: boolean;
  onChange?: (on: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState(defaultOn);
  const on = controlled ?? local;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className={on ? "toggle on" : "toggle"}
      onClick={() => {
        setLocal(!on);
        onChange?.(!on);
      }}
    >
      <span />
    </button>
  );
}

// Anchored dropdown; closes on outside click or Escape. Place inside a `.menu-wrap`.
export function PopMenu({ children, onClose, className = "" }: { children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);
  return (
    <div className={`pop-menu ${className}`.trim()} role="menu" ref={ref}>
      {children}
    </div>
  );
}

export function SettingRow({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <small>{copy}</small>
      </div>
      {children}
    </div>
  );
}

// Centered dialog using the drawer's scrim; Escape or the scrim closes it.
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    ref.current?.querySelector<HTMLElement>("input:not([disabled]), textarea, select")?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <div className="modal-layer">
      <button className="drawer-scrim" aria-label="Close dialog" onClick={onClose} />
      <section ref={ref} className={wide ? "modal wide" : "modal"} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function FormMessage({ error, notice }: { error?: string | null; notice?: string | null }) {
  if (error) {
    return (
      <div className="auth-message error" role="alert">
        {error}
      </div>
    );
  }
  if (notice) {
    return (
      <div className="auth-message" role="status">
        {notice}
      </div>
    );
  }
  return null;
}
