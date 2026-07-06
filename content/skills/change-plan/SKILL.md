---
name: change-plan
description: Create a VowUp active change using OpenSpec instructions. Use when the user wants to start a change proposal or generate proposal/context/spec/design/acceptance/knowledge-delta/tasks before implementation.
license: MIT
compatibility: Requires the project-manager plugin runtime and bundled @fission-ai/openspec.
metadata:
  author: vowup
  adaptedFrom: openspec
  version: "1.0"
---

Create a VowUp active change with OpenSpec schema support.

Important:
- Use `changeplan ...`, not raw `openspec new`, `openspec status`, or `openspec instructions` for change workflow commands.
- Prefer `changeplan --project <target-project> ...`; if the global command is unavailable, use `node <project-manager-root>/runtime/cli/changeplan.mjs --project <target-project> ...`.
- VowUp active changes live in `changes/active/<change-id>/`.
- `openspec/changes/` and `openspec/specs/` are not VowUp authority.
- `knowledge-base/project/` remains the current project truth.
- VowUp change artifacts must be written in Chinese by default. Keep code names, commands, file names, directory names, interface names, variable names, contract names, function names, and third-party technical terms in English when appropriate.
- Do not copy English template headings verbatim into VowUp change artifacts. Translate artifact headings and explanatory prose into Chinese.

Lead coordination:
- When invoked by `vowup-change-lead`, treat this skill as the planning artifact generator, not the user-facing owner.
- After the user gives intent, autonomously complete all non-blocking planning artifacts.
- Ask the user only for blocking decisions defined by repository rules; otherwise make conservative assumptions and record them in the appropriate artifact.
- If the change touches contracts, use `vowup-contract-lead` for contract-domain analysis before finalizing contract design, tasks, or acceptance checks.

Steps:

1. Resolve a kebab-case change id from the user request.
   If the requested change is unclear, ask a concise question before creating files.

2. Create the change:

   ```bash
   changeplan --project <target-project> new <change-id> --description "<short description>"
   ```

3. Inspect artifact status:

   ```bash
   changeplan --project <target-project> status <change-id> --json
   ```

4. Generate artifacts in dependency order until all `applyRequires` artifacts are complete.
   For each ready artifact:

   ```bash
   changeplan --project <target-project> instructions <artifact-id> --change <change-id> --json
   ```

   Then:
   - Read dependency files listed in the instructions.
   - Use `template` as the output structure.
   - Apply `context` and `rules` as constraints.
   - Do not copy the injected context or rules into the artifact.
   - Translate template headings and prose into Chinese while preserving required file names and technical identifiers.
   - Write the file to `resolvedOutputPath`.

6. After all artifacts are complete, run the language guard when available:

   ```bash
   node <project-manager-root>/profiles/vowup/scripts/check-change-language.mjs --project <target-project> <change-id>
   ```

7. Stop before implementation unless the user explicitly asks to apply the change.

Required artifact purpose:
- `proposal.md`: why this change exists.
- `context.md`: which current truth and references the change consumes.
- `spec.md`: future facts and future rules.
- `design.md`: selected implementation approach.
- `acceptance.md`: how to verify the spec.
- `knowledge-delta.md`: project truth updates after acceptance.
- `tasks.md`: executable implementation checklist.

Guardrails:
- Do not treat old implementation code as product truth.
- Do not write future facts/rules into `knowledge-base/project/` before acceptance passes.
- Do not start engineering implementation without confirmed `design.md` and `tasks.md`.
- Do not stop after each artifact for confirmation unless a blocking decision exists.
