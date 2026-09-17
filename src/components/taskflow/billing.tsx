// Settings → Billing: current plan, usage against limits, and upgrade requests.
// There is no payment processor; requests go to sales and are applied with `npm run set-plan`.
import { format, parseISO } from "date-fns";
import { Check, Clock3, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";
import { useBilling, useUpgradeRequest } from "@/lib/queries";
import type { Billing, Plan, PlanTier, TeamSummary } from "@/lib/types";

import { FormMessage, Modal, notify } from "./ui";

const TIERS: PlanTier[] = ["Free", "Pro", "Business"];
const PLAN_COPY: Record<PlanTier, string> = {
  Free: "For small teams getting started",
  Pro: "For growing teams that plan across projects",
  Business: "For organizations with many teams",
};

const limitText = (n: number | null, unit: string) => (n === null ? `Unlimited ${unit}` : `${n.toLocaleString()} ${unit}`);
const price = (p: Plan) => (p.price === 0 ? "$0" : `$${p.price}`);

export function BillingSection({ team, onContactSales }: { team: TeamSummary | null; onContactSales: () => void }) {
  const { data: billing, error, isPending } = useBilling(team?.id);
  const request = useUpgradeRequest(team?.id);
  const [upgradeTo, setUpgradeTo] = useState<PlanTier | null>(null);
  const isAdmin = team?.myRole === "Admin";

  if (isPending) {
    return (
      <section>
        <h2>Billing</h2>
        <p className="empty-state">Loading plan…</p>
      </section>
    );
  }
  if (!billing) {
    return (
      <section>
        <h2>Billing</h2>
        <FormMessage error={`Couldn’t load billing: ${errorMessage(error)}`} />
      </section>
    );
  }

  const { plan, usage, upgradeRequest } = billing;
  const current = TIERS.indexOf(plan.tier);
  const cancel = () => request.mutate("cancel", { onSuccess: () => toast.success("Upgrade request cancelled"), onError: notify("Couldn’t cancel the request") });

  return (
    <>
      <section>
        <h2>Plan & usage</h2>
        <p>
          {team?.name} is on the <b>{plan.tier}</b> plan
          {plan.since ? ` since ${format(parseISO(plan.since), "MMM d, yyyy")}` : ""}
          {plan.seats ? ` with ${plan.seats} seats` : ""}. Usage resets monthly for AI requests.
        </p>
        {upgradeRequest && (
          <div className="billing-banner" role="status">
            <Clock3 />
            <span>
              <b>
                {upgradeRequest.tier} requested{upgradeRequest.seats ? ` for ${upgradeRequest.seats} seats` : ""}
              </b>
              {upgradeRequest.requestedBy ? ` by ${upgradeRequest.requestedBy}` : ""} on {format(parseISO(upgradeRequest.requestedAt), "MMM d")}. Our team
              will contact you to confirm. Nothing changes until then.
            </span>
            {isAdmin && (
              <button className="outline-btn" disabled={request.isPending} onClick={cancel}>
                Cancel request
              </button>
            )}
          </div>
        )}
        <div className="usage-grid">
          <Meter label="Members" used={usage.members + usage.pendingInvites} limit={plan.limits.members} note={usage.pendingInvites ? `incl. ${usage.pendingInvites} pending invite${usage.pendingInvites === 1 ? "" : "s"}` : undefined} />
          <Meter label="Boards" used={usage.boards} limit={plan.limits.boards} />
          <Meter label={`AI requests · ${format(parseISO(`${usage.month}-01`), "MMMM")}`} used={usage.aiRequests} limit={plan.limits.aiRequests} note="Claude calls only; built-in fallbacks are free" />
          <Meter label="Open tasks" used={usage.openTasks} limit={null} />
        </div>
      </section>
      <section>
        <h2>Plans</h2>
        <p>
          Prices are per member per month, billed by invoice. {isAdmin ? "Pick a plan to send a request to our sales team." : "Only workspace admins can request plan changes."}
        </p>
        <div className="plan-grid">
          {billing.plans.map((p) => {
            const rank = TIERS.indexOf(p.tier);
            const isCurrent = p.tier === plan.tier;
            const pending = upgradeRequest?.tier === p.tier;
            return (
              <div key={p.tier} className={isCurrent ? "plan-card current" : "plan-card"}>
                <header>
                  <strong>{p.tier}</strong>
                  {isCurrent && <span>Current</span>}
                  {p.tier === "Pro" && !isCurrent && (
                    <span className="accent">
                      <Sparkles />
                      Popular
                    </span>
                  )}
                </header>
                <small>{PLAN_COPY[p.tier]}</small>
                <b>
                  {price(p)}
                  <em>{p.priceNote}</em>
                </b>
                <ul>
                  <li>
                    <Check />
                    {limitText(p.limits.members, "members")}
                  </li>
                  <li>
                    <Check />
                    {limitText(p.limits.boards, "boards")}
                  </li>
                  <li>
                    <Check />
                    {limitText(p.limits.aiRequests, "AI requests / month")}
                  </li>
                  <li>
                    <Check />
                    Deadline-risk model, realtime boards
                  </li>
                </ul>
                {isCurrent ? (
                  <button className="outline-btn" disabled>
                    Your plan
                  </button>
                ) : (
                  <button
                    className={rank > current ? "primary-btn" : "outline-btn"}
                    disabled={!isAdmin || pending || request.isPending}
                    title={isAdmin ? undefined : "Ask a workspace admin"}
                    onClick={() => setUpgradeTo(p.tier)}
                  >
                    {pending ? "Requested" : rank > current ? `Upgrade to ${p.tier}` : `Switch to ${p.tier}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="billing-foot">
          Need more seats, SSO or custom terms?{" "}
          <button type="button" className="link-btn" onClick={onContactSales}>
            Contact sales
          </button>
        </p>
      </section>
      {upgradeTo && <UpgradeModal billing={billing} tier={upgradeTo} teamId={team?.id} onClose={() => setUpgradeTo(null)} />}
    </>
  );
}

function Meter({ label, used, limit, note }: { label: string; used: number; limit: number | null; note?: string | undefined }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = limit === null ? "" : pct >= 100 ? "full" : pct >= 80 ? "warn" : "";
  return (
    <div className={`usage-meter ${tone}`.trim()}>
      <span>{label}</span>
      <strong>
        {used.toLocaleString()}
        <small>{limit === null ? " · no limit" : ` / ${limit.toLocaleString()}`}</small>
      </strong>
      {limit !== null && (
        <i role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <b style={{ width: `${pct}%` }} />
        </i>
      )}
      {note && <small>{note}</small>}
    </div>
  );
}

function UpgradeModal({ billing, tier, teamId, onClose }: { billing: Billing; tier: PlanTier; teamId: string | undefined; onClose: () => void }) {
  const request = useUpgradeRequest(teamId);
  const target = billing.plans.find((p) => p.tier === tier);
  const minSeats = billing.usage.members + billing.usage.pendingInvites;
  const [seats, setSeats] = useState(String(Math.max(minSeats, 1)));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const seatCount = Number.parseInt(seats, 10);
  const estimate = target && Number.isFinite(seatCount) ? target.price * seatCount : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    request.mutate(
      { tier, ...(Number.isFinite(seatCount) ? { seats: seatCount } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: () => {
          toast.success(`${tier} requested. We emailed you a confirmation.`);
          onClose();
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <Modal title={`Request ${tier}`} description="Our sales team confirms the change and sends an invoice. No card is needed now." onClose={onClose}>
      <form className="modal-body form-grid" onSubmit={submit}>
        <label>
          Seats
          <input type="number" min={1} max={10000} value={seats} onChange={(e) => setSeats(e.target.value)} required />
        </label>
        <div className="estimate">
          <span>Estimated</span>
          <strong>{estimate === null ? "–" : `$${estimate.toLocaleString()}`}</strong>
          <small>per month</small>
        </div>
        {Number.isFinite(seatCount) && seatCount < minSeats && (
          <p className="full field-hint">You have {minSeats} members and invites today. Pick at least that many seats to keep everyone.</p>
        )}
        <label className="full">
          Anything we should know? (optional)
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Billing contact, timeline, questions…" />
        </label>
        <div className="full">
          <FormMessage error={error} />
        </div>
        <div className="modal-actions full">
          <button type="button" className="outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="primary-btn" disabled={request.isPending || !Number.isFinite(seatCount) || seatCount < 1}>
            {request.isPending ? "Sending…" : "Send request"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
