import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, ArrowRight, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Circle, Clock3, Filter, Gauge, GripVertical, Inbox, LayoutDashboard, Link2, ListChecks,
  LogOut, Menu, MessageSquare, Moon, MoreHorizontal, Pencil, Plus, Search, Send,
  Settings, ShieldCheck, Sparkles, Sun, Trash2, UserMinus, Users, WandSparkles, X, Zap,
} from "lucide-react";
import { format, isToday, isTomorrow, isYesterday, parseISO } from "date-fns";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode, type RefObject } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { ListView, BoardPicker, ColumnMenu } from "@/components/taskflow/boards";
import { Landing } from "@/components/taskflow/landing";
import { TaskLinks } from "@/components/taskflow/links";
import { NotificationsBell } from "@/components/taskflow/notifications";
import { ContactSalesModal } from "@/components/taskflow/sales";
import { SearchBox, type SearchPick } from "@/components/taskflow/search";
import { SettingsView, type SettingsTab } from "@/components/taskflow/settings";
import { Avatar, FormMessage, Logo, Modal, PageHead, PanelHead, PermissionToggle, PopMenu, notify, plural, timeAgo } from "@/components/taskflow/ui";
import { CreateWorkspaceModal, WorkspaceSwitcher } from "@/components/taskflow/workspace";
import { errorMessage } from "@/lib/api";
import { useAuth, type User } from "@/lib/auth";
import { RealtimeProvider, useRealtime } from "@/lib/realtime";
import {
  qk, useAddComment, useAddSubtask, useAiAssist, useBoardTasks, useCreateTask, useDashboard, useDeleteSubtask, useDeleteTask, useInvite,
  useMoveTask, useRefreshStandup, useRemoveMember, useRenameTeam, useRevokeInvite, useStandup, useTask, useTaskActivity, useUpdateMember, useUpdateSubtask, useUpdateTask, useWorkspace,
  type AssistResult,
} from "@/lib/queries";
import {
  COLUMNS, PRIORITIES, ROLES,
  type Board as BoardData, type BoardSummary, type Column, type Dashboard as DashboardData, type Member, type NotificationItem, type Priority,
  type Risk as RiskLevel, type Role, type Standup, type StandupPeriod, type Task, type TaskPatch, type TeamDetail, type TeamSummary,
} from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "TaskFlow AI — Team work, intelligently orchestrated" },
    { name: "description", content: "A polished AI-augmented task management workspace for modern teams." },
    { property: "og:title", content: "TaskFlow AI — Team work, intelligently orchestrated" },
    { property: "og:description", content: "Plan work, spot risks, and keep your team moving with AI assistance." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: TaskFlow,
});

type View = "dashboard" | "boards" | "summary" | "team" | "settings";
type Layout = "board" | "list";
// The task drawer shows either an existing task (by key) or a new-task draft for a column.
type Drawer = { key: string } | { draft: Column };

const nav = [
  {id:"dashboard" as View,label:"Dashboard",icon:LayoutDashboard}, {id:"boards" as View,label:"Boards",icon:ListChecks},
  {id:"summary" as View,label:"AI Summary",icon:WandSparkles}, {id:"team" as View,label:"Team",icon:Users},
  {id:"settings" as View,label:"Settings",icon:Settings},
];
const VIEWS:View[]=nav.map(n=>n.id);

function dueLabel(ymd:string){if(!ymd)return "No date";const d=parseISO(ymd);return isToday(d)?"Today":isTomorrow(d)?"Tomorrow":isYesterday(d)?"Yesterday":format(d,"MMM d")}
const pctDelta=(n:number|null|undefined)=>n===null||n===undefined?undefined:`${n>=0?"+":""}${n}%`;
const riskTitle=(t:Task)=>t.riskScore===null?"Deadline risk not scored yet":`${Math.round(t.riskScore*100)}% deadline risk${t.riskFactors.length?` · ${t.riskFactors.join(", ")}`:""}`;
const ringClass=(c:Column)=>`s${[0,2,3,1][COLUMNS.indexOf(c)]??0}`;
// Per-browser conveniences (last board per workspace, board/list layout); storage may be unavailable.
const boardKey=(teamId:string)=>`taskflow.board.${teamId}`;
const LAYOUT_KEY="taskflow.layout";
function readStore(k:string){try{return typeof window==="undefined"?null:window.localStorage.getItem(k)}catch{return null}}
function writeStore(k:string,v:string){try{window.localStorage.setItem(k,v)}catch{/* storage unavailable */}}
// Reads ?task= / ?view= deep links (from emails and Slack) once and removes them from the address bar.
function takeDeepLink(){
  const p=new URLSearchParams(window.location.search); const task=p.get("task"); const view=p.get("view");
  if(task||view){p.delete("task");p.delete("view");const rest=p.toString();window.history.replaceState(window.history.state,"",`${window.location.pathname}${rest?`?${rest}`:""}${window.location.hash}`)}
  return {task:task?.trim().toUpperCase()||null,view:VIEWS.find(v=>v===view)??null};
}

function TaskFlow(){
  const {status,user}=useAuth();
  if(status==="loading") return <div className="landing" aria-busy="true"/>;
  if(!user) return <Landing/>;
  return <Shell user={user}/>;
}

