// Top-bar search: live results for tasks (every board), people and projects.
import { FolderKanban, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";

import { useSearch } from "@/lib/queries";

import { Avatar } from "./ui";

export type SearchPick =
  | { kind: "task"; key: string; boardId: string }
  | { kind: "person"; name: string }
  | { kind: "project"; name: string }
  | { kind: "all"; query: string };

export function SearchBox({
  teamId,
  inputRef,
  value,
  onChange,
  onPick,
}: {
  teamId: string | undefined;
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onPick: (pick: SearchPick) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [debounced, setDebounced] = useState(value);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 150);
    return () => clearTimeout(t);
  }, [value]);

  const { data, isFetching } = useSearch(teamId, debounced);
  const items = useMemo<(SearchPick & { id: string })[]>(() => {
    if (!data || !value.trim()) return [];
    return [
      ...data.tasks.map((t) => ({ kind: "task" as const, key: t.id, boardId: t.boardId, id: `t-${t.id}` })),
      ...data.people.map((p) => ({ kind: "person" as const, name: p.name, id: `p-${p.id}` })),
      ...data.projects.map((p) => ({ kind: "project" as const, name: p.name, id: `r-${p.name}` })),
    ];
  }, [data, value]);

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (item: SearchPick) => {
    setOpen(false);
    onPick(item);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, items.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = items[active];
      pick(chosen && active < items.length ? chosen : { kind: "all", query: value });
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const showPanel = open && value.trim().length > 0;
  const task = (key: string) => data?.tasks.find((t) => t.id === key);
  let index = -1;
  const optionProps = (item: SearchPick & { id: string }) => {
    index += 1;
    const i = index;
    return {
      id: `search-${item.id}`,
      role: "option" as const,
      "aria-selected": active === i,
      className: active === i ? "search-item active" : "search-item",
      onMouseEnter: () => setActive(i),
      onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
      onClick: () => pick(item),
    };
  };

  return (
    <div className="search-wrap" ref={wrap}>
      <label className="search">
        <Search />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search tasks, people, projects…"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-activedescendant={showPanel && items[active] ? `search-${items[active]?.id}` : undefined}
        />
        <kbd>⌘ K</kbd>
      </label>
      {showPanel && (
        <div className="search-results" id="search-results" role="listbox" aria-label="Search results">
          {items.length === 0 && <p className="empty-state">{isFetching ? "Searching…" : `No matches for “${value.trim()}”`}</p>}
          {data && data.tasks.length > 0 && <h4>Tasks</h4>}
          {items
            .filter((i) => i.kind === "task")
            .map((item) => {
              const t = item.kind === "task" ? task(item.key) : undefined;
              return (
                <button key={item.id} {...optionProps(item)}>
                  <span className={`status-ring ${t?.column === "Done" ? "s1" : t?.column === "To Do" ? "s0" : "s2"}`} />
                  <span className="task-main">
                    <strong>{t?.title}</strong>
                    <small>
                      {t?.id} · {t?.boardName} · {t?.column}
                    </small>
                  </span>
                  <span className={`risk ${t?.risk.toLowerCase()}`}>
                    <i />
                    {t?.risk}
                  </span>
                </button>
              );
            })}
          {data && data.people.length > 0 && <h4>People</h4>}
          {data?.people.map((p) => {
            const item = items.find((i) => i.id === `p-${p.id}`);
            return item ? (
              <button key={item.id} {...optionProps(item)}>
                <Avatar text={p.initials} src={p.avatarUrl} />
                <span className="task-main">
                  <strong>{p.name}</strong>
                  <small>
                    {p.role}
                    {p.title ? ` · ${p.title}` : ""} · {p.email}
                  </small>
                </span>
              </button>
            ) : null;
          })}
          {data && data.projects.length > 0 && <h4>Projects</h4>}
          {data?.projects.map((p) => {
            const item = items.find((i) => i.id === `r-${p.name}`);
            return item ? (
              <button key={item.id} {...optionProps(item)}>
                <FolderKanban />
                <span className="task-main">
                  <strong>{p.name}</strong>
                  <small>
                    {p.open} open · {p.total} total
                  </small>
                </span>
              </button>
            ) : null;
          })}
          {items.length > 0 && (
            <button
              className={active === items.length ? "search-item all active" : "search-item all"}
              onMouseEnter={() => setActive(items.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick({ kind: "all", query: value })}
            >
              Filter the board by “{value.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}
