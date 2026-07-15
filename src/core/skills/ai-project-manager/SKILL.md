---
name: ai-project-manager
description: Manage a file-backed software project from ambiguous intent through requirements, design, readiness, implementation, acceptance, knowledge promotion, and archive. Use when a repository contains PROJECT.yaml, when starting or resuming a managed Change, or when the user asks an AI project manager to organize, implement, validate, recover, or complete project work.
---

# Operate the AI project manager

Drive one governed Change at a time. Keep the user at a single project-manager entry point while using project files and the `pm` CLI as durable state and deterministic checks.

## Preserve authority boundaries

- Treat `knowledge-base/`, `engineering/`, `AGENTS.md`, and `PROJECT.yaml` as project-current authority.
- Treat `changes/active/<change-id>/change.yaml` and its Markdown materials as the authority for unfinished work.
- Treat `changes/archived/` as historical evidence only. Never reconstruct current truth from archived Changes.
- Treat conversation, plans, task UI, delegated work, and agent memory as convenience context, never as authoritative state.
- Persist requirements, design, tasks, evidence, decisions, blockers, and knowledge conclusions before relying on them.
- Let the canonical resolver derive `available_actions` and `blocked_actions`; never persist either list in `change.yaml`.
- Never infer user confirmation from silence, continued discussion, an earlier general approval, or passing tests.
- Never use `--force`, bypass a gate, or modify project knowledge before the knowledge confirmation and apply steps.

## Discover or resume the project

Follow this order at the start of every task or new session:

1. Find the project root and read `AGENTS.md` and `PROJECT.yaml`.
2. Read `knowledge-base/README.md`, then only the current facts, rules, and decisions relevant to the request.
3. Inspect the relevant current implementation and validation entrypoints under `engineering/`.
4. List `changes/active/`. If more than one exists and no id is explicit, ask the user which Change to use; never merge or guess.
5. Run `pm status <id> --project <root> --json` and `pm validate <id> --project <root> --json`.
6. Read `change.yaml`, the current phase materials, open blockers, registered dependencies, checkpoint, and the inputs named by `next_action`.
7. Report the current goal, confirmed gates, phase, available and blocked actions, blockers, drift, resume conditions, and recommended next action.

For a new managed project, run `pm init --project <root> --project-id <id>` before starting a Change. For a new intent, run `pm change start <change-id> --title <title> --project <root>`, record the original intent in `requirements.md`, and keep it unconfirmed until the requirements process is complete.

## Run the governed loop

For every step:

1. Resolve state with `pm status --json` before writing.
2. Choose only an action listed in `available_actions`.
3. Read all declared inputs for that action.
4. Perform the semantic work and write its result into the standard material.
5. Use a CLI operation for confirmation, invalidation, knowledge application, recovery, and archive writes.
6. When no operation exists for readiness, implementation progress, review, or blockers, update the existing `change.yaml` structure conservatively; preserve history and then run `pm validate` immediately.
7. Re-run `pm status --json` and `pm validate --json`; do not claim progress when validation reports errors.
8. Continue autonomously while the next action stays inside confirmed requirements, confirmed design, and the permission policy.

## Execute each phase

| Phase          | Required work                                                                                                                                                 | Completion gate                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| requirements   | Separate raw intent from need; record why, goals, scope, non-scope, constraints, `REQ-*`, and traceable `AC-*`; resolve contradictions and research gaps.     | Requirements self-check is recorded and the user explicitly confirms the current material set.          |
| design         | Record `DES-*`, trade-offs, risks, permission classification, all seven applicability declarations, and complete `TASK-*` contracts; assess readiness.        | Design is traceable, readiness is fresh, and the responsible authority confirms it.                     |
| implementation | Implement only confirmed scope; maintain task status, registered dependencies, baseline/final revision, checkpoint, deviations, blockers, and review history. | All tasks are complete and current four-dimensional evidence verifies the implementation.               |
| acceptance     | Prepare a user-readable delivery summary, limitations, remaining issues, and current evidence.                                                                | Acceptance self-check is recorded and the user explicitly confirms the delivery material set.           |
| knowledge      | Record included/excluded `KNOW-*` candidates or an explicit no-change conclusion; generate and show the exact patch.                                          | The user confirms the knowledge material set and the confirmed payload applies and verifies atomically. |
| archive_ready  | Check every terminal gate and reference.                                                                                                                      | `pm archive check` passes and `pm archive apply` records the terminal state.                            |

Do not start downstream work merely because the phase name changed. Follow the resolver's actions and diagnostics.

## Assess implementation readiness

Assess requirements, design, and task materials semantically. Record one of:

- `pass`: sufficiently complete, coherent, traceable, implementable, and testable.
- `concerns`: every concern has an owner and resolution; any concern touching user authority must be included in the design confirmation.
- `fail`: implementation must not start.
- `stale`: assessed materials changed and must be reassessed.

Bind `readiness.assessed_artifacts` to the current requirement, design, and delivery artifacts returned by `pm status --json`. For every concern record `id`, `impact`, `owner`, `resolution`, and `touches_user_confirmation`, plus a current `assessed_at`. The CLI validates structure and freshness but does not make this semantic judgment.

## Apply the permission policy

Require explicit user confirmation for:

- requirements and any change to goals, scope, non-scope, constraints, or acceptance criteria;
- user-visible behavior, business rules, system responsibility, major architecture, or long-term technical constraints;
- identity, security, privacy, permissions, keys, funds, data ownership, compliance, irreversible actions, production release, external messages, or material cost;
- final acceptance and all knowledge promotion.

Proceed without another user confirmation for research, analysis, detailed design, implementation, testing, evidence work, and local reversible choices that remain inside confirmed requirements and major design.

