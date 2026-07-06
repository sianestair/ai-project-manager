---
name: change-archive
description: Archive a completed VowUp active change after acceptance and knowledge-delta application. Use when the user wants to finalize a change.
license: MIT
compatibility: Requires the project-manager plugin runtime and bundled @fission-ai/openspec.
metadata:
  author: vowup
  adaptedFrom: openspec
  version: "1.0"
---

Archive a VowUp active change.

Important:
- Do not use raw `openspec archive`.
- Prefer `changeplan --project <target-project> ...`; if the global command is unavailable, use `node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...`.
- VowUp archives move from `changes/active/<change-id>/` to `changes/archived/<date>-<change-id>/`.
- `openspec/specs/` is not the project truth target.

Lead coordination:
- When invoked by `vowup-change-lead`, treat this skill as the archive executor.
- Do not archive until implementation, acceptance, and applicable knowledge update status have been checked.
- If artifacts or tasks are incomplete, or acceptance/knowledge update evidence is missing, report the issue to the Change Lead before using `--force`.

Before archive:
- Implementation tasks are complete.
- Acceptance checks passed or failed checks are explicitly recorded.
- `knowledge-delta.md` has been applied to `knowledge-base/project/` where applicable.
- No unresolved conflict blocks the change.

Steps:

1. Select the change.

   ```bash
   changeplan --project <target-project> list --json
   changeplan --project <target-project> status <change-id> --json
   changeplan --project <target-project> instructions apply --change <change-id> --json
   ```

2. Read `acceptance.md`, `knowledge-delta.md`, and `tasks.md`.

3. If artifacts or tasks are incomplete, ask for explicit confirmation before forcing archive.

4. Archive:

   ```bash
   changeplan --project <target-project> archive <change-id>
   ```

   Use `--force` only after human confirmation.

5. Summarize:
- change id
- archive path
- acceptance result
- knowledge-base updates applied
- any remaining risk
