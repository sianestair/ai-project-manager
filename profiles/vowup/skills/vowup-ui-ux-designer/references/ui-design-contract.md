# VowUp UI Design Contract

## Purpose

Constrain AI UI work to a mature design system and verifiable checks. The agent must not design from a blank page, invent one-off visual values, or replace product decisions with visual preference.

## Design System Baseline

- Use Ant Design as the default enterprise-console design language.
- Use Ant Design components for buttons, forms, modals, tables, tabs, menus, notifications, alerts, drawers, cards, descriptions, steps, pagination, and empty states.
- Do not create custom button, form, modal, table, or notification interactions unless the Change Lead explicitly approves a new design-system extension.
- Use lucide icons or the project's established icon library for icon buttons when available.
- Use an 8px spacing grid.
- Keep one primary action per region.
- Require confirmation for dangerous, irreversible, fund-moving, permission-changing, or transaction-triggering actions.

## VowUp Token Baseline

Use named tokens instead of one-off values.

```yaml
color:
  primary: "#315EFB"
  text-primary: "#17233D"
  text-secondary: "#667085"
  background: "#F7F8FA"
  surface: "#FFFFFF"
  border: "#D0D5DD"
  success: "#12B76A"
  warning: "#F79009"
  danger: "#F04438"
  info: "#2E90FA"
spacing:
  xs: 4
  sm: 8
  md: 16
  lg: 24
  xl: 32
radius:
  control: 8
  card: 8
  dialog: 12
density:
  console: "compact-readable"
```

Do not use values such as `padding: 17px`, `border-radius: 13px`, or ad hoc colors unless the implementation maps them to an approved token.

## UX Heuristics

Apply Nielsen-style usability checks as concrete requirements:

- System status must be visible.
- Use language the user recognizes.
- Provide safe exit, cancel, back, or retry paths where the task can fail or be abandoned.
- Keep layout, terminology, and component behavior consistent.
- Prevent errors before validating them after the fact.
- Prefer recognition over memory.
- Make error messages explain what happened and how to recover.
- Remove irrelevant content and redundant actions.

## Accessibility Baseline

Target WCAG 2.2 AA for user-facing UI.

Automated checks can cover only part of this. The packet must still call out manual checks for:

- Keyboard navigation and focus order.
- Visible focus states.
- Form labels and error associations.
- Color contrast.
- Click target size.
- Non-color status cues.
- Screen-reader-friendly status changes for long-running actions.

## Transaction And Wallet States

For VowUp wallet or contract actions, distinguish these states:

- Wallet disconnected.
- Wrong network or unsupported network.
- Waiting for wallet signature.
- Signature rejected.
- Transaction submitted.
- Chain confirmation pending.
- Confirmed successfully.
- Failed on chain.
- Retriable failure.
- Non-retriable failure requiring user or operator action.

The UI must not collapse these into a single vague loading state.

## Visual Review Evidence

When implementation exists, require evidence appropriate to the surface:

- Storybook states for default, loading, empty, error, disabled, long text, and small screen where Storybook is present.
- Playwright screenshots for key desktop and mobile viewports.
- axe or equivalent accessibility output when available.
- Manual screenshot review for information hierarchy, density, action priority, and text fit.

If the project does not yet have Storybook, Playwright visual baselines, or axe, the packet must say which checks are unavailable and what minimum manual evidence can substitute for the current change.
