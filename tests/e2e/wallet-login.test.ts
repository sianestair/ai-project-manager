import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { test } from "vite-plus/test";
import { parse, stringify } from "yaml";

import { digestFile } from "../../src/core/runtime/materials/digest.js";
import type { ArtifactDigest, ChangeState } from "../../src/core/runtime/state/types.js";
import {
  deliveryDocument,
  designDocument,
  knowledgeDocument,
  requirementsDocument,
} from "../helpers/knowledge-project.js";

const cliPath = resolve("dist/bin/pm.js");

function runCli(args: readonly string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
}

function runJson(args: readonly string[], expectedStatus = 0): Record<string, unknown> {
  const result = runCli(args);
  assert.equal(
    result.status,
    expectedStatus,
    ["command: pm " + args.join(" "), result.stdout, result.stderr].join("\n"),
  );
  const output = expectedStatus === 0 ? result.stdout : result.stderr;
  return JSON.parse(output) as Record<string, unknown>;
}

async function readState(changeRoot: string): Promise<ChangeState> {
  return parse(await readFile(join(changeRoot, "change.yaml"), "utf8")) as ChangeState;
}

async function writeState(changeRoot: string, state: ChangeState): Promise<void> {
  await writeFile(join(changeRoot, "change.yaml"), stringify(state, { lineWidth: 0 }), "utf8");
}

function confirmationArgs(gate: string, changeId: string, projectRoot: string): string[] {
  return [
    "confirm",
    gate,
    changeId,
    "--confirmed-by",
    "user",
    "--summary",
    "User reviewed and explicitly confirmed the wallet-login " + gate + " baseline.",
    "--evidence",
    "Recorded fixture acceptance through the public pm CLI.",
    "--project",
    projectRoot,
    "--json",
  ];
}

function walletRequirementsDocument(): string {
  return requirementsDocument()
    .replace("# Knowledge fixture requirements", "# Connect wallet login requirements")
    .replace("Promote durable knowledge", "Establish an authenticated wallet session")
    .replace(
      "Accepted results become current project knowledge.",
      "A connected EVM wallet proves address ownership with an off-chain signature before an application session exists.",
    )
    .replace("Promotion is atomic", "Wallet authentication outcomes are observable")
    .replace(
      "All targets change or none do.",
      "Success, rejected signing, nonce replay, account switching, disconnect, and session expiry have verifiable results.",
    );
}

function walletDesignDocument(): string {
  return designDocument()
    .replace("# Knowledge fixture design", "# Connect wallet login design")
    .replace("Apply exact post-images", "Authenticate a wallet-backed session")
    .replace(
      "Precheck all targets and recover mechanically.",
      "Issue a one-time nonce, verify an off-chain signature, and establish an expiring HttpOnly session without treating wallet connection as authentication.",
    )
    .replace("ai_project_manager", "user")
    .replace(
      "Fixture implements the already confirmed architecture.",
      "Authentication and session security cross a user-confirmed trust boundary.",
    );
}