function Shell({user}:{user:User}){
  const {updateProfile}=useAuth(); const qc=useQueryClient(); const [view,setView]=useState<View>("dashboard"); const [settingsTab,setSettingsTab]=useState<SettingsTab>("profile");
  const [collapsed,setCollapsed]=useState(false); const [mobileOpen,setMobileOpen]=useState(false); const [light,setLightState]=useState(user.preferences.lightMode);
  const setLight=(v:boolean)=>{setLightState(v);updateProfile({preferences:{lightMode:v}}).catch(()=>{})};
  const [drawer,setDrawer]=useState<Drawer|null>(null); const [inviteOpen,setInviteOpen]=useState(false); const [salesOpen,setSalesOpen]=useState(false); const [creatingWorkspace,setCreatingWorkspace]=useState(false);
  const [query,setQuery]=useState(""); const [filter,setFilter]=useState("All tasks"); const [memberSearch,setMemberSearch]=useState(""); const searchRef=useRef<HTMLInputElement>(null);
  const [teamId,setTeamId]=useState<string|null>(user.preferences.activeTeamId); const [boardPick,setBoardPick]=useState<Record<string,string>>({});
  const [layout,setLayoutState]=useState<Layout>(()=>readStore(LAYOUT_KEY)==="list"?"list":"board");
  const ws=useWorkspace(teamId,tid=>boardPick[tid]??readStore(boardKey(tid)));
  const tasksQuery=useBoardTasks(ws.board?.id); const dash=useDashboard(ws.team?.id);
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();searchRef.current?.focus()}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[]);
  useEffect(()=>{const link=takeDeepLink();if(link.task){setView("boards");setDrawer({key:link.task})}else if(link.view)setView(link.view)},[]);
  const tasks=tasksQuery.data??[]; const members=ws.members;
  const teammatesOnline=members.filter(m=>m.online&&m.id!==user.id).length;
  const openProjects=new Set(tasks.filter(t=>t.column!=="Done").map(t=>t.project)).size;
  const stack=[...members].sort((a,b)=>Number(b.online)-Number(a.online)).slice(0,3);
  const atRisk=dash.data?.stats.atRisk??0;
  const go=(v:View)=>{setView(v);setMobileOpen(false)};
  const openTask=(key:string)=>setDrawer({key}); const newTask=(column:Column="To Do")=>setDrawer({draft:column});
  const setLayout=(l:Layout)=>{setLayoutState(l);writeStore(LAYOUT_KEY,l)};
  const pickBoard=(tid:string,bid:string)=>{setBoardPick(p=>({...p,[tid]:bid}));writeStore(boardKey(tid),bid)};
  const selectBoard=(bid:string)=>{if(!ws.team)return;if(bid!==ws.board?.id){setDrawer(null);setQuery("")}pickBoard(ws.team.id,bid)};
  const switchTeam=(id:string,{keepDrawer=false}={})=>{if(id===ws.team?.id)return;setTeamId(id);if(!keepDrawer)setDrawer(null);setQuery("");setFilter("All tasks");setMemberSearch("");setInviteOpen(false);updateProfile({preferences:{activeTeamId:id}}).catch(()=>{})};
  // Opening a task from another board or workspace (search, notification, link) brings that board along.
  const followTask=(t:Task)=>{if(!ws.team)return;if(t.teamId!==ws.team.id){pickBoard(t.teamId,t.boardId);switchTeam(t.teamId,{keepDrawer:true})}else if(t.boardId!==ws.board?.id)pickBoard(t.teamId,t.boardId)};
  const leftTeam=(id:string)=>{const next=ws.teams.find(t=>t.id!==id);qc.removeQueries({queryKey:qk.team(id)});qc.removeQueries({queryKey:qk.boards(id)});setDrawer(null);if(next)switchTeam(next.id);else setTeamId(null);go("dashboard")};
  const onSearchPick=(p:SearchPick)=>{
    if(p.kind==="task"){setQuery("");setView("boards");openTask(p.key)}
    else if(p.kind==="person"){setQuery("");setMemberSearch(p.name);go("team")}
    else if(p.kind==="project"){setQuery(p.name);go("boards")}
    else go("boards");
  };
  const openNotification=(n:NotificationItem)=>{
    if(n.teamId&&n.teamId!==ws.team?.id)switchTeam(n.teamId,{keepDrawer:true});
    if(n.target==="task"&&n.taskKey){if(n.teamId&&n.boardId)pickBoard(n.teamId,n.boardId);openTask(n.taskKey)}
    else go(n.target==="summary"?"summary":n.target==="team"?"team":"dashboard");
  };
  return <RealtimeProvider boardId={ws.board?.id}><div className={light?"light app-root":"app-root"}>
    {mobileOpen&&<button aria-label="Close navigation" className="mobile-scrim" onClick={()=>setMobileOpen(false)}/>}
    <aside className={`sidebar ${collapsed?"collapsed":""} ${mobileOpen?"mobile-open":""}`}>
      <div className="brand"><Logo/><span>TaskFlow <b>AI</b></span><button className="icon-btn collapse-btn" onClick={()=>setCollapsed(!collapsed)} aria-label="Collapse sidebar"><ChevronLeft/></button></div>
      <WorkspaceSwitcher teams={ws.teams} team={ws.team} loading={ws.isLoading} onSwitch={id=>{switchTeam(id);setMobileOpen(false)}}/>
      <nav>{nav.map(n=><button key={n.id} onClick={()=>go(n.id)} className={view===n.id?"nav-item active":"nav-item"}><n.icon/><span>{n.label}</span>{n.id==="summary"&&atRisk>0&&<i title={`${atRisk} at-risk tasks`}>{atRisk}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="presence"><span className="presence-dot"/><div><strong>{plural(teammatesOnline,"teammate")} online</strong><small>Working across {plural(openProjects,"project")}</small></div></div><button className="profile-row" onClick={()=>{setSettingsTab("profile");go("settings")}}><Avatar text={user.initials} src={user.avatarUrl} online/><span><strong>{user.name}</strong><small>{user.email}</small></span><MoreHorizontal/></button></div>
    </aside>
    <div className={`main-shell ${collapsed?"wide":""}`}>
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Open navigation"><Menu/></button><div className="mobile-logo"><Logo/><b>TaskFlow</b></div><SearchBox teamId={ws.team?.id} inputRef={searchRef} value={query} onChange={setQuery} onPick={onSearchPick}/><div className="top-actions"><div className="avatar-stack" title={members.filter(m=>m.online).map(m=>m.name).join(", ")||"Nobody else is online"}>{stack.map(m=><Avatar key={m.id} text={m.initials} src={m.avatarUrl} online={m.online}/>)}{members.length>3&&<span>+{members.length-3}</span>}</div><button className="icon-btn" onClick={()=>setLight(!light)} aria-label="Toggle theme">{light?<Moon/>:<Sun/>}</button><NotificationsBell onOpen={openNotification}/><button className="primary-btn" onClick={()=>newTask()} disabled={!ws.board}><Plus/> New task</button></div></header>
      <main className="content">{ws.error?<div className="auth-message error" role="alert"><AlertTriangle/>Couldn’t load your workspace: {errorMessage(ws.error)}</div>:!ws.isLoading&&!ws.team&&view!=="settings"?<div className="empty-workspace"><p className="empty-state">You’re not part of a workspace yet. Create one, or ask a teammate to invite you.</p><button className="primary-btn" onClick={()=>setCreatingWorkspace(true)}><Plus/> Create workspace</button></div>:<>
        {view==="dashboard"&&<Dashboard teamId={ws.team?.id} data={dash.data} loading={dash.isPending} onTask={openTask} onCreate={()=>newTask()} onNavigate={go}/>}
        {view==="boards"&&<Board team={ws.team} boards={ws.boards} board={ws.board} onSelectBoard={selectBoard} layout={layout} setLayout={setLayout} tasks={tasks} loading={tasksQuery.isPending} error={tasksQuery.error} selected={drawer&&"key" in drawer?drawer.key:null} onOpen={openTask} onCreate={newTask} filter={filter} setFilter={setFilter} query={query} onShare={()=>{setInviteOpen(true);go("team")}}/>}
        {view==="summary"&&<Summary teamId={ws.team?.id} onTask={openTask}/>}
        {view==="team"&&<Team key={ws.team?.id} team={ws.teamDetail} invite={inviteOpen} setInvite={setInviteOpen} search={memberSearch} setSearch={setMemberSearch} onLeft={leftTeam}/>}
        {view==="settings"&&<SettingsView light={light} setLight={setLight} team={ws.team} tab={settingsTab} onTab={setSettingsTab} onContactSales={()=>setSalesOpen(true)}/>}
      </>}</main>
    </div>
    {drawer&&ws.board&&<TaskPanel key={"key" in drawer?drawer.key:`new-${drawer.draft}`} drawer={drawer} board={ws.board} members={members} onOpen={openTask} onTask={followTask} onClose={()=>setDrawer(null)}/>}
    {salesOpen&&<ContactSalesModal onClose={()=>setSalesOpen(false)} defaults={{name:user.name,email:user.email,...(ws.team?{company:ws.team.name}:{})}}/>}
    {creatingWorkspace&&<CreateWorkspaceModal onClose={()=>setCreatingWorkspace(false)} onCreated={t=>{setCreatingWorkspace(false);switchTeam(t.id)}}/>}
    <Toaster theme={light?"light":"dark"} position="bottom-right"/>
  </div></RealtimeProvider>
}

function greeting(d=new Date()){const h=d.getHours();return h<12?"Good morning":h<18?"Good afternoon":"Good evening"}

function Dashboard({teamId,data,loading,onTask,onCreate,onNavigate}:{teamId:string|undefined;data:DashboardData|undefined;loading:boolean;onTask:(key:string)=>void;onCreate:()=>void;onNavigate:(v:View)=>void}){
  const {user}=useAuth(); const {connected}=useRealtime(); const brief=useStandup(teamId,"daily"); const s=data?.stats; const mine=data?.myTasks??[]; const activity=data?.activity??[];
  const num=(v:number|null|undefined,suffix="")=>v===null||v===undefined?"–":`${v}${suffix}`;
  return <>
  <PageHead eyebrow={format(new Date(),"EEEE, MMMM d").toUpperCase()} title={`${greeting()}, ${user?.name.split(" ")[0]??"there"}`} copy="Here’s what needs your attention today." action={<button className="primary-btn" onClick={onCreate}><Plus/> Create task</button>}/>
  <div className="stats-grid"><Stat icon={<CheckCircle2/>} value={num(s?.completedThisWeek)} label="Completed this week" delta={pctDelta(s?.completedDelta)} note="vs. previous week"/><Stat icon={<Clock3/>} value={num(s?.inProgress)} label="In progress" note={s?`Across ${plural(s.inProgressProjects,"project")}`:"…"}/><Stat icon={<AlertTriangle/>} value={num(s?.atRisk)} label="At risk" warning note={s&&s.atRisk===0?"All clear":"Needs attention"}/><Stat icon={<Gauge/>} value={num(s?.velocity,"%")} label="Team velocity" delta={pctDelta(s?.velocityDelta)} note="On-time completion"/></div>
  <div className="dashboard-grid"><section className="panel assigned"><PanelHead title="My tasks" count={loading?"…":String(mine.length)} action="View board" onAction={()=>onNavigate("boards")}/><div className="task-list">{loading&&<p className="empty-state">Loading your tasks…</p>}{!loading&&mine.length===0&&<p className="empty-state">Nothing is assigned to you right now.</p>}{mine.slice(0,5).map(t=><button key={t.id} className="task-row" onClick={()=>onTask(t.id)}><span className={`status-ring ${ringClass(t.column)}`}/><span className="task-main"><strong>{t.title}</strong><small>{t.project} · {t.id}</small></span><Risk risk={t.risk} title={riskTitle(t)}/><span className={t.overdue?"due overdue":"due"}><CalendarDays/>{t.due}</span><Avatar text={t.avatars[0]??"–"} src={t.assignees[0]?.avatarUrl}/></button>)}</div></section>
  <section className="panel activity-panel"><PanelHead title="Team activity" count={connected?"Live":"Offline"}/><div className="activity-list">{!loading&&activity.length===0&&<p className="empty-state">No activity yet.</p>}{activity.slice(0,5).map(x=><div className="activity-item" key={x.id}><Avatar text={x.actor?.initials??"?"} src={x.actor?.avatarUrl}/><p><strong>{x.actor?.firstName??"Someone"}</strong> {x.text}<br/>{x.taskKey&&x.type!=="task.deleted"?<button className="activity-link" onClick={()=>onTask(x.taskKey??"")}>{x.highlight}</button>:<b>{x.highlight}</b>}</p><time dateTime={x.createdAt} title={new Date(x.createdAt).toLocaleString()}>{timeAgo(x.createdAt)}</time></div>)}</div></section></div>
  <section className="ai-brief"><div className="ai-mark"><WandSparkles/></div><div><span>AI DAILY BRIEF</span><h3>{brief.data?.headline??(brief.isPending?"Preparing today’s brief…":"Today’s brief isn’t available right now.")}</h3><p>{brief.data?.overview??(brief.error?errorMessage(brief.error):"Reading the latest activity, deadlines and risk scores.")}</p></div><button onClick={()=>onNavigate("summary")}>View full summary <ArrowRight/></button></section>
</>}
function Stat({icon,value,label,delta,note,warning=false}:{icon:ReactNode;value:string;label:string;delta?:string|undefined;note?:string|undefined;warning?:boolean}){return <div className={`stat-card ${warning?"warn":""}`}><span className="stat-icon">{icon}</span><strong>{value}</strong><p>{label}</p><small className={delta&&!delta.startsWith("-")?"positive":""}>{delta||note}</small></div>}
function Risk({risk,title}:{risk:RiskLevel;title?:string}){return <span className={`risk ${risk.toLowerCase()}`} title={title}><i/>{risk}</span>}

function Board({team,boards,board,onSelectBoard,layout,setLayout,tasks,loading,error,selected,onOpen,onCreate,filter,setFilter,query,onShare}:{team:TeamSummary|null;boards:BoardSummary[];board:BoardData|null;onSelectBoard:(id:string)=>void;layout:Layout;setLayout:(l:Layout)=>void;tasks:Task[];loading:boolean;error:Error|null;selected:string|null;onOpen:(key:string)=>void;onCreate:(c?:Column)=>void;filter:string;setFilter:(s:string)=>void;query:string;onShare:()=>void}){
  const cols:Column[]=board?.columns??COLUMNS; const move=useMoveTask(board?.id); const [over,setOver]=useState<Column|null>(null);
  const q=query.trim().toLowerCase();
  const visible=useMemo(()=>tasks.filter(t=>(filter==="All tasks"||t.risk===filter)&&(!q||`${t.id} ${t.title} ${t.project} ${t.assignees.map(a=>a.name).join(" ")}`.toLowerCase().includes(q))),[filter,tasks,q]);
  const summary=boards.find(b=>b.id===board?.id)??null;
  const drop=(e:DragEvent<HTMLElement>,column:Column)=>{
    e.preventDefault();setOver(null);
    const key=e.dataTransfer.getData("text/plain"); const task=tasks.find(t=>t.id===key); if(!task)return;
    // Insert before the first visible card whose midpoint is below the pointer.
    const cards=[...e.currentTarget.querySelectorAll<HTMLElement>("article[data-key]")].filter(el=>el.dataset["key"]!==key);
    const before=cards.find(el=>{const r=el.getBoundingClientRect();return e.clientY<r.top+r.height/2});
    const others=tasks.filter(t=>t.column===column&&t.id!==key);
    const position=before?others.findIndex(t=>t.id===before.dataset["key"]):others.length;
    const current=tasks.filter(t=>t.column===column).findIndex(t=>t.id===key);
    if(task.column===column&&position===current)return;
    move.mutate({key,column,position},{onError:notify(`Couldn’t move ${key}`)});
  };
  return <><PageHead eyebrow={board?.category||"BOARD"} title={board?.name??(loading?"Loading board…":"No boards yet")} copy={board?.description||"Track work across the team and keep momentum visible."} action={<div className="page-actions"><button className="outline-btn" onClick={onShare}><Users/> Share</button><button className="primary-btn" onClick={()=>onCreate()} disabled={!board}><Plus/> Add task</button></div>}/>
  <div className="board-toolbar"><div className="toolbar-left"><BoardPicker team={team} boards={boards} board={summary} onSelect={onSelectBoard}/><div className="view-tabs" role="tablist" aria-label="Layout"><button role="tab" aria-selected={layout==="board"} className={layout==="board"?"active":""} onClick={()=>setLayout("board")}><ListChecks/> Board</button><button role="tab" aria-selected={layout==="list"} className={layout==="list"?"active":""} onClick={()=>setLayout("list")}><Inbox/> List</button></div></div><div className="filter-wrap"><Filter/><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter by risk"><option>All tasks</option><option>High</option><option>Medium</option><option>Low</option></select></div></div>
  {error&&<div className="auth-message error" role="alert"><AlertTriangle/>Couldn’t load tasks: {errorMessage(error)}</div>}
  {q&&<p className="filter-note">Showing {plural(visible.length,"task")} matching “{query.trim()}”</p>}
  {layout==="list"?<ListView tasks={visible} loading={loading} selected={selected} onOpen={onOpen}/>:
  <div className="kanban">{cols.map((c,ci)=>{const items=visible.filter(t=>t.column===c);return <section className="kanban-col" key={c} data-column={c} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="move";if(over!==c)setOver(c)}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOver(null)}} onDrop={e=>drop(e,c)}><header><span className={`col-dot c${ci}`}/><h2>{c}</h2><b>{items.length}</b><button onClick={()=>onCreate(c)} aria-label={`Add task to ${c}`} disabled={!board}><Plus/></button><ColumnMenu boardId={board?.id} column={c} onAdd={()=>onCreate(c)}/></header><div className={over===c?"col-body drop-target":"col-body"}>{loading&&<p className="empty-state">Loading…</p>}{items.map(t=><article draggable key={t.id} data-key={t.id} onDragStart={e=>{e.dataTransfer.setData("text/plain",t.id);e.dataTransfer.effectAllowed="move"}} className={selected===t.id?"task-card selected":"task-card"} onClick={()=>onOpen(t.id)}><div className="card-top"><span>{t.id}</span><GripVertical/></div><h3>{t.title}</h3><p>{t.project}</p><div className="tag-row"><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span><Risk risk={t.risk} title={riskTitle(t)}/></div><div className="card-foot"><div className="avatar-stack">{t.avatars.map((a,i)=><Avatar key={`${a}-${i}`} text={a} src={t.assignees[i]?.avatarUrl}/>)}</div><span className={t.overdue||t.due==="Today"?"overdue":""}><CalendarDays/>{t.due}</span><span><MessageSquare/>{t.comments}</span>{(t.linkCount??0)>0&&<span title={plural(t.linkCount??0,"link")}><Link2/>{t.linkCount}</span>}</div></article>)}<button className="add-card" onClick={()=>onCreate(c)} disabled={!board}><Plus/> Add task</button></div></section>})}</div>}</>
}

