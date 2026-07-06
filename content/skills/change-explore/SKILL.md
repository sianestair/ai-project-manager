---
name: change-explore
description: Explore a VowUp idea or active change without implementation. Use when the user wants to think through scope, facts, rules, architecture, or options before writing or applying a change.
license: MIT
compatibility: Requires VowUp repository structure.
metadata:
  author: vowup
  adaptedFrom: openspec
  version: "1.0"
---

Explore before or during a VowUp change.

This is thinking and investigation, not implementation.

Command resolution:
- Prefer `changeplan --project <target-project> ...`.
- If the global command is unavailable, use `node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...`.

Lead coordination:
- When invoked by `vowup-change-lead`, use exploration to reduce uncertainty before proposal, design, or implementation.
- Distinguish evidence gaps from blocking decisions: evidence gaps should be investigated; blocking decisions should be reported to the Change Lead for user confirmation.
- If the discussion crystallizes into a concrete change, recommend moving into `change-plan` rather than keeping decisions only in chat.

At the start, inspect current active changes when relevant:

```bash
changeplan --project <target-project> list --json
```

If a specific change is relevant:

```bash
changeplan --project <target-project> status <change-id> --json
```

Then read the existing change artifacts from `changes/active/<change-id>/`.

Use `knowledge-base/project/` as the current truth source. Use current source code only as implementation evidence, not as product-rule authority.

You may:
- clarify the problem
- compare approaches
- inspect confirmed facts/rules/decisions
- identify conflicts or missing context
- suggest what should go into proposal/context/spec/design/tasks/acceptance/knowledge-delta

You must not:
- implement code
- write future facts/rules into `knowledge-base/project/`
- treat `openspec/specs/` as current truth
- bypass the active change workflow

When discussion crystallizes into a change, offer to create or update VowUp change artifacts through the `change-plan` workflow.
