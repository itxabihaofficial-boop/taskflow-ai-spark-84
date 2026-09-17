// Settings → Integrations: Slack notifications, GitHub webhooks and Figma file previews.
import { Check, Copy, ExternalLink, RefreshCw, Send, Unplug } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { errorMessage } from "@/lib/api";
import { useIntegrationAction, useIntegrations } from "@/lib/queries";
import type { Integrations, SlackEvent, TeamSummary } from "@/lib/types";

import { FormMessage, notify, timeAgo } from "./ui";

type Provider = "slack" | "github" | "figma";

const PROVIDERS: { id: Provider; name: string; icon: string; blurb: string }[] = [
  { id: "slack", name: "Slack", icon: "S", blurb: "Post task updates to a channel" },
  { id: "github", name: "GitHub", icon: "G", blurb: "Link PRs and commits to tasks" },
  { id: "figma", name: "Figma", icon: "F", blurb: "Preview design files on tasks" },
];

const SLACK_EVENT_LABELS: Record<SlackEvent, string> = {
  "task.created": "New tasks",
  "task.completed": "Completed tasks",
  "risk.flagged": "High deadline risk",
  "comment.added": "New comments",
};

const ago = (iso: string | null) => (iso ? (timeAgo(iso) === "now" ? "just now" : `${timeAgo(iso)} ago`) : "never");

function copy(text: string, what: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success(`Copied ${what}`),
    () => toast.error(`Couldn’t copy the ${what}`),
  );
}

export function IntegrationsSection({ team }: { team: TeamSummary | null }) {
  const { data, error, isPending } = useIntegrations(team?.id);
  const [open, setOpen] = useState<Provider | null>(null);
  const canManage = team?.canManage ?? false;

  return (
    <section>
      <h2>Integrations</h2>
      <p>
        Connect the tools your team already uses{team ? ` in ${team.name}` : ""}.
        {!canManage && " Only managers and admins can change these connections."}
      </p>
      {error && <FormMessage error={`Couldn’t load integrations: ${errorMessage(error)}`} />}
      <div className="integrations">
        {PROVIDERS.map((p) => {
          const connected = data?.[p.id].connected ?? false;
          return (
            <div key={p.id} className={open === p.id ? "active" : undefined}>
              <span>{p.icon}</span>
              <strong>
                {p.name}
                <small className={connected ? "connected" : undefined}>{isPending ? "…" : connected ? "Connected" : p.blurb}</small>
              </strong>
              <button
                className="outline-btn"
                aria-expanded={open === p.id}
                aria-controls={`integration-${p.id}`}
                disabled={!data}
                onClick={() => setOpen(open === p.id ? null : p.id)}
              >
                {open === p.id ? "Close" : connected ? "Manage" : "Connect"}
              </button>
            </div>
          );
        })}
      </div>
      {data && open === "slack" && <SlackPanel teamId={team?.id} slack={data.slack} canManage={canManage} />}
      {data && open === "github" && <GithubPanel teamId={team?.id} github={data.github} canManage={canManage} />}
      {data && open === "figma" && <FigmaPanel teamId={team?.id} figma={data.figma} canManage={canManage} />}
    </section>
  );
}

function Panel({ id, title, children }: { id: Provider; title: string; children: ReactNode }) {
  return (
    <div className="integration-detail" id={`integration-${id}`}>
      <h3>{title}</h3>
      {children}
    </div>
  );
}

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="integration-facts">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Disconnect({ teamId, provider, name, disabled }: { teamId: string | undefined; provider: Provider; name: string; disabled: boolean }) {
  const action = useIntegrationAction(teamId);
  return (
    <button
      type="button"
      className="outline-btn danger"
      disabled={disabled || action.isPending}
      onClick={() => {
        if (!window.confirm(`Disconnect ${name}? You can reconnect it at any time.`)) return;
        action.mutate({ type: "disconnect", provider }, { onSuccess: () => toast.success(`${name} disconnected`), onError: notify(`Couldn’t disconnect ${name}`) });
      }}
    >
      <Unplug />
      Disconnect
    </button>
  );
}

