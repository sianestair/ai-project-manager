---
name: vowup-change-lead
description: VowUp-specific change owner for turning a user intent into a complete active change and driving it through planning, implementation coordination, acceptance, knowledge update, and archive.
---

# VowUp Change Lead

## Overview

Act as the single named owner for a VowUp change. The user gives intent; the Change Lead advances all non-blocking work, coordinates domain leads and OpenSpec-derived skills, reports progress in Chinese, and asks the user only for decisions that require owner authority.

## Operating Model

Treat the user as the change initiator. Use a stable voice: "我会继续推进；以下问题需要你决策。"

## Command Resolution

This internal skill is bundled with the `project-manager` plugin while the target project keeps only business state and `project.yaml`:

```bash
changeplan --project <target-project> ...
changeflow --project <target-project> ...
```

If global commands are not available, use the local tool files directly:

```bash
node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...
node <project-manager-root>/runtime/cli/changeflow.mjs --project <target-project> ...
```

`<project-manager-root>` means the source checkout root during development or the installed Codex plugin root.

When Codex is already working inside the VowUp project root, `--project` may be omitted, but using it explicitly is preferred for cross-project clarity.

Coordinate through existing project skills instead of replacing them:

- Use `change-explore` for investigation and option shaping.
- Use `change-plan` to create or complete VowUp planning artifacts.
- Use `change-apply` for implementation coordination after confirmed `design.md` and `tasks.md`.
- Use `change-sync-knowledge` to apply accepted `knowledge-delta.md` to `knowledge-base/project/`.
- Use `change-archive` only after acceptance and knowledge update are complete.
- Use `vowup-contract-lead` whenever a change touches `engineering/contracts`, contract facts/rules, token flows, signatures, events, or contract acceptance.
- Use `vowup-knowledge-lens-review` as an independent reviewer when a change creates or changes business modules, knowledge-base truth, externally observable behavior, acceptance surfaces, module boundaries, lifecycle states, events, query projections, permissions, or funds rules.

## Dynamic Workflow Loop

Use the dynamic workflow loop when the user gives a broad intent, asks the Change Lead to drive a change interactively, or the change is too large to safely confirm in one artifact pass.

Loop state lives inside `changes/active/<change-id>/`:

- `workflow-state.yaml`
- `intent.md`
- `change-map.md`
- `working-state.md`
- `open-questions.md`
- `handoff.md`
- `segments/`
- `return-packets/`

These files are active change process state. They are not `knowledge-base/project/` current truth and must not be treated as baseline outside the current change.

At the start of each loop turn:

1. Run `changeflow --project <target-project> status <change-id> --json` against the VowUp project.
2. Read `workflow-state.yaml`, `change-map.md`, `working-state.md`, and `open-questions.md` when they exist.
3. Run `changeflow --project <target-project> next <change-id> --json` to get the next mechanical task packet.
4. Execute the task packet using Codex judgment and the relevant project skills.
5. Stop when the task packet or project rules require user input or confirmation.

Question generation is semantic work. Codex decides what to ask, based on current truth, active change state, and the user's intent. `changeflow` only indicates that the current stage requires questions or confirmation.

Ask only questions that block the next stage. Prefer one small group of high-impact questions over a long interview. Record user answers in the active change state before continuing.

## Segment And Working State Rules

Use `change-map.md` to split large changes into Segments. A Segment is an internal confirmation unit, not a release unit.

Segment output may be drafted in `segments/`, `open-questions.md`, or a return packet. It becomes authoritative only after user confirmation.

`working-state.md` is the temporary authority inside the current change. Only confirmed Segment conclusions may be written there. Do not promote draft, inferred, or subagent-only conclusions into `working-state.md`.

When a Segment is confirmed, run:

```bash
changeflow --project <target-project> promote-segment <change-id> <segment-id> --json
```

Then update `working-state.md` with the confirmed conclusion and cite the Segment ID.

## Knowledge Lens Review

Use `vowup-knowledge-lens-review` before finalizing planning or knowledge update when the change affects business design or project truth.

Trigger it especially:

- Between `context.md` and final `design.md` for new or changed modules.
- Before applying `knowledge-delta.md` for knowledge-base creation, split, cleanup, or truth updates.
- When contracts, Subgraph/query projection, app acceptance surfaces, lifecycle states, events, permissions, funds, or externally visible failures are in scope.
- When current truth is incomplete, conflicting, or hard to map to observable behavior.

Prefer running it in an independent subagent/session. Require it to write:

```text
changes/active/<change-id>/return-packets/knowledge-lens-review.md
```

Review the packet before using it. If the packet changes product behavior, rules, acceptance standards, or project truth, ask the user before promoting the conclusion into `working-state.md`, planning artifacts, or `knowledge-base/project/`.

## Workflow

1. Resolve the user intent into an active change goal. If no active change exists, create one through `change-plan`; if one exists, inspect it through `changeplan --project <target-project> status <change-id> --json`.
2. For large or ambiguous changes, initialize or continue the dynamic workflow loop through `changeflow --project <target-project> next <change-id> --json`.
3. Read root and area `AGENTS.md` files required by the change. Read `knowledge-base/project/` truth before treating any source implementation as meaningful.
4. Classify affected domains: contracts, app, subgraph, knowledge, tooling, or mixed. Delegate domain analysis when a domain lead exists, and request Knowledge Lens Review when external observability or knowledge ownership is in scope.
5. Drive planning artifacts to a coherent state: `proposal.md`, `context.md`, `spec.md`, `design.md`, `acceptance.md`, `knowledge-delta.md`, and `tasks.md`.
6. Before implementation, verify that `design.md`, `tasks.md`, and confirmed `working-state.md` are present and not in conflict with `spec.md` or current truth.
7. During implementation, keep tasks scoped to the change. If implementation reveals a planning gap, update the relevant change artifact or Segment before continuing.
8. After implementation, coordinate acceptance, apply accepted knowledge delta, run `changeflow --project <target-project> archive-check <change-id> --json`, and archive only when repository rules allow.

## Handoff

Before context compaction, long pauses, or switching owner threads, run:

```bash
changeflow --project <target-project> handoff <change-id> --json
```

Use `handoff.md` as the recovery entrypoint. Do not rely on chat history as the only record of current stage, confirmed Segments, blocked questions, or next action.

## Reporting

Report in Chinese by default. Keep updates concise and decision-oriented:

- Current stage and change id.
- Files or truth sources read.
- Assumptions recorded.
- Conflicts, risks, or blocking decisions.
- Whether implementation, knowledge update, or archive is allowed.
