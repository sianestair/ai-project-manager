---
name: change-sync-knowledge
description: Apply an accepted VowUp knowledge-delta to knowledge-base/project. Use when the user asks to sync or apply change results back to project truth.
license: MIT
compatibility: Requires VowUp knowledge-base governance.
metadata:
  author: vowup
  adaptedFrom: openspec
  version: "1.0"
---

Apply an accepted VowUp `knowledge-delta.md`.

This replaces OpenSpec's default "sync delta specs to openspec/specs" behavior.
VowUp does not use `openspec/specs/` as current truth.

Command resolution:
- Prefer `changeplan --project <target-project> ...`.
- If the global command is unavailable, use `node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...`.

Lead coordination:
- When invoked by `vowup-change-lead`, treat this skill as the knowledge update executor, not the owner of acceptance or archive decisions.
- Apply only accepted, deterministic current truth from `knowledge-delta.md`.
- If the delta contains assumptions, open questions, future plans, or content not supported by acceptance, stop and report the conflict to the Change Lead.

Steps:

1. Select the change.

   ```bash
   changeplan --project <target-project> list --json
   changeplan --project <target-project> status <change-id> --json
   ```

2. Read:
- root `AGENTS.md`
- `knowledge-base/AGENTS.md`
- `knowledge-base/governance/knowledge-governance.md`
- `knowledge-base/project/AGENTS.md`
- the change `knowledge-delta.md`
- target `knowledge-base/project/` files mentioned by the delta

3. Confirm acceptance has passed or the user explicitly instructed a controlled update.

4. Apply only deterministic accepted truth to `knowledge-base/project/`.
   Do not add open questions, candidates, future plans, or process discussion.

5. Report:
- changed project truth files
- whether the update came from accepted change
- validation performed
- remaining conflicts or risks

Guardrails:
- If `knowledge-delta.md` conflicts with acceptance result, do not apply it.
- If project truth files conflict internally, mark the conflict and stop.
- Do not modify external facts/rules in `knowledge-base/references/` unless the user explicitly requests reference maintenance.
