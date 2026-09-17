# TaskFlow AI Prototype

Build a UI/UX design prototype (frontend only, no backend logic yet) for "TaskFlow AI" — an AI-augmented task management platform in the ClickUp/Linear/Slack style, built for teams.

CORE SCREENS TO DESIGN:

1. Landing/Login page — clean, premium SaaS feel

2. Dashboard (home) — overview of assigned tasks, upcoming deadlines, team activity feed, quick stats cards

3. Kanban board view — draggable columns (To Do / In Progress / Review / Done), task cards with assignee avatars, priority tags, due dates, and a "risk" badge (Low/Medium/High) for deadline risk

4. Task detail panel/modal — title, description, subtasks, comments, activity log, and an "AI Assist" input box where users type natural language (e.g. "remind team to finish auth module by Friday") to auto-generate a task

5. AI Standup Summary view — a card/feed showing AI-generated daily/weekly summaries of team progress, blockers, and risk flags

6. Team & Roles page — member list, role badges (Admin/Manager/Member), permissions toggle

7. Settings page — profile, notifications, integrations placeholder

DESIGN DIRECTION:

- Premium, modern, minimal SaaS aesthetic — dark mode primary, with a clean light mode toggle

- Inspired by the polish of Linear, ClickUp, and Notion — lots of whitespace, subtle gradients, soft shadows, rounded corners

- Accent color: a single confident accent (e.g. electric blue or violet) against a dark neutral base

- Typography: modern sans-serif, strong hierarchy between headings/labels/body

- Use a fixed left sidebar for navigation (Dashboard, Boards, AI Summary, Team, Settings) with a collapsible option

- AI-related elements (AI Assist input, AI Summary cards) should feel visually distinct — subtle glow, sparkle icon, or gradient accent — to signal "AI-powered" without being gimmicky

- Real-time presence: small avatar stack / "who's online" indicators

- Deadline risk badges: color-coded (green/amber/red) pills on task cards

- Fully responsive (desktop-first, but usable on tablet/mobile)

GOAL: Focus entirely on layout, visual hierarchy, component design, and interaction states (hover, active, empty states). No real backend/data — use realistic placeholder/mock data for tasks, users, and AI summaries.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://taskflow-ai-spark-84.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d5e8d931-8ea4-4263-8bf2-9f31d349fce6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