function Summary({teamId,onTask}:{teamId:string|undefined;onTask:(key:string)=>void}){
  const [period,setPeriod]=useState<StandupPeriod>("daily"); const q=useStandup(teamId,period); const refresh=useRefreshStandup(teamId,period);
  const s=q.data; const busy=q.isFetching||refresh.isPending;
  const days=s?.pulse??Array.from({length:7},(_,i)=>({date:String(i),label:"",completed:0,started:0}));
  const max=Math.max(1,...days.map(d=>d.completed+d.started))*1.15;
  const loadingItems=q.isPending?["…"]:[];
  const confidence=s?.confidence===null||s?.confidence===undefined?"–":`${s.confidence}%`;
  return <><PageHead eyebrow="AI STANDUP" title="Team intelligence" copy="Clear signals from your team’s work—without another status meeting." action={<div className="page-actions"><button className="outline-btn" onClick={()=>refresh.mutate(undefined,{onError:notify("Couldn’t refresh the standup")})} disabled={!teamId||busy}><Sparkles/>{busy?"Updating…":"Refresh"}</button><div className="segmented"><button className={period==="daily"?"active":""} onClick={()=>setPeriod("daily")}>Daily</button><button className={period==="weekly"?"active":""} onClick={()=>setPeriod("weekly")}>Weekly</button></div></div>}/>
  <div className="summary-banner"><div className="ai-mark"><WandSparkles/></div><div><span>{format(s?parseISO(s.date):new Date(),"EEEE · MMMM d").toUpperCase()}{period==="weekly"?" · LAST 7 DAYS":""}</span><h2>{s?.headline??(q.isPending?"Reading your team’s activity…":"The standup couldn’t be generated.")}</h2><p>{s?.overview??(q.error?errorMessage(q.error):"Summarizing progress, blockers and deadline risks.")}</p>{s&&<small className="summary-meta">{standupSource(s)} · updated {ago(s.generatedAt)}{s.stale?" · showing the last saved brief":""}</small>}</div><span className="confidence" title="Share of open work the deadline-risk model expects to land on time"><b>{confidence}</b> confidence</span></div>
  <div className="summary-grid"><SummaryCard icon={<CheckCircle2/>} tone="good" title="Progress" count={s?`${s.counts.completed} completed`:"…"} items={s?(s.progress.length?s.progress:["Nothing completed in this period yet"]):loadingItems} refs={s?.refs?.progress} onTask={onTask}/><SummaryCard icon={<AlertTriangle/>} tone="danger" title="Blockers & risks" count={s?`${s.counts.atRisk} flagged`:"…"} items={s?(s.blockers.length?s.blockers:["No blockers or high risks right now"]):loadingItems} refs={s?.refs?.blockers} onTask={onTask}/><SummaryCard icon={<Zap/>} tone="blue" title="Next best actions" count={s?.source==="llm"?"AI suggested":"Suggested"} items={s?(s.nextActions.length?s.nextActions:["Keep going — nothing needs intervention"]):loadingItems} refs={s?.refs?.nextActions} onTask={onTask}/></div>
  <section className="panel timeline"><PanelHead title="Team pulse" count="Last 7 days"/><div className="pulse-chart">{days.map(d=><div key={d.date} className="stacked" title={s?`${d.completed} completed · ${d.started} started`:undefined}><span className="flow" style={{height:`${d.started/max*100}%`}}/><span style={{height:`${d.completed/max*100}%`}}/><small>{d.label}</small></div>)}</div><div className="pulse-legend"><span><i className="done-dot"/>Completed</span><span><i className="flow-dot"/>In progress</span><b className={(s?.velocityChange??0)<0?"down":""}>{velocityText(s)}</b></div></section>
</>}
function standupSource(s:Standup){return s.source==="llm"?`Written by ${s.model?.startsWith("claude")?"Claude":"AI"}`:"Built-in summary · Claude isn’t connected"}
function ago(iso:string){const t=timeAgo(iso);return t==="now"?"just now":`${t} ago`}
function velocityText(s:Standup|undefined){if(!s)return "";const v=s.velocityChange;if(v===null)return "Not enough history to compare yet";if(v===0)return "Velocity is flat this week";return `Velocity is ${v>0?"up":"down"} ${Math.abs(v)}% this week`}
// Lines that mention a task open it; the rest stay plain text.
function SummaryCard({icon,tone,title,count,items,refs,onTask}:{icon:ReactNode;tone:string;title:string;count:string;items:string[];refs?:(string|null)[]|undefined;onTask:(key:string)=>void}){return <section className={`summary-card ${tone}`}><header><span>{icon}</span><div><h3>{title}</h3><small>{count}</small></div></header>{items.map((x,i)=>{const key=refs?.[i];return key?<button type="button" className="summary-line" key={`${i}-${x}`} onClick={()=>onTask(key)} title={`Open ${key}`}><span>{i+1}</span><p>{x}</p><ChevronRight/></button>:<div className="summary-line" key={`${i}-${x}`}><span>{i+1}</span><p>{x}</p></div>})}</section>}