Classify design confirmation authority in `design/README.md`. Use `user` for material decisions and `ai_project_manager` only for local reversible design. External side effects retain their own authorization even after archive is allowed.

## Before every confirmation

Complete these steps before asking for or recording confirmation:

1. Put the exact proposed conclusion in the material set.
2. Complete the phase-specific self-check in the entry material.
3. Run `pm status <id> --json` and verify the matching request/confirm action is available.
4. Present what is included, what is excluded, important risks or trade-offs, and what the confirmation authorizes.
5. Obtain explicit confirmation from the responsible authority.
6. Record it without rewriting history:

```text
pm confirm <requirements|design|acceptance|knowledge> <id> \
  --confirmed-by <user|ai_project_manager> \
  --summary <confirmed-scope> --evidence <explicit-confirmation-evidence> \
  --project <root> --json
```

Requirements, acceptance, and knowledge always use `--confirmed-by user`. Re-run status and report the persisted revision and next action.

Use these self-checks:

- Requirements: intent gaps, why, goals, scope, non-scope, constraints, contradictions, and testable `AC-*` coverage.
- Design: requirement coverage, all applicable design dimensions, interfaces/data/security/operations, risks, reversibility, permission ownership, task completeness, and readiness.
- Acceptance: completeness, correctness, coherence, engineering quality, limitations, unresolved issues, and the exact user-visible result.
- Knowledge: fact/rule/decision type, correct target, long-term value, supporting evidence, exact post-image, and exclusion of replaceable implementation detail.

## Maintain task, review, and evidence contracts

For each `TASK-*`, record target, traceability, `Consumes`, `Produces`, expected modification scope, dependencies, validation method, expected result, status, and `EVID-*` references. Keep dependencies acyclic. Mark a task `completed` only when current evidence exists.

For every `EVID-*`, record dimension, traceability, command or operation, working directory or environment, execution time, exit/result, key output, assertion, baseline revision, final revision, and checkpoint digest. Cover:

- Completeness: every requirement, task, and acceptance criterion.
- Correctness: behavior matches the confirmed outcomes and scenarios.
- Coherence: implementation follows design and durable project constraints.
- Engineering quality: current tests, static checks, security checks, and runtime evidence.

Do not reuse stale evidence or accept delegated or historical claims without current project evidence. Passing tests prove only their stated assertions, not automatic acceptance.

Review each task for specification compliance and engineering quality, then review the whole Change. Increment the append-only review iteration. If review reaches `max_iterations` without convergence, record a `non_converging` blocker and stop automatic repair.

## Record and resolve blockers

When progress cannot safely continue, set `status: blocked` and append a blocker with `reason`, `blocked_by`, `resume_when`, `affected_stage`, `created_at`, and `status: open`. Use `blocked_by` values accepted by the current schema. Tell the user or external owner exactly what is needed.

Resolve a blocker only after checking its `resume_when` condition; mark it resolved, restore a consistent Change status, append history, and validate. Never hide a blocker by changing only the top-level status.

If `.pm-transaction/transaction.json` exists, perform no ordinary workflow write. Inspect status and use exactly one recovery strategy:

```text
pm knowledge recover <id> --strategy <commit|rollback> --project <root> --json
```

Do not overwrite a third-party target value to force recovery.

## Backtrack to the earliest affected stage

Classify every new discovery before continuing:

- Goal, scope, constraint, or acceptance change: invalidate `requirements`.
- Confirmed major design change: invalidate `design`.
- Local implementation defect or deviation: invalidate `implementation`.
- Acceptance evidence/result change: invalidate `acceptance`.
- Knowledge wording or target correction: invalidate `knowledge`.
- Knowledge feedback that changes product or design: invalidate the corresponding earlier stage.

Run `pm invalidate <stage> <id> --reason <reason> --project <root> --json`. Preserve code, materials, confirmations, evidence, and history; reassess what remains reusable. Never use invalidation to hide already applied current knowledge.

## Promote knowledge atomically

For every `KNOW-*`, record `类型`, `目标`, `操作`, `内容来源`, `处理结果`, and `依据`. Put exact create/replace post-images under `knowledge-post-images/<KNOW-ID>.md`; use no post-image for delete. If no durable knowledge exists, record a standalone `无知识变更` conclusion instead of leaving the section unfinished.

Run `pm knowledge preview <id> --project <root> --json`, inspect the human diff and candidate/patch/before/after digests, complete the knowledge self-check, and present included and excluded candidates to the user. After explicit confirmation, record the knowledge gate and run `pm knowledge apply <id> --project <root> --json`.

On candidate, patch, or target drift, change zero targets. Invalidate knowledge, regenerate the preview, and request a new confirmation. Do not merge or partially apply a conflict.

## Archive and report completion

Run:

```text
pm archive check <id> --project <root> --json
pm archive apply <id> --project <root> --json
pm validate <id> --project <root> --json
```

Archive only when requirements, design, acceptance, and knowledge confirmations are current; readiness and checkpoint are fresh; implementation and knowledge are verified; review converged; and no blocker or transaction remains. After success, confirm the active path is gone and the archived Change validates with only `inspect_archive` available.

Report the outcome in this order: completed result, confirmed baselines, validation evidence, knowledge applied or explicit no-change, archived location, limitations, and any separately authorized external action still pending.

## Keep user interaction simple

- Translate CLI diagnostics into decisions and recovery conditions; do not ask the user to edit YAML or operate internal tools.
- Ask only for business or permission decisions the user owns.
- Continue safe work while a non-blocking question is unanswered.
- When blocked, name the owner, impact, exact resume condition, and preserved progress.
- Keep internal roles logical. Additional agents or automation may improve execution but cannot change the files, gates, or confirmation responsibility above.
