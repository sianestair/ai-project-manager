---
name: change-apply
description: Implement tasks from a VowUp active change using OpenSpec-derived instructions. Use when the user asks to implement or continue a confirmed change.
license: MIT
compatibility: Requires the project-manager plugin runtime and bundled @fission-ai/openspec.
metadata:
  author: vowup
  adaptedFrom: openspec
  version: "1.0"
---

Implement a VowUp active change.

Important:
- Use `changeplan ...`, not raw OpenSpec change commands.
- Prefer `changeplan --project <target-project> ...`; if the global command is unavailable, use `node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...`.
- Implementation is allowed only when the active change has the required artifacts and confirmed `design.md` plus `tasks.md`.
- Engineering work follows `design.md` and `tasks.md`; `spec.md` and `acceptance.md` constrain behavior and verification.

Lead coordination:
- When invoked by `vowup-change-lead`, treat this skill as the implementation executor for the selected active change.
- Continue through pending tasks without asking for routine implementation choices.
- If implementation reveals a non-blocking task or documentation gap, update the relevant change artifact and continue.
- If implementation reveals a blocking decision, spec/design/tasks conflict, scope expansion, or acceptance-standard change, pause and report it to the Change Lead.
- If the implementation touches contracts, use `vowup-contract-lead` for contract-specific risk, test, and acceptance review.

Steps:

1. Select the change.
   If the user did not name one, run:

   ```bash
   changeplan --project <target-project> list --json
   ```

   If multiple active changes exist, ask which one to use.

2. Get apply instructions:

   ```bash
   changeplan --project <target-project> instructions apply --change <change-id> --json
   ```

3. If the state is `blocked`, stop and report the missing artifacts.
   Do not implement around missing `tasks`, `acceptance`, or `knowledge-delta`.

4. Read every file listed in `contextFiles`.
   This normally includes proposal, context, spec, design, acceptance, knowledge-delta, and tasks.

5. Work through pending tasks in order.
   For each completed task, update `tasks.md` from `- [ ]` to `- [x]`.

6. Run the validation checks defined in `acceptance.md` where possible.
   If a check cannot run, record the reason in the final response.

Guardrails:
- Keep implementation scoped to the current change.
- If implementation reveals a design/spec conflict, pause and update the change artifact first.
- Do not use current source code to redefine product rules.
- Do not write to `knowledge-base/project/` unless applying an accepted `knowledge-delta.md`.