function pendingWalletDeliveryDocument(): string {
  return deliveryDocument({
    baseline: "pending",
    final: "pending",
    checkpoint: "pending",
    executedAt: "2026-07-15T00:00:00.000Z",
  })
    .replace("# Knowledge fixture delivery", "# Connect wallet login delivery")
    .replace("Implement atomic promotion", "Implement wallet-backed session authentication")
    .replace("Promote knowledge and archive the Change", "Implement and verify wallet login")
    .replace("- 状态：completed", "- 状态：pending")
    .replace("- 证据：EVID-001, EVID-002, EVID-003, EVID-004", "- 证据：无")
    .replace(/^### EVID-[\s\S]*?(?=^## 材料清单)/mu, "");
}

function completedWalletDeliveryDocument(input: {
  baseline: string;
  final: string;
  checkpoint: string;
  executedAt: string;
}): string {
  return deliveryDocument(input)
    .replace("# Knowledge fixture delivery", "# Connect wallet login delivery")
    .replace("Implement atomic promotion", "Implement wallet-backed session authentication")
    .replace("Promote knowledge and archive the Change", "Implement and verify wallet login")
    .replace("Confirmed patch", "Confirmed requirements and session-security design")
    .replace("Verified knowledge files", "Verified wallet session implementation")
    .replace(
      "Run knowledge and archive acceptance tests",
      "Run success, rejection, replay, account-switch, disconnect, and expiry acceptance tests",
    );
}

function walletKnowledgeDocument(): string {
  return knowledgeDocument()
    .replace("# Knowledge fixture candidates", "# Connect wallet login knowledge candidates")
    .replaceAll("/fixture/", "/wallet-authentication/")
    .replace("Replace current fact", "Replace wallet session fact")
    .replace("Add durable rule", "Add wallet authentication security rule")
    .replace("Remove obsolete decision", "Remove connection-only login decision");
}

function materialArtifacts(value: Record<string, unknown>): ArtifactDigest[] {
  const materials = value.materials as Record<string, { artifacts: ArtifactDigest[] }>;
  return ["requirements", "design", "delivery"]
    .flatMap((name) => materials[name]?.artifacts ?? [])
    .sort((left, right) => left.path.localeCompare(right.path));
}

test("dist CLI completes and recovers the public connect-wallet-login Change", async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-wallet-login-e2e-"));
  const changeId = "wallet-login";
  const changeRoot = join(projectRoot, "changes", "active", changeId);
  const currentFactPath = join(
    projectRoot,
    "knowledge-base",
    "facts",
    "wallet-authentication",
    "current.md",
  );
  const newRulePath = join(
    projectRoot,
    "knowledge-base",
    "rules",
    "wallet-authentication",
    "atomic.md",
  );
  const obsoleteDecisionPath = join(
    projectRoot,
    "knowledge-base",
    "decisions",
    "wallet-authentication",
    "obsolete.md",
  );
  const engineeringPath = join(projectRoot, "engineering", "wallet-session.ts");
  const originalFact =
    "# Wallet session\n\nWallet connection alone is currently treated as application authentication.\n";
  const replacementFact =
    "# Wallet session\n\nA wallet session exists only after a one-time nonce is signed and verified; connection alone is not authentication.\n";
  const newRule =
    "# Wallet authentication security\n\nNonces are single-use, sessions expire, and signatures never authorize assets or transactions.\n";
  const obsoleteDecision =
    "# Connection-only login\n\nA connected address is sufficient to establish a session.\n";

  try {
    runJson(["init", "--project", projectRoot, "--project-id", "wallet-login-e2e", "--json"]);
    await mkdir(join(projectRoot, "knowledge-base", "facts", "wallet-authentication"), {
      recursive: true,
    });
    await mkdir(join(projectRoot, "knowledge-base", "decisions", "wallet-authentication"), {
      recursive: true,
    });
    await writeFile(currentFactPath, originalFact);
    await writeFile(obsoleteDecisionPath, obsoleteDecision);

    runJson([
      "change",
      "start",
      changeId,
      "--title",
      "连接钱包登录",
      "--project",
      projectRoot,
      "--json",
    ]);

    const rawIntent = runJson(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal((rawIntent.change as { phase: string }).phase, "requirements");
    assert.equal(
      (rawIntent.gates as Record<string, { valid: boolean }>).requirements!.valid,
      false,
    );
    const prematureRequirementConfirmation = runJson(
      confirmationArgs("requirements", changeId, projectRoot),
      4,
    );
    assert.equal(
      (prematureRequirementConfirmation.error as { code: string }).code,
      "confirmation_blocked",
    );

    const initialState = await readState(changeRoot);
    initialState.base.dependencies.knowledge = [
      {
        path: "knowledge-base/facts/wallet-authentication/current.md",
        digest: await digestFile(currentFactPath),
        purpose: "Current wallet login and session behavior.",
      },
      {
        path: "knowledge-base/decisions/wallet-authentication/obsolete.md",
        digest: await digestFile(obsoleteDecisionPath),
        purpose: "Existing connection-only login decision under review.",
      },
    ];
    await writeState(changeRoot, initialState);
    await writeFile(join(changeRoot, "requirements.md"), walletRequirementsDocument());
    runJson(confirmationArgs("requirements", changeId, projectRoot));

    await writeFile(join(changeRoot, "design", "README.md"), walletDesignDocument());
    await writeFile(join(changeRoot, "delivery", "README.md"), pendingWalletDeliveryDocument());
    const readinessStatus = runJson(["status", changeId, "--project", projectRoot, "--json"]);
    const readinessState = await readState(changeRoot);
    readinessState.readiness = {
      status: "pass",
      assessed_artifacts: materialArtifacts(readinessStatus),
      concerns: [],
      assessed_at: new Date(Date.parse(readinessState.base.captured_at) + 1_000).toISOString(),
    };
    await writeState(changeRoot, readinessState);

    // Interruption 1: a fresh CLI process reconstructs the design-confirmation boundary.
    const beforeDesignConfirmation = runJson([
      "status",
      changeId,
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal((beforeDesignConfirmation.change as { phase: string }).phase, "design");
    assert.equal(
      (beforeDesignConfirmation.gates as Record<string, { valid: boolean }>).requirements!.valid,
      true,
    );
    assert.equal(
      (beforeDesignConfirmation.available_actions as Array<{ id: string; owner: string }>).some(
        (action) => action.id === "confirm_design" && action.owner === "user",
      ),
      true,
    );
    assert.equal(
      (beforeDesignConfirmation.recovery as { inputs: string[] }).inputs.includes(
        "design/README.md",
      ),
      true,
    );
    runJson(confirmationArgs("design", changeId, projectRoot));

    await mkdir(join(projectRoot, "engineering"), { recursive: true });
    await writeFile(
      engineeringPath,
      "export function establishesSession(_signatureVerified: boolean): boolean {\n  return true;\n}\n",
    );
    const implementationState = await readState(changeRoot);
    implementationState.base.dependencies.engineering = [
      {
        path: "engineering/wallet-session.ts",
        digest: await digestFile(engineeringPath),
        purpose: "Wallet session authentication implementation scope.",
      },
    ];
    await writeState(changeRoot, implementationState);
    const initialScope = runJson(["status", changeId, "--project", projectRoot, "--json"]);
    const initialScopeDigest = (
      initialScope.recovery as { checkpoint: { current_scope_digest: string } }
    ).checkpoint.current_scope_digest;
    const startedImplementation = await readState(changeRoot);
    startedImplementation.implementation = {
      status: "in_progress",
      baseline_revision: "wallet-login-baseline",
      final_revision: null,
      checkpoint: {
        scope_digest: initialScopeDigest,
        captured_at: new Date(
          Date.parse(startedImplementation.base.captured_at) + 2_000,
        ).toISOString(),
      },
    };
    startedImplementation.next_action = {
      owner: "ai_project_manager",
      action: "continue_implementation",
      inputs: ["delivery/README.md"],
    };
    await writeState(changeRoot, startedImplementation);

    const invalidated = runJson([
      "invalidate",
      "implementation",
      changeId,
      "--reason",
      "A local implementation review found that an unverified signature still establishes a session.",
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(invalidated.nextAction, "continue_implementation");
    const rolledBack = await readState(changeRoot);
    assert.equal(rolledBack.gates.requirements.status, "confirmed");
    assert.equal(rolledBack.gates.design.status, "confirmed");
    assert.equal(rolledBack.implementation.status, "in_progress");
    assert.equal(rolledBack.implementation.baseline_revision, "wallet-login-baseline");

    await writeFile(
      engineeringPath,
      "export function establishesSession(signatureVerified: boolean): boolean {\n  return signatureVerified;\n}\n",
    );
    const fixedState = await readState(changeRoot);
    fixedState.base.dependencies.engineering[0]!.digest = await digestFile(engineeringPath);
    await writeState(changeRoot, fixedState);
    const fixedScopeResult = runCli(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal(fixedScopeResult.status, 3, fixedScopeResult.stderr);
    const fixedScope = JSON.parse(fixedScopeResult.stdout) as Record<string, unknown>;
    assert.equal(
      (fixedScope.recovery as { requires_reassessment: boolean }).requires_reassessment,
      true,
    );
    const fixedScopeDigest = (
      fixedScope.recovery as { checkpoint: { current_scope_digest: string } }
    ).checkpoint.current_scope_digest;
    const checkpointed = await readState(changeRoot);
    checkpointed.implementation.checkpoint = {
      scope_digest: fixedScopeDigest,
      captured_at: new Date(Date.parse(checkpointed.base.captured_at) + 3_000).toISOString(),
    };
    await writeState(changeRoot, checkpointed);

    // Interruption 2: another fresh process resumes implementation from the current checkpoint.
    const duringImplementation = runJson(["status", changeId, "--project", projectRoot, "--json"]);
    assert.equal((duringImplementation.change as { phase: string }).phase, "implementation");
    assert.equal(
      (duringImplementation.recovery as { checkpoint: { status: string } }).checkpoint.status,
      "fresh",
    );
    assert.equal(
      (duringImplementation.available_actions as Array<{ id: string }>).some(
        (action) => action.id === "continue_implementation",
      ),
      true,
    );

    const finalRevision = "wallet-login-final";
    const evidenceAt = new Date(Date.parse(checkpointed.base.captured_at) + 4_000).toISOString();
    await writeFile(
      join(changeRoot, "delivery", "README.md"),
      completedWalletDeliveryDocument({
        baseline: "wallet-login-baseline",
        final: finalRevision,
        checkpoint: fixedScopeDigest,
        executedAt: evidenceAt,
      }),
    );
    const acceptanceState = await readState(changeRoot);
    acceptanceState.phase = "acceptance";
    acceptanceState.implementation.status = "verified";
    acceptanceState.implementation.final_revision = finalRevision;
    acceptanceState.next_action = {
      owner: "ai_project_manager",
      action: "prepare_acceptance",
      inputs: ["delivery/README.md"],
    };
    await writeState(changeRoot, acceptanceState);
    const finalMaterialStatus = runJson(["status", changeId, "--project", projectRoot, "--json"]);
    const reassessedState = await readState(changeRoot);
    reassessedState.readiness = {
      status: "pass",
      assessed_artifacts: materialArtifacts(finalMaterialStatus),
      concerns: [],
      assessed_at: new Date(Date.parse(reassessedState.base.captured_at) + 5_000).toISOString(),
    };
    await writeState(changeRoot, reassessedState);

    const acceptanceReady = runJson(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(acceptanceReady.valid, true);
    assert.equal(
      (
        (acceptanceReady.state as Record<string, unknown>).verification as {
          ready_for_acceptance: boolean;
        }
      ).ready_for_acceptance,
      true,
    );
    runJson(confirmationArgs("acceptance", changeId, projectRoot));

    await mkdir(join(changeRoot, "knowledge-post-images"), { recursive: true });
    await writeFile(join(changeRoot, "knowledge-update.md"), walletKnowledgeDocument());
    await writeFile(join(changeRoot, "knowledge-post-images", "KNOW-001.md"), replacementFact);
    await writeFile(join(changeRoot, "knowledge-post-images", "KNOW-002.md"), newRule);
    const preview = runJson(["knowledge", "preview", changeId, "--project", projectRoot, "--json"]);
    assert.equal(preview.targetCount, 3);
    runJson(confirmationArgs("knowledge", changeId, projectRoot));
    const apply = runJson(["knowledge", "apply", changeId, "--project", projectRoot, "--json"]);
    assert.equal(apply.phase, "archive_ready");
    assert.equal(await readFile(currentFactPath, "utf8"), replacementFact);
    assert.equal(await readFile(newRulePath, "utf8"), newRule);
    await assert.rejects(readFile(obsoleteDecisionPath, "utf8"));

    const archiveCheck = runJson([
      "archive",
      "check",
      changeId,
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(archiveCheck.ready, true);
    runJson(["archive", "apply", changeId, "--project", projectRoot, "--json"]);
    const archivedRoot = join(projectRoot, "changes", "archived", changeId);
    const archivedValidation = runJson(["validate", changeId, "--project", projectRoot, "--json"]);
    assert.equal(
      ((archivedValidation.state as Record<string, unknown>).change as { location: string })
        .location,
      "archived",
    );

    const followUpId = "wallet-follow-up";
    const followUpRoot = join(projectRoot, "changes", "active", followUpId);
    runJson(["change", "start", followUpId, "--project", projectRoot, "--json"]);
    const followUpState = await readState(followUpRoot);
    followUpState.base.dependencies.knowledge = [
      {
        path: "knowledge-base/facts/wallet-authentication/current.md",
        digest: await digestFile(currentFactPath),
        purpose: "Confirmed current wallet session behavior.",
      },
    ];
    await writeState(followUpRoot, followUpState);
    const beforeArchiveTamper = runJson(["status", followUpId, "--project", projectRoot, "--json"]);
    const archivedRequirementsPath = join(archivedRoot, "requirements.md");
    await writeFile(
      archivedRequirementsPath,
      (await readFile(archivedRequirementsPath, "utf8")) + "\nHistorical-only sentinel.\n",
    );
    const afterArchiveTamper = runJson(["status", followUpId, "--project", projectRoot, "--json"]);
    assert.deepEqual(afterArchiveTamper, beforeArchiveTamper);

    await writeFile(currentFactPath, replacementFact + "\nCurrent-state drift.\n");
    const afterCurrentKnowledgeDriftResult = runCli([
      "status",
      followUpId,
      "--project",
      projectRoot,
      "--json",
    ]);
    assert.equal(
      afterCurrentKnowledgeDriftResult.status,
      3,
      afterCurrentKnowledgeDriftResult.stderr,
    );
    const afterCurrentKnowledgeDrift = JSON.parse(
      afterCurrentKnowledgeDriftResult.stdout,
    ) as Record<string, unknown>;
    assert.equal(
      (afterCurrentKnowledgeDrift.recovery as { requires_reassessment: boolean })
        .requires_reassessment,
      true,
    );
    assert.equal(
      (
        afterCurrentKnowledgeDrift.recovery as {
          dependency_drift: Array<{ kind: string; status: string }>;
        }
      ).dependency_drift.some(
        (dependency) => dependency.kind === "knowledge" && dependency.status === "changed",
      ),
      true,
    );
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}, 60_000);
