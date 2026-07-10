# VowUp Page Patterns

Use these patterns before inventing a new page structure.

## List Page

Use for contracts, vows, users, transactions, or records that need scanning, filtering, and batch navigation.

Structure:

```text
Page Header
  Title
  One-sentence purpose
  Primary action
Filter Bar
  Search
  Status filter
  More filters
Content
  Table or list
  Loading
  Empty
  Error
Pagination
```

Rules:

- Put the primary creation or import action in the header.
- Keep row actions secondary unless the row is the user's main task.
- Show status and next actionable step in the row when the object has a lifecycle.

## Detail Page

Use for one vow, contract, project, transaction, account, or claimable balance.

Structure:

```text
Page Header
  Object name
  Lifecycle status
  Primary action
Summary Band
  Key facts
  Progress or state
Main Content
  Facts and terms
  Activity or history
  Related records
Side or Bottom Actions
  Secondary and danger actions
```

Rules:

- Put the object's current state near the title.
- Separate facts from actions.
- Danger actions require confirmation and recovery guidance.

## Create Flow

Use for creating a vow, submitting a configuration, or preparing a transaction.

Structure:

```text
Step Header
  Current step
  Completion status
Form Body
  Required fields
  Optional advanced fields
Review Step
  Terms summary
  Wallet/network readiness
Submit
  Signature and transaction states
```

Rules:

- Validate before wallet signature.
- Preserve entered data when the user navigates back or a recoverable error occurs.
- Clearly separate form validation errors from wallet or chain failures.

## Dashboard

Use for operational overview, not for every home page.

Structure:

```text
Status Summary
  Critical counts
  Time-sensitive tasks
Work Queue
  Items needing action
Recent Activity
  Latest externally meaningful events
```

Rules:

- Avoid decorative metrics that do not change user decisions.
- Prefer action queues over large hero sections.
- Keep density suitable for repeated work.

## Empty State

Use when a page is structurally valid but has no records.

Rules:

- State what is empty.
- Explain the next useful action.
- Show one primary action at most.
- Do not use promotional copy.

## Error State

Use when loading, query, wallet, or transaction work fails.

Rules:

- Say what failed.
- Say whether user data or funds may be affected.
- Provide retry, back, support, or diagnostic action when possible.
- Preserve entered data on recoverable failures.

## Wallet Connection

Use before wallet-dependent flows.

Structure:

```text
Connection Status
  Wallet disconnected, connected, wrong network, or unsupported
Required Capability
  Why wallet access is needed
Action
  Connect, switch network, retry, or continue read-only
```

Rules:

- Do not block read-only content unless the task truly requires wallet access.
- Treat wrong network as a separate state from disconnected.

## Transaction Confirmation

Use for any wallet signature or on-chain action.

Structure:

```text
Preflight
  Terms and user action
Wallet Signature
  Waiting, rejected, signed
Chain Transaction
  Submitted, confirming, confirmed, failed
Outcome
  Result, next step, recovery
```

Rules:

- Show the action being signed before requesting signature.
- Link or expose transaction identity when submitted.
- Distinguish user rejection from on-chain failure.

## Acceptance Console

Use when a contract or backend capability is done but still needs a human-operable surface.

Structure:

```text
Environment
  Network, contract address, account
Readable State
  Current facts and balances
Actions
  Safe grouped operations
Transaction Feedback
  Wallet and chain states
Evidence
  Result values, event/query references, screenshots
```

Rules:

- Optimize for inspect state, trigger action, and judge business outcome.
- Do not hide raw identifiers that the reviewer needs for verification.
- Keep it utilitarian and explicit rather than marketing-like.