function SlackPanel({ teamId, slack, canManage }: { teamId: string | undefined; slack: Integrations["slack"]; canManage: boolean }) {
  const action = useIntegrationAction(teamId);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<SlackEvent[]>(slack.events);
  const [error, setError] = useState<string | null>(null);
  const eventsChanged = events.length !== slack.events.length || events.some((e) => !slack.events.includes(e));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const webhookUrl = url.trim();
    action.mutate(
      { type: "slack", ...(webhookUrl ? { webhookUrl } : {}), events },
      {
        onSuccess: () => {
          setUrl("");
          toast.success(webhookUrl ? "Slack connected. We posted a hello message to the channel." : "Slack notifications updated");
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };
  const test = () =>
    action.mutate({ type: "slack-test" }, { onSuccess: () => toast.success("Test message sent to Slack"), onError: (err) => setError(errorMessage(err)) });

  return (
    <Panel id="slack" title={slack.connected ? "Slack is connected" : "Connect Slack"}>
      {slack.connected ? (
        <Facts
          rows={[
            ["Webhook", <code key="hint">{slack.webhookHint}</code>],
            ["Connected", ago(slack.connectedAt)],
            ["Last message", ago(slack.lastDeliveryAt)],
            ...(slack.lastError ? ([["Last error", <span key="err" className="danger-text">{slack.lastError}</span>]] as [string, ReactNode][]) : []),
          ]}
        />
      ) : (
        <ol className="integration-steps">
          <li>
            In Slack, create an app with <b>Incoming Webhooks</b> enabled (
            <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">
              guide <ExternalLink />
            </a>
            ).
          </li>
          <li>Add a webhook to the channel that should receive updates.</li>
          <li>Paste the webhook URL below. We’ll post a short hello message to confirm it works.</li>
        </ol>
      )}
      <form className="form-grid" onSubmit={submit}>
        <label className="full">
          {slack.connected ? "Replace webhook URL (optional)" : "Webhook URL"}
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/…"
            required={!slack.connected}
            disabled={!canManage}
            autoComplete="off"
          />
        </label>
        <fieldset className="full check-grid" disabled={!canManage}>
          <legend>Post to Slack when…</legend>
          {slack.availableEvents.map((ev) => (
            <label key={ev}>
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))}
              />
              {SLACK_EVENT_LABELS[ev] ?? ev}
            </label>
          ))}
        </fieldset>
        <div className="full">
          <FormMessage error={error} />
        </div>
        <div className="integration-actions full">
          <button type="submit" className="primary-btn" disabled={!canManage || action.isPending || (slack.connected && !url.trim() && !eventsChanged)}>
            {action.isPending ? "Saving…" : slack.connected ? "Save changes" : "Connect Slack"}
          </button>
          {slack.connected && (
            <>
              <button type="button" className="outline-btn" disabled={!canManage || action.isPending} onClick={test}>
                <Send />
                Send test message
              </button>
              <Disconnect teamId={teamId} provider="slack" name="Slack" disabled={!canManage} />
            </>
          )}
        </div>
      </form>
    </Panel>
  );
}