type MemberFilter = { roles: Role[]; online: boolean; invites: boolean };
function Team({team,invite,setInvite,search,setSearch,onLeft}:{team:TeamDetail|null;invite:boolean;setInvite:(v:boolean)=>void;search:string;setSearch:(v:string)=>void;onLeft:(teamId:string)=>void}){
  const {user}=useAuth(); const updateMember=useUpdateMember(team?.id); const sendInvite=useInvite(team?.id); const revoke=useRevokeInvite(team?.id); const removeMember=useRemoveMember(team?.id);
  const [email,setEmail]=useState(""); const [role,setRole]=useState<Role>("Member"); const [menu,setMenu]=useState<string|null>(null);
  const [filters,setFilters]=useState<MemberFilter>({roles:[],online:false,invites:true}); const [renaming,setRenaming]=useState(false);
  const members=team?.members??[]; const isAdmin=team?.myRole==="Admin"; const canInvite=team?.canManage??false;
  const q=search.trim().toLowerCase();
  const shown=members.filter(m=>(!q||`${m.name} ${m.email} ${m.title} ${m.role}`.toLowerCase().includes(q))&&(filters.roles.length===0||filters.roles.includes(m.role))&&(!filters.online||m.online));
  const invites=filters.invites&&!filters.online?(team?.invites??[]).filter(i=>(!q||i.email.includes(q))&&(filters.roles.length===0||filters.roles.includes(i.role))):[];
  const online=members.filter(m=>m.online).length; const admins=members.filter(m=>m.role==="Admin").length;
  const activeFilters=filters.roles.length+Number(filters.online)+Number(!filters.invites);
  const submitInvite=(e:FormEvent)=>{e.preventDefault();const to=email.trim();sendInvite.mutate({email:to,role},{onSuccess:r=>{toast.success(r.status==="added"?`${to} was added to ${r.team.name}`:`Invite saved for ${to}. We emailed them a link to join.`);setEmail("");setInvite(false)},onError:notify("Couldn’t send invite")})};
  const change=(m:Member,patch:{role?:Role;canManage?:boolean})=>{setMenu(null);updateMember.mutate({userId:m.id,patch},{onError:notify(`Couldn’t update ${m.name}`)})};
  const leave=()=>{setMenu(null);if(!team||!user)return;if(!window.confirm(`Leave ${team.name}? You’ll lose access to its boards until someone invites you again.`))return;removeMember.mutate(user.id,{onSuccess:()=>{toast.success(`You left ${team.name}`);onLeft(team.id)},onError:notify("Couldn’t leave the workspace")})};
  const remove=(m:Member)=>{setMenu(null);if(!window.confirm(`Remove ${m.name} from ${team?.name}? Their tasks will be unassigned.`))return;removeMember.mutate(m.id,{onSuccess:()=>toast.success(`${m.name} was removed`),onError:notify(`Couldn’t remove ${m.name}`)})};
  const toggleRole=(r:Role)=>setFilters(f=>({...f,roles:f.roles.includes(r)?f.roles.filter(x=>x!==r):[...f.roles,r]}));
  return <><PageHead eyebrow="WORKSPACE" title="Team & roles" copy="Manage who has access and what they can do." action={<div className="page-actions"><div className="menu-wrap"><button className="outline-btn" aria-label="Workspace options" aria-expanded={menu==="workspace"} onClick={()=>setMenu(menu==="workspace"?null:"workspace")} disabled={!team}><Settings/> Workspace</button>{menu==="workspace"&&team&&<PopMenu onClose={()=>setMenu(null)}><p>{team.name} · {team.plan} plan</p><button disabled={!isAdmin} title={isAdmin?undefined:"Only admins can rename the workspace"} onClick={()=>{setMenu(null);setRenaming(true)}}><Pencil/><span>Rename workspace</span></button><button className="danger" onClick={leave}><LogOut/><span>Leave workspace</span></button></PopMenu>}</div><button className="primary-btn" onClick={()=>setInvite(!invite)} disabled={!canInvite} title={canInvite?undefined:"Ask a manager or admin to invite people"}><Plus/> Invite member</button></div>}/>{invite&&canInvite&&<form className="invite-bar" onSubmit={submitInvite}><label><span>Invite by email</span><input type="email" required autoFocus value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" aria-label="Invite by email"/></label><select value={role} onChange={e=>setRole(e.target.value as Role)} aria-label="Role">{ROLES.filter(r=>r!=="Admin"||isAdmin).reverse().map(r=><option key={r}>{r}</option>)}</select><button type="submit" className="primary-btn" disabled={sendInvite.isPending}>{sendInvite.isPending?"Sending…":"Send invite"}</button></form>}
  <div className="team-stats"><div><Users/><span><b>{members.length}</b> member{members.length===1?"":"s"}</span></div><div><Activity/><span><b>{online}</b> online now</span></div><div><ShieldCheck/><span><b>{admins}</b> admin{admins===1?"":"s"}</span></div></div>
  <section className="panel team-table"><div className="table-tools"><label><Search/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search members…" aria-label="Search members"/>{search&&<button type="button" className="icon-btn clear-btn" aria-label="Clear search" onClick={()=>setSearch("")}><X/></button>}</label><div className="menu-wrap"><button className="outline-btn" aria-expanded={menu==="filter"} onClick={()=>setMenu(menu==="filter"?null:"filter")}><Filter/> Filter{activeFilters>0&&<b className="count-badge">{activeFilters}</b>}</button>{menu==="filter"&&<PopMenu onClose={()=>setMenu(null)}><p>Role</p>{ROLES.map(r=><button key={r} role="menuitemcheckbox" aria-checked={filters.roles.includes(r)} onClick={()=>toggleRole(r)}><span>{r}s</span>{filters.roles.includes(r)&&<Check/>}</button>)}<hr/><button role="menuitemcheckbox" aria-checked={filters.online} onClick={()=>setFilters(f=>({...f,online:!f.online}))}><span>Online now</span>{filters.online&&<Check/>}</button><button role="menuitemcheckbox" aria-checked={filters.invites} onClick={()=>setFilters(f=>({...f,invites:!f.invites}))}><span>Pending invites</span>{filters.invites&&<Check/>}</button>{activeFilters>0&&<><hr/><button onClick={()=>setFilters({roles:[],online:false,invites:true})}><X/><span>Clear filters</span></button></>}</PopMenu>}</div></div><div className="table-head"><span>Member</span><span>Role</span><span>Status</span><span>Permissions</span><span/></div>{!team&&<p className="empty-state">Loading members…</p>}{team&&shown.length===0&&invites.length===0&&<p className="empty-state">No members match these filters.</p>}{shown.map(m=>{const self=m.id===user?.id;return <div className="member-row" key={m.id}><div><Avatar text={m.initials} src={m.avatarUrl} online={m.online}/><span><strong>{m.name}{self?" (you)":""}</strong><small>{m.title||m.email}</small></span></div><span className={`role ${m.role.toLowerCase()}`}>{m.role}</span><span className={m.online?"online-state":"offline-state"}><i/>{m.online?"Online":"Offline"}</span><PermissionToggle on={m.canManage} disabled={!isAdmin||m.role==="Admin"} label={`Can manage boards and invites: ${m.name}`} onChange={on=>change(m,{canManage:on})}/><div className="menu-wrap"><button className="icon-btn" aria-label={`Actions for ${m.name}`} aria-expanded={menu===m.id} onClick={()=>setMenu(menu===m.id?null:m.id)}><MoreHorizontal/></button>{menu===m.id&&<PopMenu onClose={()=>setMenu(null)}>{isAdmin?ROLES.map(r=><button key={r} disabled={r===m.role} onClick={()=>change(m,{role:r})}>Make {r}</button>):<p>Only admins can change roles.</p>}{self?<><hr/><button className="danger" onClick={leave}><LogOut/><span>Leave workspace</span></button></>:isAdmin&&<><hr/><button className="danger" onClick={()=>remove(m)}><UserMinus/><span>Remove from workspace</span></button></>}</PopMenu>}</div></div>})}
  {invites.map(i=><div className="member-row" key={i.id}><div><Avatar text={i.email.slice(0,2).toUpperCase()}/><span><strong>{i.email}</strong><small>Invitation pending · sent {ago(i.createdAt)}</small></span></div><span className={`role ${i.role.toLowerCase()}`}>{i.role}</span><span className="offline-state"><i/>Invited</span><span/><div className="menu-wrap"><button className="icon-btn" aria-label={`Actions for ${i.email}`} onClick={()=>setMenu(menu===i.id?null:i.id)}><MoreHorizontal/></button>{menu===i.id&&<PopMenu onClose={()=>setMenu(null)}><button className="danger" disabled={!canInvite} onClick={()=>{setMenu(null);revoke.mutate(i.id,{onError:notify("Couldn’t revoke invite")})}}><Trash2/>Revoke invite</button></PopMenu>}</div></div>)}</section>
  {renaming&&team&&<RenameWorkspace team={team} onClose={()=>setRenaming(false)}/>}</>}

function RenameWorkspace({team,onClose}:{team:TeamDetail;onClose:()=>void}){
  const rename=useRenameTeam(team.id); const [name,setName]=useState(team.name); const [description,setDescription]=useState(team.description); const [error,setError]=useState<string|null>(null);
  const submit=(e:FormEvent)=>{e.preventDefault();setError(null);rename.mutate({name:name.trim(),description:description.trim()},{onSuccess:()=>{toast.success("Workspace updated");onClose()},onError:err=>setError(errorMessage(err))})};
  return <Modal title="Workspace details" onClose={onClose}><form className="modal-body form-grid" onSubmit={submit}><label className="full">Workspace name<input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80}/></label><label className="full">Description<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={120} placeholder="Team workspace"/></label><div className="full"><FormMessage error={error}/></div><div className="modal-actions full"><button type="button" className="outline-btn" onClick={onClose}>Cancel</button><button type="submit" className="primary-btn" disabled={rename.isPending||name.trim().length<2}>{rename.isPending?"Saving…":"Save changes"}</button></div></form></Modal>
}

