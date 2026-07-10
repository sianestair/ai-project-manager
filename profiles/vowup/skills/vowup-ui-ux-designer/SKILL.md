---
name: vowup-ui-ux-designer
description: Independent VowUp UI/UX design and review skill for Web Console, admin, wallet, transaction, contract acceptance, form, table, dashboard, and app surfaces. Use when a VowUp change creates or changes a user-facing UI, acceptance console, frontend workflow, page pattern, interaction state, accessibility requirement, visual baseline, Storybook state, Playwright screenshot, or design-system rule.
---

# VowUp UI/UX Designer

## Overview

Act as the UI/UX design subagent for the VowUp Change Lead. Apply the VowUp UI Design Contract to turn product intent into constrained page structure, interaction states, component choices, and verification requirements.

This skill prevents AI from freely inventing UI. It designs and reviews inside fixed constraints: Ant Design language, VowUp tokens, page patterns, state coverage, UX heuristics, WCAG 2.2 AA expectations, Storybook state coverage, and Playwright screenshot evidence.

## Authority Boundary

This skill does not own the change lifecycle or final product decision.

Write a return packet under:

```text
changes/active/<change-id>/return-packets/ui-ux-design.md
```

Do not directly edit `working-state.md`, planning artifacts, frontend code, screenshots, Storybook stories, Playwright tests, or project truth unless the Change Lead explicitly asks for that edit after reviewing the packet.

## Independent Session Rule

When subagents or separate agent threads are available, run this design or review in an independent session. Give the reviewer only the target project path, change id, relevant UI task, and required input files. Do not pass the Change Lead's preferred answer.

If subagents are unavailable, perform the same work in the current session and state that it was not independently isolated.

## Required Inputs

Read the minimum necessary sources:

- Root and relevant area `AGENTS.md`.
- `changes/active/<change-id>/proposal.md`.
- `context.md`, `spec.md`, `design.md`, `acceptance.md`, and `tasks.md` when they exist.
- `workflow-state.yaml`, `change-map.md`, `working-state.md`, and relevant `segments/` when the dynamic loop is active.
- Existing `return-packets/knowledge-lens-review.md` when external observability or acceptance surface concerns are already reviewed.
- Relevant VowUp project truth under `knowledge-base/project/`.
- Existing frontend design-system, Storybook, Playwright, axe, or screenshot files only after the product task is understood.

Treat `knowledge-base/project/` as current truth. Treat active change files as proposed future truth or process state until accepted.

## Reference Loading

Always read `references/ui-design-contract.md` before producing a UI/UX packet.

Read `references/page-patterns.md` when choosing page structure, app flow, or information hierarchy.

Read `references/review-checklist.md` when reviewing implementation, screenshots, Storybook states, Playwright output, axe output, or acceptance coverage.

## Workflow

1. Identify the user task, external roles, target surface, and business outcome.
2. Decide whether the change needs UI/UX design, UI/UX review, or both.
3. Select the smallest fitting page pattern from the allowed patterns. Do not invent a new pattern unless the existing set cannot represent the task.
4. Define information hierarchy: title, primary object, key facts, user decisions, primary action, secondary actions, danger actions, and recovery paths.
5. Map UI to allowed Ant Design components and VowUp tokens. Do not create custom buttons, forms, modals, tables, notification behavior, or one-off visual values.
6. Define all required states: default, loading, empty, error, disabled, hover/focus, long text, small screen, permission denied, wallet disconnected, waiting for signature, transaction submitted, confirming, success, failure, and retry where applicable.
7. Define accessibility and UX checks: status visibility, user language, undo/exit, consistency, error prevention, recognition over recall, useful error recovery, keyboard flow, focus states, labels, contrast, and target size.
8. Define verification evidence: Storybook states, Playwright screenshots, axe/WCAG checks, manual review items, and commands when known.
9. Write the return packet. Include concrete adoption guidance for `design.md`, `acceptance.md`, and `tasks.md`.

## Return Packet Template

Use this exact structure unless the Change Lead requests a narrower packet:

```markdown
# UI/UX Design Review

## Source

- Reviewer: VowUp UI/UX Designer
- Change: <change-id>
- Date: YYYY-MM-DD

## Target Segment

- <segment id or "planning/ui-ux">

## Input Files

- <file>

## User Task And Surface

- User task:
- External roles:
- Target surface:
- Business outcome:

## Design Contract Inputs

- Design system:
- Tokens:
- Page pattern:
- Component constraints:
- Verification constraints:

## Information Architecture

- Primary object:
- Required facts:
- Primary action:
- Secondary actions:
- Danger actions:
- Navigation and exit:

## Interaction And State Model

- Default:
- Loading:
- Empty:
- Error:
- Disabled:
- Permission or wallet state:
- Transaction state:
- Long text:
- Small screen:

## Component And Token Plan

- Layout:
- Components:
- Feedback:
- Data display:
- Forms:
- Tokens:
- Explicitly disallowed custom UI:

## Accessibility And UX Checks

- Status visibility:
- Error prevention and recovery:
- Keyboard and focus:
- Labels and semantics:
- Contrast and target size:
- Consistency:

## Acceptance And Verification Plan

- Storybook states:
- Playwright screenshots:
- axe/WCAG checks:
- Manual visual review:
- Commands:

## Conflicts And Risks

- <conflict, missing source, weak assumption, or risk>

## Proposed Working-State Content

- <only content safe for Change Lead to consider promoting after confirmation>

## Content That Cannot Be Confirmed

- <items requiring user decision, additional evidence, screenshot, implementation, or acceptance result>
```

## Escalation Rules

Escalate to the Change Lead instead of deciding when the design or review would change:

- Product behavior, user-visible rule, lifecycle state, permission, funds flow, or transaction semantics.
- UI Design Contract tokens, allowed components, page pattern inventory, information density, brand voice, or visual baseline.
- Acceptance policy, screenshot baseline, Storybook state requirements, or WCAG target level.
- `knowledge-base/project/` truth, current change scope, or archive readiness.

## Quality Bar

A useful UI/UX packet names the user task, selected page pattern, component mapping, required states, recovery paths, and verification evidence. Avoid generic advice such as "make it clean" or "improve product feel" unless it is converted into a concrete constraint or check.
