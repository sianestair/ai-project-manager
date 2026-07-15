import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  ConfirmationActor,
  DesignPermissionFact,
  GateName,
  SelfCheckFact,
} from "../state/types.js";

interface SectionContract {
  path: string;
  section: string;
  placeholderPrefixes: readonly string[];
}

const SELF_CHECK_CONTRACTS: Record<GateName, SectionContract> = {
  requirements: {
    path: "requirements.md",
    section: "需求门前自检",
    placeholderPrefixes: ["待执行"],
  },
  design: {
    path: "design/README.md",
    section: "设计门前自检",
    placeholderPrefixes: ["待执行"],
  },
  acceptance: {
    path: "delivery/README.md",
    section: "验收门前自检",
    placeholderPrefixes: ["待执行"],
  },
  knowledge: {
    path: "knowledge-update.md",
    section: "知识门前自检",
    placeholderPrefixes: ["待执行"],
  },
};

function fact(
  contract: Pick<SectionContract, "path" | "section">,
  complete: boolean,
  reason: string | null,
): SelfCheckFact {
  return {
    path: contract.path,
    section: contract.section,
    complete,
    reason,
  };
}

function sectionLines(content: string, section: string): string[] | null {
  const lines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const heading = "## " + section;
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return null;
  }

  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/u.test(line.trim())) {
      break;
    }
    if (line.trim() !== "") {
      body.push(line.trim());
    }
  }

  return body;
}

async function readSection(
  changeDirectory: string,
  contract: Pick<SectionContract, "path" | "section">,
): Promise<string[] | null | undefined> {
  try {
    const content = await readFile(join(changeDirectory, ...contract.path.split("/")), "utf8");
    return sectionLines(content, contract.section);
  } catch {
    return undefined;
  }
}

async function resolveSection(
  changeDirectory: string,
  contract: SectionContract,
): Promise<SelfCheckFact> {
  const lines = await readSection(changeDirectory, contract);
  if (lines === undefined) {
    return fact(contract, false, "material_unreadable");
  }
  if (lines === null) {
    return fact(contract, false, "section_missing");
  }
  if (lines.length === 0) {
    return fact(contract, false, "section_empty");
  }
  if (
    lines.some((line) =>
      contract.placeholderPrefixes.some((placeholder) => line.startsWith(placeholder)),
    )
  ) {
    return fact(contract, false, "placeholder_present");
  }

  return fact(contract, true, null);
}

async function resolveDesignPermission(changeDirectory: string): Promise<DesignPermissionFact> {
  const contract = { path: "design/README.md", section: "权限分类" } as const;
  const lines = await readSection(changeDirectory, contract);
  if (lines === undefined) {
    return { ...fact(contract, false, "material_unreadable"), authority: null };
  }
  if (lines === null) {
    return { ...fact(contract, false, "section_missing"), authority: null };
  }

  const authorityMatch = lines
    .map((line) => /^-\s*确认责任[：:]\s*(user|ai_project_manager)\s*$/u.exec(line))
    .find((match) => match !== null);
  const authority = (authorityMatch?.[1] as ConfirmationActor | undefined) ?? null;
  const rationale = lines
    .map((line) => /^-\s*理由[：:]\s*(.+)$/u.exec(line)?.[1]?.trim())
    .find((value) => value !== undefined);

  if (authority === null) {
    return { ...fact(contract, false, "authority_missing"), authority: null };
  }
  if (rationale === undefined || rationale === "" || rationale.startsWith("待记录")) {
    return { ...fact(contract, false, "rationale_missing"), authority };
  }

  return { ...fact(contract, true, null), authority };
}

export async function resolveSelfChecks(changeDirectory: string): Promise<{
  selfChecks: Record<GateName, SelfCheckFact>;
  designPermission: DesignPermissionFact;
}> {
  const entries = await Promise.all(
    (Object.entries(SELF_CHECK_CONTRACTS) as Array<[GateName, SectionContract]>).map(
      async ([gate, contract]) => [gate, await resolveSection(changeDirectory, contract)] as const,
    ),
  );

  return {
    selfChecks: Object.fromEntries(entries) as Record<GateName, SelfCheckFact>,
    designPermission: await resolveDesignPermission(changeDirectory),
  };
}
