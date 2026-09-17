// Task drawer "Links" section: Figma files, GitHub pull requests / commits and plain URLs.
import { Figma, GitCommitHorizontal, GitMerge, GitPullRequest, Link2, Plus, X } from "lucide-react";
import { useState, type FormEvent } from "react";

import { useAddLink, useRemoveLink } from "@/lib/queries";
import type { Task, TaskLink } from "@/lib/types";

import { notify, timeAgo } from "./ui";

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function LinkIcon({ link }: { link: TaskLink }) {
  if (link.kind === "figma") return <Figma />;
  if (link.kind === "github-commit") return <GitCommitHorizontal />;
  if (link.kind === "github-pr") return link.meta.state === "merged" ? <GitMerge /> : <GitPullRequest />;
  return <Link2 />;
}

function linkDetail(link: TaskLink) {
  const m = link.meta;
  switch (link.kind) {
    case "figma":
      return ["Figma", m.lastModified ? `edited ${timeAgo(m.lastModified)} ago` : null].filter(Boolean).join(" · ");
    case "github-pr":
      return [m.repo, m.author && `by ${m.author}`].filter(Boolean).join(" · ");
    case "github-commit":
      return [m.repo, m.sha, m.author].filter(Boolean).join(" · ");
    default:
      return host(link.url);
  }
}

export function TaskLinks({ task }: { task: Task }) {
  const add = useAddLink();
  const remove = useRemoveLink();
  const [url, setUrl] = useState("");
  const links = task.linkList ?? [];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    add.mutate({ key: task.id, url: /^https?:\/\//i.test(value) ? value : `https://${value}` }, { onSuccess: () => setUrl(""), onError: notify("Couldn’t add the link") });
  };

  return (
    <section className="task-links">
      <div>
        <h3>Links</h3>
        <span>{links.length || "Figma, GitHub, docs"}</span>
      </div>
      {links.map((link) => (
        <div key={link.id} className={`task-link ${link.kind}`}>
          {link.kind === "figma" && link.meta.thumbnailUrl ? (
            <img src={link.meta.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ) : (
            <i>
              <LinkIcon link={link} />
            </i>
          )}
          <a href={link.url} target="_blank" rel="noreferrer noopener" title={link.url}>
            <strong>{link.title || link.url}</strong>
            <small>{linkDetail(link)}</small>
          </a>
          {link.kind === "github-pr" && link.meta.state && <span className={`pr-state ${link.meta.state}`}>{link.meta.state}</span>}
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove link ${link.title || link.url}`}
            disabled={remove.isPending}
            onClick={() => remove.mutate({ key: task.id, linkId: link.id }, { onError: notify("Couldn’t remove the link") })}
          >
            <X />
          </button>
        </div>
      ))}
      <form className="add-subtask" onSubmit={submit}>
        <Plus />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={add.isPending ? "Adding link…" : "Paste a Figma, GitHub or any link and press Enter"}
          aria-label="Add link"
          disabled={add.isPending}
          maxLength={2000}
        />
      </form>
    </section>
  );
}
