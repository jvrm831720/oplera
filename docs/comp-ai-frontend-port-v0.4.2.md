# Oplera V0.4.2 — Comp AI CRM frontend port

## Upstream

- Repository: `trycompai/crm`
- Branch: `release`
- Commit: `6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`
- License: MIT
- Visual source of truth: `packages/ui`

The upstream repository was audited before implementation. The port intentionally consumes visual source code and interaction patterns rather than recreating the interface from screenshots.

## Port inventory

### COPIED / adapted imports only

- `packages/ui/src/styles/globals.css`: neutral palette, light/dark surfaces, borders, radius scale, shadows, spacing/container tokens and scrollbar treatment. The Comp primary brand token was replaced with Oplera's primary token.
- `packages/ui/src/components/button.tsx`
- `packages/ui/src/components/badge.tsx`
- `packages/ui/src/components/card.tsx`
- `packages/ui/src/components/table.tsx`
- `packages/ui/src/components/command.tsx`
- `packages/ui/src/components/dashboard.tsx`

### PORTED

- `apps/app/components/app-header.tsx`: 48px application header language, adapted to Oplera data and without auth/enrichment controls.
- `apps/app/components/app-icon-rail.tsx`: 56px desktop icon rail and mobile navigation behavior, adapted to Oplera's six existing surfaces and Lucide icons already present in the project.
- `apps/app/components/agent-composer-frame.ts`: composer frame treatment.
- `apps/app/components/agent-builder/agent-builder-home.tsx`: centered agent-composer layout, suggestions pattern and density.

### ADAPTED

Existing Oplera `OperatorConsoleSnapshot` data is rendered through the ported visual language for:

1. Overview
2. Recovery Queue
3. Opportunities
4. Conversations
5. Policies
6. Activity

No new backend contract is used. The command palette only navigates existing surfaces. The composer is explicitly visual/demo-only and cannot invoke a new agent, LLM or action route.

## Branding

Removed or deliberately not ported:

- Comp AI logo and wordmark
- Comp favicon
- Comp product name and commercial copy
- user identities and demo record names from upstream
- Carbon brand-specific presentation where it would require a new icon dependency

Oplera uses a text/initial wordmark in the same shell footprint and keeps the existing descriptor `Revenue Recovery Agent`.

## Runtime boundaries

Not ported:

- Next.js runtime or routing
- authentication
- database code
- server actions
- TRPC APIs
- enrichment
- organizations/workspaces backend
- deployment configuration
- CRM domain behavior from Comp

The Oplera Bun/React/Vite/MCP runtime remains authoritative.

## Visual QA checklist

Source-level comparisons are anchored to the upstream commit above. Validate the rendered `/demo` in both themes for:

- 48px header
- 56px desktop rail
- 5px base radius and upstream radius hierarchy
- upstream neutral light/dark palette
- table density (`text-xs`, 9px header height semantics, 2/2.5 cell padding)
- button heights and variants
- max-width 1120px page surface
- command palette shape/density
- composer inset shadow, muted surface and focus treatment
- mobile sheet navigation
- Oplera-only branding and copy

No visual QA result should be inferred from this checklist alone; browser/runtime verification is a separate gate.
