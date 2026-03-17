# UI Tab Redesign Plan

## Goal

Reduce operator cognitive load in the Electron desktop app by grouping tasks into a few clear tabs, keeping all existing capabilities while making the first-run experience easier to understand.

## Design Direction

- Use top-level tabs instead of a single long scrolling page.
- Keep each tab focused on one task domain.
- Add a lightweight overview tab with current health, quick actions, and short guidance.
- Preserve all existing element IDs and API calls so backend behavior remains unchanged.
- Improve visual hierarchy with clearer cards, section labels, spacing, and status styling.

## Proposed Information Architecture

1. Overview
   - Service status
   - Provider health summary
   - Quick actions
   - Short onboarding hints
2. memoQ Integration
   - memoQ version target
   - Custom install directory
   - Integration status
   - Install / repair actions
3. Runtime
   - Interface toggles
   - Network and logging settings
   - LiteLLM settings
   - MT advanced orchestration and prompt areas
4. Providers
   - Default MT provider
   - Provider table
   - Add / save actions
5. Logs
   - Query filters
   - Results table

## Constraints

- No backend API changes for this pass.
- No config schema changes for this pass.
- Keep the page usable without any build step beyond the existing Electron packaging flow.
- Prefer progressive disclosure over introducing more modal flows.

## Acceptance Notes

- A new user should be able to tell where to go for setup, provider configuration, and troubleshooting within a few seconds.
- Primary actions should stay visible near the content they affect.
- Long-form prompt fields should no longer compete visually with health and integration controls.
