# VowUp UI/UX Review Checklist

Use this checklist when reviewing a UI implementation, screenshot set, Storybook stories, Playwright run, or acceptance plan.

## Scope Fit

- The UI maps to a named user task and business outcome.
- The selected page pattern is named.
- The UI does not solve product scope that is absent from `spec.md`.
- Any product behavior change is escalated to the Change Lead.

## Design Contract

- Ant Design is the baseline for common controls.
- Components are not custom-built when an Ant Design equivalent exists.
- Values map to approved tokens.
- 8px spacing is respected.
- There is at most one primary action per region.
- Dangerous actions have confirmation and recovery guidance.

## Information Architecture

- The primary object is obvious.
- Lifecycle/status is visible near the object it describes.
- Facts, actions, and history are separated.
- Required user decisions appear before irreversible actions.
- Long identifiers, addresses, signatures, and transaction hashes fit or truncate predictably.

## Interaction States

- Default, loading, empty, error, disabled, hover/focus, long text, and small-screen states are covered.
- Wallet disconnected, wrong network, waiting for signature, rejected signature, submitted, confirming, success, and failure states are distinct when applicable.
- Recoverable failures keep user input.
- Non-recoverable failures explain what the user can do next.

## Accessibility

- Interactive elements are keyboard reachable.
- Focus states are visible.
- Form controls have labels.
- Errors are associated with fields or regions.
- Status changes are perceivable without relying only on color.
- Contrast and target size meet the intended WCAG 2.2 AA baseline.

## Evidence

- Storybook shows expected states when Storybook is available.
- Playwright screenshots cover at least one desktop and one mobile viewport for the changed page or flow when screenshot testing is available.
- axe or equivalent checks are run when available.
- Manual visual review checks text fit, hierarchy, density, action priority, and overlap.
- Missing evidence is recorded as unavailable, not treated as passing.

## Return Packet Severity

Classify findings as:

- Blocker: user cannot complete or verify the task, funds or transaction status may be misunderstood, or accessibility prevents core operation.
- Major: state, recovery, hierarchy, or pattern mismatch will likely cause user error.
- Minor: local inconsistency, polish issue, or missing non-critical evidence.
- Note: observation that does not require action for this change.
