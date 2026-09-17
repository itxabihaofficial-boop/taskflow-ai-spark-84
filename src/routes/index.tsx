import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, AlertTriangle, ArrowRight, Bell, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Circle, Clock3, Command, CreditCard,
  Eye, Filter, Gauge, GripVertical, Inbox, LayoutDashboard, Link2, ListChecks,
  LogOut, Menu, MessageSquare, Moon, MoreHorizontal, Plus, Search, Send,
  Settings, ShieldCheck, Sparkles, Sun, Users, WandSparkles, X, Zap,
} from "lucide-react";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";

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
type Column = "To Do" | "In Progress" | "Review" | "Done";
type Risk = "Low" | "Medium" | "High";
type Task = { id:string; title:string; project:string; column:Column; priority:string; risk:Risk; due:string; avatars:string[]; comments:number; subtasks:string };

const initialTasks: Task[] = [
  { id:"TF-241", title:"Finalize onboarding flow", project:"Growth", column:"To Do", priority:"High", risk:"Medium", due:"Sep 18", avatars:["AM","SK"], comments:4, subtasks:"2/5" },
  { id:"TF-238", title:"Map analytics events", project:"Mobile app", column:"To Do", priority:"Medium", risk:"Low", due:"Sep 22", avatars:["JR"], comments:2, subtasks:"1/3" },
  { id:"TF-233", title:"Build workspace permissions", project:"Platform", column:"In Progress", priority:"Urgent", risk:"High", due:"Today", avatars:["AK","LM"], comments:7, subtasks:"4/8" },
  { id:"TF-229", title:"Polish command palette", project:"Core UX", column:"In Progress", priority:"Medium", risk:"Low", due:"Sep 20", avatars:["SK"], comments:3, subtasks:"3/4" },
  { id:"TF-225", title:"QA billing upgrade paths", project:"Billing", column:"Review", priority:"High", risk:"Medium", due:"Tomorrow", avatars:["LM","JR"], comments:9, subtasks:"7/8" },
  { id:"TF-219", title:"Launch performance dashboard", project:"Platform", column:"Done", priority:"Medium", risk:"Low", due:"Sep 16", avatars:["AM"], comments:5, subtasks:"6/6" },
];
const members = [
  {name:"Ava Morgan", initials:"AM", role:"Admin", title:"Product Lead", online:true},
  {name:"Sami Khan", initials:"SK", role:"Manager", title:"Design Lead", online:true},
  {name:"Leo Martin", initials:"LM", role:"Member", title:"Senior Engineer", online:true},
  {name:"Jo Rivera", initials:"JR", role:"Member", title:"Product Engineer", online:false},
  {name:"Anika Kapoor", initials:"AK", role:"Member", title:"QA Engineer", online:true},
];
const nav = [
  {id:"dashboard" as View,label:"Dashboard",icon:LayoutDashboard}, {id:"boards" as View,label:"Boards",icon:ListChecks},
  {id:"summary" as View,label:"AI Summary",icon:WandSparkles}, {id:"team" as View,label:"Team",icon:Users},
  {id:"settings" as View,label:"Settings",icon:Settings},
];

