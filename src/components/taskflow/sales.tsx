// "Contact sales" dialog, used on the landing page and in Settings → Billing.
import { CheckCircle2 } from "lucide-react";
import { useState, type FormEvent } from "react";

import { errorMessage } from "@/lib/api";
import { contactSales } from "@/lib/queries";

import { FormMessage, Modal } from "./ui";

const TEAM_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export function ContactSalesModal({
  onClose,
  defaults,
}: {
  onClose: () => void;
  defaults?: { name?: string; email?: string; company?: string } | undefined;
}) {
  const [form, setForm] = useState({
    name: defaults?.name ?? "",
    email: defaults?.email ?? "",
    company: defaults?.company ?? "",
    teamSize: "",
    message: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await contactSales({
        name: form.name.trim(),
        email: form.email.trim(),
        ...(form.company.trim() ? { company: form.company.trim() } : {}),
        ...(form.teamSize ? { teamSize: form.teamSize } : {}),
        ...(form.message.trim() ? { message: form.message.trim() } : {}),
      });
      setSent(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Modal title="Message sent" onClose={onClose}>
        <div className="modal-body modal-done">
          <CheckCircle2 />
          <p>{sent}</p>
          <button type="button" className="primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Contact sales" description="Tell us about your team. We usually reply within one business day." onClose={onClose}>
      <form className="modal-body form-grid" onSubmit={submit}>
        <label>
          Full name
          <input value={form.name} onChange={set("name")} autoComplete="name" required minLength={2} maxLength={120} />
        </label>
        <label>
          Work email
          <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </label>
        <label>
          Company
          <input value={form.company} onChange={set("company")} autoComplete="organization" maxLength={120} />
        </label>
        <label>
          Team size
          <select value={form.teamSize} onChange={set("teamSize")}>
            <option value="">Select…</option>
            {TEAM_SIZES.map((s) => (
              <option key={s} value={s}>
                {s} people
              </option>
            ))}
          </select>
        </label>
        <label className="full">
          How can we help?
          <textarea value={form.message} onChange={set("message")} rows={4} maxLength={3000} placeholder="Plans, seats, security reviews, onboarding…" />
        </label>
        <div className="full">
          <FormMessage error={error} />
        </div>
        <div className="modal-actions full">
          <button type="button" className="outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
