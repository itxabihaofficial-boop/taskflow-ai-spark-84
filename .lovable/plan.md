# TaskFlow AI prototype

## What I’ll build
- A polished landing/login screen that enters the product prototype.
- A responsive application shell with collapsible navigation, workspace switcher, search, notifications, theme toggle, and online presence.
- Dashboard, Kanban board, AI standup summaries, team roles, and settings views using realistic mock content.
- A task detail panel with subtasks, comments, activity, risk signals, and an AI Assist composer.

## Interactions
- Switch between every screen without reloads.
- Drag task cards between Kanban columns, filter the board, and open task details.
- Expand/collapse the sidebar, toggle light/dark appearance, switch task panel tabs, and update visual settings controls.
- Include hover, focus, selected, loading-like, and empty states where appropriate.

## Visual direction
- Dark neutral workspace with one electric-blue accent, crisp typography, restrained gradients, subtle shadows, and compact 6–8px corners.
- AI surfaces use a controlled blue/cyan glow and sparkle mark; risk states use accessible green, amber, and red treatments.
- Desktop-first density with tablet/mobile navigation and panels adapted for smaller screens.

## Technical details
- Frontend-only React state and static mock data; no account, database, or external service integration.
- Semantic design tokens in the global stylesheet, reusable screen and control components, and per-page metadata for the home route.
- Validate the rendered prototype at desktop and mobile sizes, including navigation and task-panel interactions.
