// Settings: profile (photo, password, appearance), notifications, integrations and billing.
import { Bell, CreditCard, Link2, LogOut, Users } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";
import { useAuth, type NotifyPreferences } from "@/lib/auth";
import type { TeamSummary } from "@/lib/types";

import { BillingSection } from "./billing";
import { IntegrationsSection } from "./integrations";
import { Avatar, PageHead, PermissionToggle, SettingRow, notify } from "./ui";

export type SettingsTab = "profile" | "notifications" | "integrations" | "billing";

const TABS: [SettingsTab, string, typeof Users][] = [
  ["profile", "Profile", Users],
  ["notifications", "Notifications", Bell],
  ["integrations", "Integrations", Link2],
  ["billing", "Billing", CreditCard],
];

export function SettingsView({
  light,
  setLight,
  team,
  tab,
  onTab,
  onContactSales,
}: {
  light: boolean;
  setLight: (v: boolean) => void;
  team: TeamSummary | null;
  tab: SettingsTab;
  onTab: (tab: SettingsTab) => void;
  onContactSales: () => void;
}) {
  const { logout } = useAuth();
  return (
    <>
      <PageHead eyebrow="PERSONAL" title="Settings" copy="Manage your profile, preferences, and connected tools." />
      <div className="settings-layout">
        <aside role="tablist" aria-label="Settings sections">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => onTab(id)}>
              <Icon />
              {label}
            </button>
          ))}
          <button onClick={() => void logout()}>
            <LogOut />
            Sign out
          </button>
        </aside>
        <div className="settings-content" role="tabpanel">
          {tab === "profile" && <ProfileTab light={light} setLight={setLight} />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "integrations" && <IntegrationsSection team={team} />}
          {tab === "billing" && <BillingSection team={team} onContactSales={onContactSales} />}
        </div>
      </div>
    </>
  );
}

// Resizes an image file to a small square-ish JPEG data URL.
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn’t an image we can read"));
      el.src = url;
    });
    const size = 256;
    const scale = Math.min(1, size / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function ProfileTab({ light, setLight }: { light: boolean; setLight: (v: boolean) => void }) {
  const { user, updateProfile } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name ?? "", title: user?.title ?? "", email: user?.email ?? "" });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const field = (k: keyof typeof profile) => (e: ChangeEvent<HTMLInputElement>) => {
    setProfile({ ...profile, [k]: e.target.value });
    setSaveMsg(null);
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile(profile);
      setSaveMsg({ ok: true, text: "Changes saved" });
    } catch (err) {
      setSaveMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };
  const pickPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return void toast.error("Choose a JPG, PNG or WebP image");
    if (file.size > 2 * 1024 * 1024) return void toast.error("That image is larger than 2 MB");
    setPhotoBusy(true);
    try {
      await updateProfile({ avatarUrl: await toAvatarDataUrl(file) });
      toast.success("Photo updated");
    } catch (err) {
      notify("Couldn’t update your photo")(err);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <>
      <section>
        <form id="profile-form" onSubmit={save} />
        <h2>Profile</h2>
        <p>Your personal details and public identity.</p>
        <div className="profile-edit">
          <Avatar text={user?.initials ?? ""} src={user?.avatarUrl} />
          <div>
            <span className="photo-actions">
              <button type="button" className="outline-btn" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
                {photoBusy ? "Uploading…" : "Change photo"}
              </button>
              {user?.avatarUrl && (
                <button type="button" className="link-btn" disabled={photoBusy} onClick={() => updateProfile({ avatarUrl: "" }).catch(notify("Couldn’t remove the photo"))}>
                  Remove
                </button>
              )}
            </span>
            <small>JPG or PNG. 2MB max.</small>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pickPhoto} aria-label="Profile photo" />
          </div>
        </div>
        <div className="form-grid">
          <label>
            Full name
            <input form="profile-form" value={profile.name} onChange={field("name")} required minLength={2} />
          </label>
          <label>
            Job title
            <input form="profile-form" value={profile.title} onChange={field("title")} />
          </label>
          <label className="full">
            Email address
            <input form="profile-form" type="email" value={profile.email} onChange={field("email")} required />
          </label>
        </div>
        <button type="submit" form="profile-form" className="primary-btn" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saveMsg && (
          <small className={`save-status ${saveMsg.ok ? "ok" : "error"}`} role="status">
            {saveMsg.text}
          </small>
        )}
      </section>
      <PasswordSection />
      <section>
        <h2>Preferences</h2>
        <p>Choose how TaskFlow looks.</p>
        <SettingRow title="Light appearance" copy="Use a bright interface across your workspace">
          <PermissionToggle on={light} onChange={setLight} label="Light appearance" />
        </SettingRow>
      </section>
    </>
  );
}

