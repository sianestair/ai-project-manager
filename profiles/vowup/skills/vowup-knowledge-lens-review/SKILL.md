---
name: vowup-knowledge-lens-review
description: Independent VowUp review skill for business design and knowledge-base changes. Use when a VowUp change creates or changes a business module, knowledge-base/project truth, contract/query/app observable behavior, acceptance surface, module boundary, lifecycle state, event/query projection, permission/funds rule, or when Change Lead needs an external-observability and knowledge-ownership review before design, acceptance, or knowledge-delta updates.
---

# VowUp Knowledge Lens Review

## Overview

Act as an independent reviewer for the VowUp Change Lead. Review a change from the perspective of outside dependents: customers, operators, frontend, Subgraph/query consumers, contract callers, acceptance reviewers, and future maintainers.

The purpose is to answer:

- What does this module promise externally?
- What can outside roles observe, query, trigger, or verify?
- Which facts, rules, and decisions should become `knowledge-base/project/` truth after acceptance?
- Which details should remain implementation detail, process context, or future plan?

## Authority Boundary

This skill does not own the change lifecycle.

Write a return packet under:

```text
changes/active/<change-id>/return-packets/knowledge-lens-review.md
```

Do not directly edit `working-state.md`, `proposal.md`, `context.md`, `spec.md`, `design.md`, `acceptance.md`, `knowledge-delta.md`, or `knowledge-base/project/` unless the Change Lead explicitly asks for that edit after reviewing the packet.

## Independent Session Rule

When subagents or separate agent threads are available, run this review in an independent session. Give the reviewer only the target project path, change id, and required input files. Do not pass the Change Lead's intended answer.

If subagents are unavailable, perform the same review in the current session and state that it was not independently isolated.

## Required Inputs

Read the minimum necessary sources:

- Root and relevant area `AGENTS.md`.
- `changes/active/<change-id>/proposal.md`.
- `context.md`, `spec.md`, `design.md`, `acceptance.md`, and `knowledge-delta.md` when they exist.
- `workflow-state.yaml`, `change-map.md`, `working-state.md`, and relevant `segments/` when the dynamic loop is active.
- Relevant `knowledge-base/project/` facts, rules, decisions, and vocabulary.
- Relevant implementation evidence only after project truth is understood.

Treat `knowledge-base/project/` as current truth. Treat active change files as proposed future truth or process state until accepted.

## Review Workflow

1. Identify external roles that will depend on the module or change.
2. For each role, list what they need to observe, trigger, query, verify, or rely on.
3. Separate externally visible commitments from internal implementation details.
4. Classify proposed knowledge:
   - Current truth candidate after acceptance.
   - Active-change process context only.
   - Implementation detail.
   - Future plan or open question.
5. Check whether acceptance can verify the externally visible commitments.
6. Check whether `knowledge-delta.md` writes only accepted deterministic truth.
7. Record risks, conflicts, and user decisions needed before promotion.

## Return Packet Template

Use this exact structure unless the Change Lead requests a narrower packet:

```markdown
# Knowledge Lens Review

## Source

- Reviewer: VowUp Knowledge Lens Review
- Change: <change-id>
- Date: YYYY-MM-DD

## Target Segment

- <segment id or "planning/knowledge-delta">

## Input Files

- <file>

## External Roles

- <role>: <what this role needs to observe, trigger, query, verify, or rely on>

## Externally Observable Commitments

- <observable fact, rule, lifecycle behavior, event, query result, permission, failure mode, or acceptance result>

## Knowledge Ownership

### Should Become Project Truth After Acceptance

- <fact/rule/decision/vocabulary candidate and suggested target area>

### Should Stay In Active Change

- <process context, unresolved assumption, or temporary planning detail>

### Should Stay As Implementation Detail

- <internal code structure, helper, refactor, or non-contractual detail>

### Should Not Be Written Yet

- <future plan, unaccepted assumption, or unresolved decision>

## Acceptance Impact

- <checks or manual observations needed to verify the external commitments>

## Conflicts And Risks

- <conflict, missing source, weak assumption, or risk>

## Proposed Working-State Content

- <only content safe for Change Lead to consider promoting after confirmation>

## Content That Cannot Be Confirmed

- <items requiring user decision, additional evidence, or acceptance result>
```

## Escalation Rules

Escalate to the Change Lead instead of deciding when the review would change:

- Product behavior or user-visible rules.
- Contract lifecycle, funds, fees, permissions, signatures, or events.
- Query entities, fields, synchronization semantics, or public GraphQL shape.
- Acceptance standards or what counts as "done".
- `knowledge-base/project/` authority, split, or ownership.

## Quality Bar

Prefer concrete questions over generic advice. A useful review names the external role, the observable surface, the knowledge destination, and the verification method.
