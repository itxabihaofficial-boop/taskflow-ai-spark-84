// Shapes returned by the TaskFlow API (see backend/src/services/serializers.js).
export type Column = "To Do" | "In Progress" | "Review" | "Done";
export type Risk = "Low" | "Medium" | "High";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type Role = "Admin" | "Manager" | "Member";

export const COLUMNS: Column[] = ["To Do", "In Progress", "Review", "Done"];
export const PRIORITIES: Priority[] = ["Low", "Medium", "High", "Urgent"];
export const ROLES: Role[] = ["Admin", "Manager", "Member"];

export type Person = {
  id: string;
  name: string;
  firstName: string;
  initials: string;
  title: string;
  avatarUrl?: string | null;
};

export type Subtask = { id: string; title: string; done: boolean; assignee: Person | null };
export type Comment = { id: string; author: Person | null; body: string; createdAt: string };

export type Task = {
  id: string; // human key, e.g. "TF-241"
  _id: string;
  boardId: string;
  teamId: string;
  title: string;
  description: string;
  project: string;
  column: Column;
  position: number;
  priority: Priority;
  risk: Risk;
  riskScore: number | null;
  riskFactors: string[];
  riskSource: "model" | "heuristic" | "none";
  due: string;
  dueDate: string | null;
  overdue: boolean;
  avatars: string[];
  assignees: Person[];
  comments: number;
  subtasks: string;
  subtasksDone: number;
  subtasksTotal: number;
  source: "manual" | "ai";
  createdBy: Person | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  linkCount?: number;
  subtaskList?: Subtask[];
  commentList?: Comment[];
  linkList?: TaskLink[];
};

export type TaskLink = {
  id: string;
  kind: "link" | "figma" | "github-pr" | "github-commit";
  url: string;
  title: string;
  meta: {
    fileKey?: string;
    thumbnailUrl?: string | null;
    lastModified?: string | null;
    repo?: string;
    number?: number;
    state?: string;
    sha?: string;
    author?: string;
  };
  addedBy: Person | null;
  createdAt: string;
};

export type Board = {
  id: string;
  teamId: string;
  name: string;
  description: string;
  category: string;
  key: string;
  columns: Column[];
};

export type TeamSummary = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  myRole: Role | null;
  canManage: boolean;
  plan: PlanTier;
};

export type Member = Person & { email: string; role: Role; canManage: boolean; joinedAt: string; online: boolean };
export type Invite = { id: string; email: string; role: Role; createdAt: string };
export type TeamDetail = TeamSummary & { members: Member[]; invites: Invite[] };

export type ActivityItem = {
  id: string;
  type: string;
  actor: Person | null;
  text: string;
  highlight: string;
  taskKey: string | null;
  taskTitle: string | null;
  boardId: string | null;
  createdAt: string;
};

export type DashboardStats = {
  completedThisWeek: number;
  completedDelta: number | null;
  inProgress: number;
  inProgressProjects: number;
  atRisk: number;
  velocity: number | null;
  velocityDelta: number | null;
};

export type StandupPeriod = "daily" | "weekly";

export type Standup = {
  period: StandupPeriod;
  date: string;
  headline: string;
  overview: string;
  progress: string[];
  blockers: string[];
  nextActions: string[];
  source: "llm" | "rules";
  model: string | null;
  notice: string | null;
  /** Share (0-100) of open work the risk model expects to land on time. */
  confidence: number | null;
  counts: { completed: number; moved: number; created: number; atRisk: number };
  pulse: { date: string; label: string; completed: number; started: number }[];
  velocityChange: number | null;
  /** Task key each progress / blocker / action line refers to (absent on older cached briefs). */
  refs?: { progress: (string | null)[]; blockers: (string | null)[]; nextActions: (string | null)[] };
  generatedAt: string;
  cached: boolean;
  stale: boolean;
};

export type Dashboard = { stats: DashboardStats; myTasks: Task[]; activity: ActivityItem[] };

export type TaskPatch = Partial<{
  title: string;
  description: string;
  project: string;
  column: Column;
  priority: Priority;
  dueDate: string | null;
  assigneeIds: string[];
}>;

export type TaskInput = TaskPatch & { title: string; subtasks?: string[] };

export type BoardSummary = Board & { openTasks: number };

export type PlanTier = "Free" | "Pro" | "Business";

export type NotificationItem = {
  id: string;
  type: "assigned" | "comment" | "mention" | "completed" | "risk" | "due_soon" | "daily_brief" | "workspace";
  title: string;
  body: string;
  taskKey: string | null;
  teamId: string | null;
  boardId: string | null;
  target: "task" | "summary" | "team" | "dashboard";
  read: boolean;
  actor: { name: string; initials: string; avatarUrl: string | null };
  createdAt: string;
};

export type SearchResults = {
  tasks: (Task & { boardName: string })[];
  people: { id: string; name: string; email: string; title: string; role: Role; initials: string; avatarUrl: string | null }[];
  projects: { name: string; open: number; total: number }[];
};

export type Plan = {
  tier: PlanTier;
  price: number;
  priceNote: string;
  limits: { members: number | null; boards: number | null; aiRequests: number | null };
};

export type Billing = {
  plan: Plan & { seats: number | null; since: string | null };
  usage: { members: number; pendingInvites: number; boards: number; openTasks: number; aiRequests: number; month: string };
  plans: Plan[];
  upgradeRequest: { tier: PlanTier; seats: number | null; note: string; requestedBy: string | null; requestedAt: string } | null;
};

export type SlackEvent = "task.created" | "task.completed" | "risk.flagged" | "comment.added";

export type Integrations = {
  slack: {
    connected: boolean;
    webhookHint: string | null;
    events: SlackEvent[];
    availableEvents: SlackEvent[];
    connectedAt: string | null;
    lastDeliveryAt: string | null;
    lastError: string | null;
  };
  github: {
    connected: boolean;
    webhookUrl: string;
    secretHint: string | null;
    connectedAt: string | null;
    lastEventAt: string | null;
    lastEvent: string | null;
    repositories: string[];
  };
  figma: { connected: boolean; handle: string | null; email: string | null; connectedAt: string | null };
};