function TaskFlow(){
  const [entered,setEntered]=useState(false); const [view,setView]=useState<View>("dashboard");
  const [collapsed,setCollapsed]=useState(false); const [mobileOpen,setMobileOpen]=useState(false); const [light,setLight]=useState(false);
  const [tasks,setTasks]=useState(initialTasks); const [selected,setSelected]=useState<Task|null>(null);
  const [query,setQuery]=useState(""); const [filter,setFilter]=useState("All tasks");
  if(!entered) return <Landing onEnter={()=>setEntered(true)} />;
  const go=(v:View)=>{setView(v);setMobileOpen(false)};
  return <div className={light?"light app-root":"app-root"}>
    {mobileOpen&&<button aria-label="Close navigation" className="mobile-scrim" onClick={()=>setMobileOpen(false)}/>} 
    <aside className={`sidebar ${collapsed?"collapsed":""} ${mobileOpen?"mobile-open":""}`}>
      <div className="brand"><Logo/><span>TaskFlow <b>AI</b></span><button className="icon-btn collapse-btn" onClick={()=>setCollapsed(!collapsed)} aria-label="Collapse sidebar"><ChevronLeft/></button></div>
      <button className="workspace"><span className="workspace-mark">A</span><span className="workspace-copy"><strong>Acme Studio</strong><small>Team workspace</small></span><ChevronDown/></button>
      <nav>{nav.map(n=><button key={n.id} onClick={()=>go(n.id)} className={view===n.id?"nav-item active":"nav-item"}><n.icon/><span>{n.label}</span>{n.id==="summary"&&<i>3</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="presence"><span className="presence-dot"/><div><strong>4 teammates online</strong><small>Working across 3 projects</small></div></div><button className="profile-row"><Avatar text="AM" online/><span><strong>Ava Morgan</strong><small>ava@acme.io</small></span><MoreHorizontal/></button></div>
    </aside>
    <div className={`main-shell ${collapsed?"wide":""}`}>
      <header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)}><Menu/></button><div className="mobile-logo"><Logo/><b>TaskFlow</b></div><label className="search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search tasks, people, projects…"/><kbd>⌘ K</kbd></label><div className="top-actions"><div className="avatar-stack">{members.slice(0,3).map(m=><Avatar key={m.initials} text={m.initials}/>) }<span>+2</span></div><button className="icon-btn" onClick={()=>setLight(!light)} aria-label="Toggle theme">{light?<Moon/>:<Sun/>}</button><button className="icon-btn has-alert" aria-label="Notifications"><Bell/></button><button className="primary-btn" onClick={()=>setSelected(initialTasks[0])}><Plus/> New task</button></div></header>
      <main className="content">{view==="dashboard"&&<Dashboard onTask={setSelected} onNavigate={go}/>} {view==="boards"&&<Board tasks={tasks} setTasks={setTasks} selected={selected} setSelected={setSelected} filter={filter} setFilter={setFilter}/>} {view==="summary"&&<Summary/>} {view==="team"&&<Team/>} {view==="settings"&&<SettingsView light={light} setLight={setLight}/>}</main>
    </div>
    {selected&&<TaskPanel task={selected} onClose={()=>setSelected(null)}/>} 
  </div>
}

function Logo(){return <span className="logo"><span/><span/><span/></span>}
function Avatar({text,online=false}:{text:string;online?:boolean}){return <span className="avatar">{text}{online&&<i/>}</span>}
function Landing({onEnter}:{onEnter:()=>void}){return <div className="landing">
  <header><div className="landing-brand"><Logo/><strong>TaskFlow <b>AI</b></strong></div><button className="ghost-btn">Contact sales</button></header>
  <section className="landing-main"><div className="login-intro"><span className="eyebrow"><Sparkles/> Intelligence built into every task</span><h1>Where great teams<br/><em>find their flow.</em></h1><p>Plan work, surface blockers, and turn team conversations into clear action—all in one intelligent workspace.</p><div className="proof"><div className="avatar-stack">{["AM","SK","LM","JR"].map(x=><Avatar key={x} text={x}/>)}</div><span><b>2,400+ teams</b><br/>move faster with TaskFlow</span></div></div>
  <div className="login-card"><div className="login-icon"><Logo/></div><h2>Welcome back</h2><p>Sign in to your workspace</p><button className="sso-btn" onClick={onEnter}><span className="google-g">G</span> Continue with Google</button><div className="divider"><span>or continue with email</span></div><label>Email address<input defaultValue="ava@acme.io"/></label><label>Password<div className="password"><input type="password" defaultValue="password123"/><Eye/></div></label><div className="login-meta"><label><input type="checkbox" defaultChecked/> Remember me</label><button>Forgot password?</button></div><button className="login-submit" onClick={onEnter}>Sign in <ArrowRight/></button><small>Don’t have an account? <b>Start free</b></small></div></section>
  <footer><span>© 2026 TaskFlow AI</span><span>Privacy · Terms · Security</span></footer>
</div>}

function PageHead({eyebrow,title,copy,action}:{eyebrow?:string;title:string;copy:string;action?:ReactNode}){return <div className="page-head"><div>{eyebrow&&<span>{eyebrow}</span>}<h1>{title}</h1><p>{copy}</p></div>{action}</div>}
function Dashboard({onTask,onNavigate}:{onTask:(t:Task)=>void;onNavigate:(v:View)=>void}){return <>
  <PageHead eyebrow="THURSDAY, SEPTEMBER 17" title="Good morning, Ava" copy="Here’s what needs your attention today." action={<button className="primary-btn" onClick={()=>onTask(initialTasks[0])}><Plus/> Create task</button>}/>
  <div className="stats-grid"><Stat icon={<CheckCircle2/>} value="12" label="Completed this week" delta="+18%"/><Stat icon={<Clock3/>} value="8" label="In progress" note="Across 4 projects"/><Stat icon={<AlertTriangle/>} value="3" label="At risk" warning note="Needs attention"/><Stat icon={<Gauge/>} value="87%" label="Team velocity" delta="+6%"/></div>
  <div className="dashboard-grid"><section className="panel assigned"><PanelHead title="My tasks" count="6" action="View board" onAction={()=>onNavigate("boards")}/><div className="task-list">{initialTasks.slice(0,5).map((t,i)=><button key={t.id} className="task-row" onClick={()=>onTask(t)}><span className={`status-ring s${i}`}/><span className="task-main"><strong>{t.title}</strong><small>{t.project} · {t.id}</small></span><Risk risk={t.risk}/><span className="due"><CalendarDays/>{t.due}</span><Avatar text={t.avatars[0]}/></button>)}</div></section>
  <section className="panel activity-panel"><PanelHead title="Team activity" count="Live"/><div className="activity-list">{[{a:"SK",name:"Sami",text:"moved Polish command palette to",b:"In Progress",time:"8m"},{a:"LM",name:"Leo",text:"commented on Workspace permissions",b:"“API is ready for review.”",time:"24m"},{a:"JR",name:"Jo",text:"completed",b:"Analytics schema",time:"1h"},{a:"AK",name:"Anika",text:"flagged a deadline risk on",b:"Billing QA",time:"2h"}].map(x=><div className="activity-item" key={x.time}><Avatar text={x.a}/><p><strong>{x.name}</strong> {x.text}<br/><b>{x.b}</b></p><time>{x.time}</time></div>)}</div></section></div>
  <section className="ai-brief"><div className="ai-mark"><WandSparkles/></div><div><span>AI DAILY BRIEF</span><h3>Your team is on track, with one item needing attention.</h3><p>Workspace permissions is at high risk due to two blocked subtasks. Leo is waiting on the security review.</p></div><button onClick={()=>onNavigate("summary")}>View full summary <ArrowRight/></button></section>
</>}
function Stat({icon,value,label,delta,note,warning=false}:{icon:ReactNode;value:string;label:string;delta?:string;note?:string;warning?:boolean}){return <div className={`stat-card ${warning?"warn":""}`}><span className="stat-icon">{icon}</span><strong>{value}</strong><p>{label}</p><small className={delta?"positive":""}>{delta||note}</small></div>}
function PanelHead({title,count,action,onAction}:{title:string;count:string;action?:string;onAction?:()=>void}){return <div className="panel-head"><div><h2>{title}</h2><span>{count}</span></div>{action&&<button onClick={onAction}>{action}<ArrowRight/></button>}</div>}
function Risk({risk}:{risk:Risk}){return <span className={`risk ${risk.toLowerCase()}`}><i/>{risk}</span>}

function Board({tasks,setTasks,selected,setSelected,filter,setFilter}:{tasks:Task[];setTasks:(v:Task[])=>void;selected:Task|null;setSelected:(t:Task|null)=>void;filter:string;setFilter:(s:string)=>void}){
  const cols:Column[]=["To Do","In Progress","Review","Done"];
  const visible=useMemo(()=>filter==="All tasks"?tasks:tasks.filter(t=>t.risk===filter),[filter,tasks]);
  const drop=(e:DragEvent,column:Column)=>{e.preventDefault();const id=e.dataTransfer.getData("text/plain");setTasks(tasks.map(t=>t.id===id?{...t,column}:t))};
  return <><PageHead eyebrow="PRODUCT & ENGINEERING" title="Launch roadmap" copy="Track work across the team and keep momentum visible." action={<div className="page-actions"><button className="outline-btn"><Users/> Share</button><button className="primary-btn" onClick={()=>setSelected(initialTasks[0])}><Plus/> Add task</button></div>}/>
  <div className="board-toolbar"><div className="view-tabs"><button className="active"><ListChecks/> Board</button><button><Inbox/> List</button></div><div className="filter-wrap"><Filter/><select value={filter} onChange={e=>setFilter(e.target.value)}><option>All tasks</option><option>High</option><option>Medium</option><option>Low</option></select></div></div>
  <div className="kanban">{cols.map((c,ci)=><section className="kanban-col" key={c} onDragOver={e=>e.preventDefault()} onDrop={e=>drop(e,c)}><header><span className={`col-dot c${ci}`}/><h2>{c}</h2><b>{visible.filter(t=>t.column===c).length}</b><button><Plus/></button><button><MoreHorizontal/></button></header><div className="col-body">{visible.filter(t=>t.column===c).map(t=><article draggable key={t.id} onDragStart={e=>e.dataTransfer.setData("text/plain",t.id)} className={selected?.id===t.id?"task-card selected":"task-card"} onClick={()=>setSelected(t)}><div className="card-top"><span>{t.id}</span><GripVertical/></div><h3>{t.title}</h3><p>{t.project}</p><div className="tag-row"><span className={`priority ${t.priority.toLowerCase()}`}>{t.priority}</span><Risk risk={t.risk}/></div><div className="card-foot"><div className="avatar-stack">{t.avatars.map(a=><Avatar key={a} text={a}/>)}</div><span className={t.due==="Today"?"overdue":""}><CalendarDays/>{t.due}</span><span><MessageSquare/>{t.comments}</span></div></article>)}<button className="add-card"><Plus/> Add task</button></div></section>)}</div></>
}

function Summary(){return <><PageHead eyebrow="AI STANDUP" title="Team intelligence" copy="Clear signals from your team’s work—without another status meeting." action={<div className="segmented"><button className="active">Daily</button><button>Weekly</button></div>}/>
  <div className="summary-banner"><div className="ai-mark"><WandSparkles/></div><div><span>THURSDAY · SEPTEMBER 17</span><h2>Momentum is strong. One blocker needs a decision.</h2><p>18 tasks moved forward and 6 were completed since yesterday. The launch remains on track if the security review clears today.</p></div><span className="confidence"><b>94%</b> confidence</span></div>
  <div className="summary-grid"><SummaryCard icon={<CheckCircle2/>} tone="good" title="Progress" count="6 completed" items={["Performance dashboard shipped","Analytics event map ready for QA","Mobile navigation polish complete"]}/><SummaryCard icon={<AlertTriangle/>} tone="danger" title="Blockers & risks" count="3 flagged" items={["Security review blocks permissions","Billing QA deadline is tomorrow","Onboarding copy needs approval"]}/><SummaryCard icon={<Zap/>} tone="blue" title="Next best actions" count="AI suggested" items={["Ask Maya to review permissions","Move analytics QA to Anika","Schedule billing go/no-go"]}/></div>
  <section className="panel timeline"><PanelHead title="Team pulse" count="Last 7 days"/><div className="pulse-chart">{[42,56,48,72,65,82,74].map((h,i)=><div key={i}><span style={{height:`${h}%`}}/><small>{["Fri","Sat","Sun","Mon","Tue","Wed","Thu"][i]}</small></div>)}</div><div className="pulse-legend"><span><i className="done-dot"/>Completed</span><span><i className="flow-dot"/>In progress</span><b>Velocity is up 12% this week</b></div></section>
</>}
function SummaryCard({icon,tone,title,count,items}:{icon:ReactNode;tone:string;title:string;count:string;items:string[]}){return <section className={`summary-card ${tone}`}><header><span>{icon}</span><div><h3>{title}</h3><small>{count}</small></div></header>{items.map((x,i)=><div className="summary-line" key={x}><span>{i+1}</span><p>{x}</p><ChevronRight/></div>)}</section>}

function Team(){const [invite,setInvite]=useState(false); return <><PageHead eyebrow="WORKSPACE" title="Team & roles" copy="Manage who has access and what they can do." action={<button className="primary-btn" onClick={()=>setInvite(!invite)}><Plus/> Invite member</button>}/>{invite&&<div className="invite-bar"><label><span>Invite by email</span><input autoFocus placeholder="name@company.com"/></label><select><option>Member</option><option>Manager</option></select><button className="primary-btn" onClick={()=>setInvite(false)}>Send invite</button></div>}
  <div className="team-stats"><div><Users/><span><b>12</b> members</span></div><div><Activity/><span><b>4</b> online now</span></div><div><ShieldCheck/><span><b>3</b> admins</span></div></div>
  <section className="panel team-table"><div className="table-tools"><label><Search/><input placeholder="Search members…"/></label><button className="outline-btn"><Filter/> Filter</button></div><div className="table-head"><span>Member</span><span>Role</span><span>Status</span><span>Permissions</span><span/></div>{members.map(m=><div className="member-row" key={m.name}><div><Avatar text={m.initials} online={m.online}/><span><strong>{m.name}</strong><small>{m.title}</small></span></div><span className={`role ${m.role.toLowerCase()}`}>{m.role}</span><span className={m.online?"online-state":"offline-state"}><i/>{m.online?"Online":"Offline"}</span><PermissionToggle defaultOn={m.role!=="Member"}/><button className="icon-btn"><MoreHorizontal/></button></div>)}</section></>}
function PermissionToggle({defaultOn}:{defaultOn:boolean}){const [on,setOn]=useState(defaultOn);return <button aria-label="Toggle permissions" className={on?"toggle on":"toggle"} onClick={()=>setOn(!on)}><span/></button>}

function SettingsView({light,setLight}:{light:boolean;setLight:(v:boolean)=>void}){return <><PageHead eyebrow="PERSONAL" title="Settings" copy="Manage your profile, preferences, and connected tools."/><div className="settings-layout"><aside><button className="active"><Users/>Profile</button><button><Bell/>Notifications</button><button><Link2/>Integrations</button><button><CreditCard/>Billing</button></aside><div className="settings-content"><section><h2>Profile</h2><p>Your personal details and public identity.</p><div className="profile-edit"><Avatar text="AM"/><div><button className="outline-btn">Change photo</button><small>JPG or PNG. 2MB max.</small></div></div><div className="form-grid"><label>Full name<input defaultValue="Ava Morgan"/></label><label>Job title<input defaultValue="Product Lead"/></label><label className="full">Email address<input defaultValue="ava@acme.io"/></label></div><button className="primary-btn">Save changes</button></section><section><h2>Preferences</h2><p>Choose how TaskFlow looks and keeps you updated.</p><SettingRow title="Light appearance" copy="Use a bright interface across your workspace"><PermissionToggle defaultOn={light}/></SettingRow><SettingRow title="Deadline risk alerts" copy="Get notified when AI detects a delivery risk"><PermissionToggle defaultOn/></SettingRow><SettingRow title="Daily AI brief" copy="Receive a summary at 9:00 AM on weekdays"><PermissionToggle defaultOn/></SettingRow></section><section><h2>Integrations</h2><p>Connect the tools your team already uses.</p><div className="integrations"><Integration name="Slack" icon="S"/><Integration name="GitHub" icon="G"/><Integration name="Figma" icon="F"/></div></section></div></div></>}
function SettingRow({title,copy,children}:{title:string;copy:string;children:ReactNode}){return <div className="setting-row"><div><strong>{title}</strong><small>{copy}</small></div>{children}</div>}
function Integration({name,icon}:{name:string;icon:string}){return <div><span>{icon}</span><strong>{name}</strong><button className="outline-btn">Connect</button></div>}

function TaskPanel({task,onClose}:{task:Task;onClose:()=>void}){const [tab,setTab]=useState("Overview");const [prompt,setPrompt]=useState("");const [sent,setSent]=useState(false);return <><button className="drawer-scrim" onClick={onClose} aria-label="Close task"/><aside className="task-drawer"><header><div><span>{task.project}</span><ChevronRight/><span>{task.id}</span></div><div><button className="icon-btn"><MoreHorizontal/></button><button className="icon-btn" onClick={onClose}><X/></button></div></header><div className="drawer-scroll"><div className="drawer-title"><button><Circle/></button><div><div className="tag-row"><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><Risk risk={task.risk}/></div><h2>{task.title}</h2></div></div><div className="task-meta"><span><Users/>Assignee <Avatar text={task.avatars[0]}/><b>Ava Morgan</b></span><span><CalendarDays/>Due date <b>{task.due}</b></span></div><div className="drawer-tabs">{["Overview","Comments","Activity"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)} key={x}>{x}</button>)}</div>{tab==="Overview"&&<><section className="description"><h3>Description</h3><p>Finalize the first-run experience for new workspaces. Make sure the flow is clear, fast, and reflects the updated product voice.</p></section><section className="subtasks"><div><h3>Subtasks</h3><span>2 of 4</span></div>{["Review empty states","Finalize welcome checklist","Add invitation step","QA responsive layout"].map((x,i)=><label key={x}><input type="checkbox" defaultChecked={i<2}/><span>{x}</span><Avatar text={["SK","AM","LM","AK"][i]}/></label>)}</section></>}{tab==="Comments"&&<section className="comments"><div><Avatar text="SK"/><p><b>Sami Khan</b><br/>The mobile flow is ready for your final pass.</p><small>34m</small></div><textarea placeholder="Write a comment…"/><button className="primary-btn"><Send/> Send</button></section>}{tab==="Activity"&&<section className="activity-log">{["Ava changed the due date to Sep 18","Sami completed Review empty states","Task moved from Backlog to To Do"].map(x=><p key={x}><Activity/><span>{x}</span><small>Today</small></p>)}</section>}
  <section className="ai-assist"><header><span><WandSparkles/></span><div><h3>AI Assist</h3><small>Turn a thought into structured action</small></div></header>{sent&&<div className="ai-result"><Check/> Draft task created with 3 subtasks and Friday deadline.</div>}<div className="ai-input"><textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder='Try “remind the team to finish auth by Friday”'/><button disabled={!prompt} onClick={()=>{setSent(true);setPrompt("")}}><ArrowRight/></button></div><div className="suggestions"><button onClick={()=>setPrompt("Break this into subtasks")}>Break into subtasks</button><button onClick={()=>setPrompt("Summarize the latest comments")}>Summarize comments</button></div></section></div></aside></>}
