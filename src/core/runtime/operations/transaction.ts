import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { EXIT_CODES, PmError } from "../cli/errors.js";
import { writeTextAtomic } from "../project/io.js";
import type { KnowledgePatchEnvelope, TransactionFacts } from "../state/types.js";

export const TRANSACTION_DIRECTORY = ".pm-transaction";
const JOURNAL_FILE = "transaction.json";

export interface KnowledgeTransactionJournal {
  schema_version: 1;
  operation: "knowledge_apply";
  change_id: string;
  candidate_digest: string;
  patch_digest: string;
  completed_targets: number;
  targets: Array<{
    path: string;
    before_digest: string;
    after_digest: string;
    before_stage: string | null;
    after_stage: string | null;
  }>;
}

export class SimulatedInterruption extends Error {
  constructor(message = "Simulated transaction interruption.") {
    super(message);
    this.name = "SimulatedInterruption";
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function isJournal(value: unknown): value is KnowledgeTransactionJournal {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const journal = value as Partial<KnowledgeTransactionJournal>;
  return (
    journal.schema_version === 1 &&
    journal.operation === "knowledge_apply" &&
    typeof journal.change_id === "string" &&
    typeof journal.candidate_digest === "string" &&
    typeof journal.patch_digest === "string" &&
    Number.isInteger(journal.completed_targets) &&
    Array.isArray(journal.targets) &&
    journal.targets.every(
      (target) =>
        typeof target === "object" &&
        target !== null &&
        typeof target.path === "string" &&
        typeof target.before_digest === "string" &&
        typeof target.after_digest === "string" &&
        (typeof target.before_stage === "string" || target.before_stage === null) &&
        (typeof target.after_stage === "string" || target.after_stage === null),
    ) &&
    (journal.completed_targets ?? -1) >= 0 &&
    (journal.completed_targets ?? Number.MAX_SAFE_INTEGER) <= journal.targets.length
  );
}

export function transactionRoot(changeDirectory: string): string {
  return join(changeDirectory, TRANSACTION_DIRECTORY);
}

export async function readTransactionJournal(
  changeDirectory: string,
): Promise<KnowledgeTransactionJournal> {
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(join(transactionRoot(changeDirectory), JOURNAL_FILE), "utf8"),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown journal read error.";
    throw new PmError(
      "transaction_journal_invalid",
      "Unable to read the knowledge transaction journal.",
      EXIT_CODES.validation,
      [message],
    );
  }
  if (!isJournal(value)) {
    throw new PmError(
      "transaction_journal_invalid",
      "Knowledge transaction journal has an invalid structure.",
      EXIT_CODES.validation,
    );
  }
  return value;
}

export async function writeTransactionJournal(
  changeDirectory: string,
  journal: KnowledgeTransactionJournal,
): Promise<void> {
  await writeTextAtomic(
    join(transactionRoot(changeDirectory), JOURNAL_FILE),
    JSON.stringify(journal, null, 2) + "\n",
  );
}

export async function createKnowledgeTransaction(input: {
  changeDirectory: string;
  patch: KnowledgePatchEnvelope;
  patchDigest: string;
}): Promise<KnowledgeTransactionJournal> {
  const root = transactionRoot(input.changeDirectory);
  if (await exists(root)) {
    throw new PmError(
      "transaction_pending",
      "A knowledge transaction already requires recovery.",
      EXIT_CODES.conflict,
    );
  }
  try {
    await mkdir(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PmError(
        "transaction_pending",
        "A knowledge transaction already requires recovery.",
        EXIT_CODES.conflict,
      );
    }
    const message = error instanceof Error ? error.message : "Unknown transaction setup error.";
    throw new PmError(
      "transaction_setup_failed",
      "Unable to create the knowledge transaction staging directory.",
      EXIT_CODES.internal,
      [message],
    );
  }
  try {
    await mkdir(join(root, "before"));
    await mkdir(join(root, "after"));
    const targets = [];
    for (const [index, target] of input.patch.targets.entries()) {
      const stageName = String(index).padStart(4, "0") + ".md";
      const beforeStage = target.before_image === null ? null : "before/" + stageName;
      const afterStage = target.after_image === null ? null : "after/" + stageName;
      if (beforeStage !== null) {
        await writeFile(join(root, beforeStage), target.before_image ?? "", {
          encoding: "utf8",
          flag: "wx",
        });
      }
      if (afterStage !== null) {
        await writeFile(join(root, afterStage), target.after_image ?? "", {
          encoding: "utf8",
          flag: "wx",
        });
      }
      targets.push({
        path: target.path,
        before_digest: target.before_digest,
        after_digest: target.after_digest,
        before_stage: beforeStage,
        after_stage: afterStage,
      });
    }

    const journal: KnowledgeTransactionJournal = {
      schema_version: 1,
      operation: "knowledge_apply",
      change_id: input.patch.change_id,
      candidate_digest: input.patch.candidate_digest,
      patch_digest: input.patchDigest,
      completed_targets: 0,
      targets,
    };
    await writeTransactionJournal(input.changeDirectory, journal);
    return journal;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : "Unknown transaction setup error.";
    throw new PmError(
      "transaction_setup_failed",
      "Unable to stage the complete knowledge transaction.",
      EXIT_CODES.internal,
      [message],
    );
  }
}

export async function readStagedImage(
  changeDirectory: string,
  stage: string | null,
): Promise<string | null> {
  return stage === null ? null : readFile(join(transactionRoot(changeDirectory), stage), "utf8");
}

export async function removeTransaction(changeDirectory: string): Promise<void> {
  await rm(transactionRoot(changeDirectory), { recursive: true, force: true });
}

export async function resolveTransactionFacts(
  changeDirectory: string,
): Promise<{ facts: TransactionFacts; error: string | null }> {
  if (!(await exists(transactionRoot(changeDirectory)))) {
    return {
      facts: {
        status: "none",
        operation: null,
        path: null,
        completed_targets: 0,
        total_targets: 0,
        recovery_actions: [],
      },
      error: null,
    };
  }
  try {
    const journal = await readTransactionJournal(changeDirectory);
    return {
      facts: {
        status: "pending",
        operation: journal.operation,
        path: TRANSACTION_DIRECTORY + "/" + JOURNAL_FILE,
        completed_targets: journal.completed_targets,
        total_targets: journal.targets.length,
        recovery_actions: ["commit", "rollback"],
      },
      error: null,
    };
  } catch (error) {
    return {
      facts: {
        status: "invalid",
        operation: null,
        path: TRANSACTION_DIRECTORY,
        completed_targets: 0,
        total_targets: 0,
        recovery_actions: [],
      },
      error: error instanceof Error ? error.message : "Invalid transaction state.",
    };
  }
}