function TaskPanel({drawer,board,members,onOpen,onTask,onClose}:{drawer:Drawer;board:BoardData;members:Member[];onOpen:(key:string)=>void;onTask:(task:Task)=>void;onClose:()=>void}){
  useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const t=e.target as HTMLElement|null;if(e.key==="Escape"&&!t?.closest("[contenteditable],input,textarea,select"))onClose()};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[onClose]);
  return <><button className="drawer-scrim" onClick={onClose} aria-label="Close task"/><aside className="task-drawer" role="dialog" aria-label={"key" in drawer?`Task ${drawer.key}`:"New task"}>{"key" in drawer?<TaskDetail taskKey={drawer.key} board={board} members={members} onOpen={onOpen} onTask={onTask} onClose={onClose}/>:<NewTask column={drawer.draft} board={board} members={members} onCreated={onOpen} onClose={onClose}/>}</aside></>
}

function TaskDetail({taskKey,board,members,onOpen,onTask,onClose}:{taskKey:string;board:BoardData;members:Member[];onOpen:(key:string)=>void;onTask:(task:Task)=>void;onClose:()=>void}){
  const {data:task,error,isPlaceholderData}=useTask(taskKey); const activity=useTaskActivity(taskKey);
  const update=useUpdateTask(); const move=useMoveTask(task?.boardId??board.id); const remove=useDeleteTask();
  const addComment=useAddComment(); const addSubtask=useAddSubtask(); const toggleSubtask=useUpdateSubtask(); const deleteSubtask=useDeleteSubtask();
  const [tab,setTab]=useState("Overview"); const [menu,setMenu]=useState(false); const [pendingDone,setPendingDone]=useState<Record<string,boolean>>({}); const [comment,setComment]=useState(""); const [newSubtask,setNewSubtask]=useState("");
  const followed=useRef<string|null>(null);
  useEffect(()=>{if(!task||isPlaceholderData)return;const where=`${task.teamId}/${task.boardId}`;if(followed.current===where)return;followed.current=where;onTask(task)},[task,isPlaceholderData,onTask]);
  if(!task) return <><header><div><span>{board.name}</span><ChevronRight/><span>{taskKey}</span></div><div><button className="icon-btn" onClick={onClose} aria-label="Close"><X/></button></div></header><div className="drawer-scroll">{error?<div className="auth-message error" role="alert"><AlertTriangle/>{errorMessage(error)}</div>:<p className="empty-state">Loading task…</p>}</div></>;
  const key=task.id; const done=task.column==="Done";
  const save=(patch:TaskPatch)=>update.mutate({key,patch},{onError:notify("Couldn’t save changes")});
  const setColumn=(column:Column)=>move.mutate({key,column,position:0},{onError:notify(`Couldn’t move ${key}`)});
  const copy=(text:string,what:string)=>{setMenu(false);void navigator.clipboard?.writeText(text).then(()=>toast.success(`Copied ${what}`))};
  // Close first so this drawer's queries don't refetch the task while it is being deleted.
  const destroy=()=>{setMenu(false);if(!window.confirm(`Delete ${key} “${task.title}”? This can’t be undone.`))return;onClose();remove.mutateAsync(task).then(()=>toast.success(`Deleted ${key}`),notify("Couldn’t delete task"))};
  const sendComment=()=>{const body=comment.trim();if(body)addComment.mutate({key,body},{onSuccess:()=>setComment(""),onError:notify("Couldn’t post comment")})};
  const submitSubtask=(e:FormEvent)=>{e.preventDefault();const title=newSubtask.trim();if(title)addSubtask.mutate({key,title},{onSuccess:()=>setNewSubtask(""),onError:notify("Couldn’t add subtask")})};
  return <><header><div><span>{task.project}</span><ChevronRight/><span>{key}</span></div><div><div className="menu-wrap"><button className="icon-btn" aria-label="Task actions" aria-expanded={menu} onClick={()=>setMenu(!menu)}><MoreHorizontal/></button>{menu&&<PopMenu onClose={()=>setMenu(false)}><button onClick={()=>copy(key,key)}><Link2/>Copy task ID</button><button onClick={()=>copy(`${window.location.origin}/?task=${key}`,"link")}><Link2/>Copy link</button><button className="danger" onClick={destroy}><Trash2/>Delete task</button></PopMenu>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X/></button></div></header><div className="drawer-scroll"><div className="drawer-title"><button className={done?"done":""} onClick={()=>setColumn(done?"To Do":"Done")} aria-label={done?"Mark as not done":"Mark as done"} title={done?"Completed — click to reopen":"Mark as done"}>{done?<CheckCircle2/>:<Circle/>}</button><div><div className="tag-row"><PrioritySelect value={task.priority} onChange={priority=>save({priority})}/><Risk risk={task.risk} title={riskTitle(task)}/></div><EditableText tag="h2" value={task.title} label="Task title" required onSave={title=>save({title})}/></div></div><div className="task-meta"><span><Users/>Assignee <AssigneePicker members={members} value={task.assignees.map(a=>a.id)} onChange={assigneeIds=>save({assigneeIds})}/></span><span><CalendarDays/>Due date <DateField value={task.dueDate??""} label={task.due} overdue={task.overdue} onChange={v=>save({dueDate:v||null})}/></span><span><ListChecks/>Status <StatusSelect value={task.column} onChange={setColumn}/></span></div><RiskNote task={task}/><div className="drawer-tabs">{["Overview","Comments","Activity"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}{x==="Comments"&&task.comments>0?` (${task.comments})`:""}</button>)}</div>{tab==="Overview"&&<><section className="description"><h3>Description</h3><EditableText tag="p" value={task.description} label="Add a description…" multiline onSave={description=>save({description})}/></section><section className="subtasks"><div><h3>Subtasks</h3><span>{task.subtasksDone} of {task.subtasksTotal}</span></div>{(task.subtaskList??[]).map(s=><label key={s.id}><input type="checkbox" checked={pendingDone[s.id]??s.done} onChange={e=>{const done=e.target.checked;setPendingDone(p=>({...p,[s.id]:done}));toggleSubtask.mutate({key,subtaskId:s.id,done},{onError:notify("Couldn’t update subtask"),onSettled:()=>setPendingDone(({[s.id]:_,...rest})=>rest)})}}/><span className={s.done?"done":""}>{s.title}</span>{s.assignee&&<Avatar text={s.assignee.initials} src={s.assignee.avatarUrl}/>}<button type="button" className="icon-btn" aria-label={`Delete subtask ${s.title}`} onClick={e=>{e.preventDefault();deleteSubtask.mutate({key,subtaskId:s.id},{onError:notify("Couldn’t delete subtask")})}}><X/></button></label>)}<form className="add-subtask" onSubmit={submitSubtask}><Plus/><input value={newSubtask} onChange={e=>setNewSubtask(e.target.value)} placeholder="Add a subtask and press Enter" aria-label="New subtask" maxLength={200}/></form></section><TaskLinks task={task}/></>}{tab==="Comments"&&<section className="comments">{(task.commentList??[]).length===0&&<p className="empty-state">No comments yet. Start the conversation.</p>}{(task.commentList??[]).map(c=><div key={c.id}><Avatar text={c.author?.initials??"?"} src={c.author?.avatarUrl}/><p><b>{c.author?.name??"Unknown"}</b><br/>{c.body}</p><small title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</small></div>)}<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Write a comment… Use @name to mention (Ctrl+Enter to send)" onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))sendComment()}}/><button className="primary-btn" disabled={!comment.trim()||addComment.isPending} onClick={sendComment}><Send/> Send</button></section>}{tab==="Activity"&&<section className="activity-log">{activity.isPending&&<p><Activity/><span>Loading activity…</span></p>}{(activity.data??[]).map(a=><p key={a.id}><Activity/><span>{`${a.actor?.firstName??"Someone"} ${a.text} ${a.highlight}`.trim()}</span><small title={new Date(a.createdAt).toLocaleString()}>{timeAgo(a.createdAt)}</small></p>)}</section>}
  <AiAssist board={board} task={task} onOpen={onOpen}/></div></>
}

function NewTask({column,board,members,onCreated,onClose}:{column:Column;board:BoardData;members:Member[];onCreated:(key:string)=>void;onClose:()=>void}){
  const {user}=useAuth(); const create=useCreateTask(board.id);
  const [form,setForm]=useState({title:"",description:"",project:"",priority:"Medium" as Priority,column,dueDate:"",assigneeIds:user?[user.id]:[] as string[]});
  const set=<K extends keyof typeof form>(k:K,v:(typeof form)[K])=>setForm(f=>({...f,[k]:v}));
  const submit=(e:FormEvent)=>{e.preventDefault();if(!form.title.trim())return;create.mutate({...form,title:form.title.trim(),project:form.project.trim(),dueDate:form.dueDate||null},{onSuccess:t=>{toast.success(`Created ${t.id}`);onCreated(t.id)},onError:notify("Couldn’t create task")})};
  return <><header><div><span>{board.name}</span><ChevronRight/><span>New task</span></div><div><button className="icon-btn" onClick={onClose} aria-label="Close"><X/></button></div></header><div className="drawer-scroll"><form id="new-task-form" onSubmit={submit}/><div className="drawer-title"><button type="button" disabled tabIndex={-1} aria-hidden="true"><Circle/></button><div><div className="tag-row"><PrioritySelect value={form.priority} onChange={p=>set("priority",p)}/></div><input form="new-task-form" className="title-input" autoFocus required maxLength={200} value={form.title} onChange={e=>set("title",e.target.value)} placeholder="Task title" aria-label="Task title"/></div></div><div className="task-meta"><span><Users/>Assignee <AssigneePicker members={members} value={form.assigneeIds} onChange={ids=>set("assigneeIds",ids)}/></span><span><CalendarDays/>Due date <DateField value={form.dueDate} label={dueLabel(form.dueDate)} onChange={v=>set("dueDate",v)}/></span><span><ListChecks/>Status <StatusSelect value={form.column} onChange={c=>set("column",c)}/></span></div><div className="form-grid new-task-grid"><label>Project<input form="new-task-form" value={form.project} onChange={e=>set("project",e.target.value)} placeholder="e.g. Growth" maxLength={60}/></label><label className="full">Description<textarea form="new-task-form" value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Add more detail…" rows={4}/></label></div><div className="drawer-actions"><button type="submit" form="new-task-form" className="primary-btn" disabled={!form.title.trim()||create.isPending}>{create.isPending?"Creating…":"Create task"}</button><button type="button" className="outline-btn" onClick={onClose}>Cancel</button></div>
  <AiAssist board={board} onOpen={onCreated}/></div></>
}

function RiskNote({task}:{task:Task}){if(task.column==="Done"||task.riskScore===null)return null;return <div className={`risk-note ${task.risk.toLowerCase()}`} title={task.riskSource==="model"?"Scored by the TaskFlow deadline-risk model":"Estimated while the AI service is unavailable"}><WandSparkles/><span><b>{Math.round(task.riskScore*100)}% deadline risk</b>{task.riskFactors.length?` · ${task.riskFactors.join(" · ")}`:" · On track"}</span><small>{task.riskSource==="model"?"AI model":"Estimate"}</small></div>}
function PrioritySelect({value,onChange}:{value:Priority;onChange:(p:Priority)=>void}){return <select className={`priority ${value.toLowerCase()}`} value={value} onChange={e=>onChange(e.target.value as Priority)} aria-label="Priority">{PRIORITIES.map(p=><option key={p}>{p}</option>)}</select>}
function StatusSelect({value,onChange}:{value:Column;onChange:(c:Column)=>void}){return <select className="inline-select" value={value} onChange={e=>onChange(e.target.value as Column)} aria-label="Status">{COLUMNS.map(c=><option key={c}>{c}</option>)}</select>}
function DateField({value,label,onChange,overdue=false}:{value:string;label:string;onChange:(v:string)=>void;overdue?:boolean}){return <span className="date-field"><b className={overdue?"overdue":""}>{label}</b><input type="date" value={value} onChange={e=>onChange(e.target.value)} onClick={e=>{try{e.currentTarget.showPicker()}catch{/* picker unsupported */}}} aria-label="Due date"/></span>}
function AssigneePicker({members,value,onChange}:{members:Member[];value:string[];onChange:(ids:string[])=>void}){
  const [open,setOpen]=useState(false); const chosen=members.filter(m=>value.includes(m.id));
  const label=chosen.length===0?"Unassigned":chosen.length===1?chosen[0]?.name:`${chosen[0]?.firstName} +${chosen.length-1}`;
  return <span className="menu-wrap"><button type="button" className="inline-trigger" aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(!open)}>{chosen.length>0&&<span className="avatar-stack">{chosen.slice(0,3).map(m=><Avatar key={m.id} text={m.initials} src={m.avatarUrl}/>)}</span>}<b>{label}</b><ChevronDown/></button>{open&&<PopMenu onClose={()=>setOpen(false)}>{members.length===0&&<p>No members loaded.</p>}{members.map(m=>{const on=value.includes(m.id);return <button key={m.id} role="menuitemcheckbox" aria-checked={on} onClick={()=>onChange(on?value.filter(id=>id!==m.id):[...value,m.id])}><Avatar text={m.initials} src={m.avatarUrl} online={m.online}/><span>{m.name}</span>{on&&<Check/>}</button>})}</PopMenu>}</span>
}
// Inline-editable heading/paragraph that keeps the original typography.
function EditableText({tag,value,label,onSave,multiline=false,required=false}:{tag:"h2"|"p";value:string;label:string;onSave:(v:string)=>void;multiline?:boolean;required?:boolean}){
  const ref=useRef<HTMLElement>(null);
  useLayoutEffect(()=>{const el=ref.current;if(el&&document.activeElement!==el&&el.innerText!==value)el.innerText=value},[value]);
  const props={contentEditable:"plaintext-only" as const,suppressContentEditableWarning:true,role:"textbox","aria-label":label,"aria-multiline":multiline,"data-placeholder":label,spellCheck:true,
    onBlur:(e:{currentTarget:HTMLElement})=>{const el=e.currentTarget;const v=el.innerText.replace(/\u00a0/g," ").trim();if(!v&&required){el.innerText=value;return}if(v!==value.trim())onSave(v);if(!v)el.innerText=""},
    onKeyDown:(e:{key:string;metaKey:boolean;ctrlKey:boolean;preventDefault:()=>void;currentTarget:HTMLElement})=>{if(e.key==="Enter"&&(!multiline||e.metaKey||e.ctrlKey)){e.preventDefault();e.currentTarget.blur()}else if(e.key==="Escape"){e.currentTarget.innerText=value;e.currentTarget.blur()}}};
  return tag==="h2"?<h2 ref={ref as RefObject<HTMLHeadingElement>} {...props}/>:<p ref={ref as RefObject<HTMLParagraphElement>} {...props}/>
}
function AiAssist({board,task,onOpen}:{board:BoardData;task?:Task;onOpen:(key:string)=>void}){
  const assist=useAiAssist(board.id); const [prompt,setPrompt]=useState(""); const [result,setResult]=useState<AssistResult|null>(null); const [error,setError]=useState<string|null>(null);
  // With an open task the chips act on it; in the new-task drawer they are example requests.
  const suggestions:[string,string][]=task?[["Break into subtasks","Break this into subtasks"],["Summarize comments","Summarize the latest comments"]]:[["Remind team by Friday","Remind the team to finish the auth module by Friday"],["Plan QA with steps","Plan billing QA next week: test upgrades, test downgrades, check invoices"]];
  const submit=()=>{const text=prompt.trim();if(!text||assist.isPending)return;setError(null);setResult(null);assist.mutate(task?{text,taskKey:task.id}:{text},{onSuccess:r=>{setPrompt("");if(!task&&r.intent==="create_task"&&r.task){toast.success(r.reply);onOpen(r.task.id)}else setResult(r)},onError:err=>setError(errorMessage(err))})};
  const created=result?.intent==="create_task"?result.task:undefined;
  return <section className="ai-assist"><header><span><WandSparkles/></span><div><h3>AI Assist</h3><small>Turn a thought into structured action</small></div></header>{assist.isPending&&<div className="ai-result pending" role="status"><Sparkles/> Working on it…</div>}{result&&<div className={result.intent==="unsupported"?"ai-result muted":"ai-result"} role="status"><Check/><div><span>{result.reply}</span>{result.summary&&<p>{result.summary}</p>}{created&&<button type="button" onClick={()=>onOpen(created.id)}>Open {created.id}</button>}{result.source==="rules"&&<small title={result.notice??undefined}>Built-in parser · Claude isn’t connected</small>}</div></div>}{error&&<div className="ai-result error" role="alert"><AlertTriangle/>{error}</div>}<div className="ai-input"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();submit()}}} disabled={assist.isPending} aria-label="AI Assist request" placeholder='Try “remind the team to finish auth by Friday”'/><button disabled={!prompt.trim()||assist.isPending} onClick={submit} aria-label="Send to AI Assist"><ArrowRight/></button></div><div className="suggestions">{suggestions.map(([label,text])=><button key={label} onClick={()=>setPrompt(text)} disabled={assist.isPending}>{label}</button>)}</div></section>}