function PasswordSection() {
  const { user, changePassword } = useAuth();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasPassword = user?.hasPassword !== false;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (form.next !== form.confirm) return setMsg({ ok: false, text: "The new passwords don’t match" });
    setBusy(true);
    try {
      await changePassword(hasPassword ? form.current : undefined, form.next);
      setForm({ current: "", next: "", confirm: "" });
      setMsg({ ok: true, text: hasPassword ? "Password updated. Other devices were signed out." : "Password set. You can now sign in with email too." });
    } catch (err) {
      setMsg({ ok: false, text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <form id="password-form" onSubmit={submit} />
      <h2>{hasPassword ? "Password" : "Set a password"}</h2>
      <p>
        {hasPassword
          ? "Changing your password signs you out everywhere else."
          : `You sign in with Google${user?.googleLinked ? "" : ""}. Add a password to also sign in with ${user?.email}.`}
      </p>
      <div className="form-grid">
        {hasPassword && (
          <label className="full">
            Current password
            <input form="password-form" type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} required />
          </label>
        )}
        <label>
          New password
          <input form="password-form" type="password" autoComplete="new-password" minLength={8} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} required />
        </label>
        <label>
          Confirm new password
          <input form="password-form" type="password" autoComplete="new-password" minLength={8} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
        </label>
      </div>
      <button type="submit" form="password-form" className="outline-btn" disabled={busy}>
        {busy ? "Updating…" : hasPassword ? "Change password" : "Set password"}
      </button>
      {msg && (
        <small className={`save-status ${msg.ok ? "ok" : "error"}`} role="status">
          {msg.text}
        </small>
      )}
    </section>
  );
}

const NOTIFY_ROWS: [keyof NotifyPreferences, string, string][] = [
  ["assigned", "Assigned to me", "When someone gives you a task"],
  ["mentions", "Mentions", "When someone @mentions you in a comment"],
  ["comments", "Comments", "New comments on tasks you own or created"],
  ["completed", "Completed work", "When a task you own or created is finished"],
  ["dueSoon", "Due soon", "A reminder the day before and on the due date"],
  ["workspace", "Workspace changes", "Being added to a workspace, invites accepted"],
];

function NotificationsTab() {
  const { user, updateProfile } = useAuth();
  const prefs = user?.preferences;
  const save = (patch: Parameters<typeof updateProfile>[0]) => updateProfile(patch).catch(notify("Couldn’t save your preferences"));
  const toggle = (title: string, copy: string, on: boolean, onChange: (v: boolean) => void): ReactNode => (
    <SettingRow key={title} title={title} copy={copy}>
      <PermissionToggle on={on} onChange={onChange} label={title} />
    </SettingRow>
  );
  return (
    <>
      <section>
        <h2>Notifications</h2>
        <p>Choose what TaskFlow tells you about. Notifications appear under the bell in the top bar.</p>
        {NOTIFY_ROWS.map(([key, title, copy]) =>
          toggle(title, copy, prefs?.notify[key] ?? true, (v) => save({ preferences: { notify: { [key]: v } } })),
        )}
      </section>
      <section>
        <h2>AI alerts</h2>
        <p>Signals from the deadline-risk model and the AI standup.</p>
        {toggle("Deadline risk alerts", "Get notified when AI detects a delivery risk", prefs?.riskAlerts ?? true, (v) => save({ preferences: { riskAlerts: v } }))}
        {toggle("Daily AI brief", "Receive a summary at 9:00 AM on weekdays", prefs?.dailyBrief ?? true, (v) => save({ preferences: { dailyBrief: v } }))}
      </section>
      <section>
        <h2>Email</h2>
        <p>Also send the notifications you’ve enabled to {user?.email}.</p>
        {toggle("Email me a copy", "One email per notification", prefs?.notify.email ?? false, (v) => save({ preferences: { notify: { email: v } } }))}
      </section>
    </>
  );
}