function GithubPanel({ teamId, github, canManage }: { teamId: string | undefined; github: Integrations["github"]; canManage: boolean }) {
  const action = useIntegrationAction(teamId);
  const [secret, setSecret] = useState<string | null>(null);

  const generate = () => {
    if (github.connected && !window.confirm("Rotate the webhook secret? GitHub deliveries will fail until you paste the new secret into the webhook settings.")) return;
    action.mutate(
      { type: "github" },
      {
        onSuccess: (res) => {
          setSecret(res.secret ?? null);
          toast.success(github.connected ? "New webhook secret generated" : "GitHub webhook ready. Finish setup in GitHub.");
        },
        onError: notify("Couldn’t set up GitHub"),
      },
    );
  };

  return (
    <Panel id="github" title={github.connected ? "GitHub is connected" : "Connect GitHub"}>
      <p className="integration-note">
        Mention task ids like <code>TF-241</code> in pull request titles, branch names or commit messages to link them. Opening a PR moves the task to
        Review; merging it, or a commit that says <code>Fixes TF-241</code>, moves it to Done.
      </p>
      {secret && (
        <div className="secret-box" role="status">
          <strong>Copy this secret now. It won’t be shown again.</strong>
          <span>
            <code>{secret}</code>
            <button type="button" className="icon-btn" aria-label="Copy webhook secret" onClick={() => copy(secret, "webhook secret")}>
              <Copy />
            </button>
          </span>
        </div>
      )}
      {(github.connected || secret) && (
        <>
          <ol className="integration-steps">
            <li>
              In your repository or organization, open <b>Settings → Webhooks → Add webhook</b>.
            </li>
            <li>
              Payload URL:{" "}
              <span className="copy-field">
                <code>{github.webhookUrl}</code>
                <button type="button" className="icon-btn" aria-label="Copy payload URL" onClick={() => copy(github.webhookUrl, "payload URL")}>
                  <Copy />
                </button>
              </span>
            </li>
            <li>
              Content type <b>application/json</b>, the secret {secret ? "above" : `ending in ${github.secretHint ?? "…"}`}, and the events{" "}
              <b>Pull requests</b> and <b>Pushes</b>.
            </li>
          </ol>
          <Facts
            rows={[
              ["Connected", ago(github.connectedAt)],
              ["Last delivery", github.lastEventAt ? `${github.lastEvent ?? "event"} · ${ago(github.lastEventAt)}` : "Waiting for the first delivery"],
              ["Repositories", github.repositories.length ? github.repositories.join(", ") : "None yet"],
            ]}
          />
        </>
      )}
      <div className="integration-actions">
        <button type="button" className={github.connected ? "outline-btn" : "primary-btn"} disabled={!canManage || action.isPending} onClick={generate}>
          {github.connected ? <RefreshCw /> : <Check />}
          {action.isPending ? "Working…" : github.connected ? "Rotate secret" : "Generate webhook secret"}
        </button>
        {github.connected && <Disconnect teamId={teamId} provider="github" name="GitHub" disabled={!canManage} />}
      </div>
    </Panel>
  );
}

function FigmaPanel({ teamId, figma, canManage }: { teamId: string | undefined; figma: Integrations["figma"]; canManage: boolean }) {
  const action = useIntegrationAction(teamId);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    action.mutate(
      { type: "figma", token: token.trim() },
      {
        onSuccess: (res) => {
          setToken("");
          toast.success(`Figma connected as ${res.integrations.figma.handle || "your account"}`);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <Panel id="figma" title={figma.connected ? "Figma is connected" : "Connect Figma"}>
      <p className="integration-note">Paste figma.com links into a task’s Links section. With a connection, tasks show the file name and a preview.</p>
      {figma.connected ? (
        <Facts
          rows={[
            ["Account", [figma.handle, figma.email].filter(Boolean).join(" · ") || "Connected"],
            ["Connected", ago(figma.connectedAt)],
          ]}
        />
      ) : (
        <ol className="integration-steps">
          <li>
            In Figma, open <b>Settings → Security → Personal access tokens</b>.
          </li>
          <li>
            Create a token with <b>File content: read</b> access and paste it below. It’s stored encrypted.
          </li>
        </ol>
      )}
      <form className="form-grid" onSubmit={submit}>
        {!figma.connected && (
          <label className="full">
            Personal access token
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="figd_…" required minLength={10} disabled={!canManage} autoComplete="off" />
          </label>
        )}
        <div className="full">
          <FormMessage error={error} />
        </div>
        <div className="integration-actions full">
          {figma.connected ? (
            <Disconnect teamId={teamId} provider="figma" name="Figma" disabled={!canManage} />
          ) : (
            <button type="submit" className="primary-btn" disabled={!canManage || action.isPending || token.trim().length < 10}>
              {action.isPending ? "Checking token…" : "Connect Figma"}
            </button>
          )}
        </div>
      </form>
    </Panel>
  );
}
