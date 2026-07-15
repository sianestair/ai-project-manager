import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stringify } from "yaml";

import { digestFile, digestText } from "../../src/core/runtime/materials/digest.js";
import { resolveMaterialSets } from "../../src/core/runtime/materials/sets.js";
import { initializeProject } from "../../src/core/runtime/project/init.js";
import { startChange } from "../../src/core/runtime/project/change-start.js";
import { readChangeState } from "../../src/core/runtime/project/discover.js";
import { readinessArtifacts } from "../../src/core/runtime/governance/readiness.js";
import { validateChangeState } from "../../src/core/runtime/state/schema.js";
import type {
  ChangeState,
  ConfirmationActor,
  GateName,
  ResolvedMaterialSet,
} from "../../src/core/runtime/state/types.js";

export function requirementsDocument(): string {
  return [
    "# Knowledge fixture requirements",
    "",
    "### REQ-001: Promote durable knowledge",
    "",
    "- 说明：Accepted results become current project knowledge.",
    "",
    "### AC-001: Promotion is atomic",
    "",
    "- 追溯：REQ-001",
    "- 断言：All targets change or none do.",
    "",
    "## 需求门前自检",
    "",
    "需求范围和验收标准均已检查。",
    "",
  ].join("\n");
}

export function designDocument(): string {
  return [
    "# Knowledge fixture design",
    "",
    "## 设计范围覆盖",
    "",
    "- 架构与模块职责：涉及：knowledge operation owns promotion",
    "- 接口与协议：涉及：knowledge and archive CLI",
    "- 数据：涉及：versioned patch envelope",
    "- 交互：不适用：no UI",
    "- 安全：涉及：path confinement and digest conflicts",
    "- 运行：涉及：transaction recovery",
    "- 决策记录：不适用：fixture uses confirmed architecture",
    "",
    "### DES-001: Apply exact post-images",
    "",
    "- 追溯：REQ-001, AC-001",
    "- 决定：Precheck all targets and recover mechanically.",
    "",
    "## 权限分类",
    "",
    "- 确认责任：ai_project_manager",
    "- 理由：Fixture implements the already confirmed architecture.",
    "",
    "## 材料清单",
    "",
    "- `design/README.md`",
    "",
    "## 设计门前自检",
    "",
    "需求覆盖、风险和权限均已检查。",
    "",
  ].join("\n");
}

export function deliveryDocument(input: {
  baseline: string;
  final: string;
  checkpoint: string;
  executedAt: string;
}): string {
  const dimensions = ["Completeness", "Correctness", "Coherence", "Engineering quality"];
  return [
    "# Knowledge fixture delivery",
    "",
    "### TASK-001: Implement atomic promotion",
    "",
    "- 目标：Promote knowledge and archive the Change",
    "- 追溯：REQ-001, DES-001, AC-001",
    "- Consumes：Confirmed patch",
    "- Produces：Verified knowledge files",
    "- 预计修改范围：knowledge-base and active Change",
    "- 依赖任务：无",
    "- 验证方法：Run knowledge and archive acceptance tests",
    "- 预期结果：Atomic application and complete archive",
    "- 状态：completed",
    "- 证据：EVID-001, EVID-002, EVID-003, EVID-004",
    "",
    "## 验证与证据",
    "",
    ...dimensions.map((dimension, index) => "- " + dimension + "：EVID-00" + String(index + 1)),
    "",
    ...dimensions.flatMap((dimension, index) => [
      "### EVID-00" + String(index + 1) + ": " + dimension,
      "",
      "- 维度：" + dimension,
      "- 追溯：REQ-001, DES-001, AC-001, TASK-001",
      "- 命令或操作：pnpm run verify",
      "- 工作目录或环境：fixture / Node.js",
      "- 执行时间：" + input.executedAt,
      "- 退出码或结果：0",
      "- 关键输出：fixture passed",
      "- 断言：" + dimension + " is covered",
      "- 基线 revision：" + input.baseline,
      "- 最终 revision：" + input.final,
      "- checkpoint digest：" + input.checkpoint,
      "",
    ]),
    "## 材料清单",
    "",
    "- `delivery/README.md`",
    "",
    "## 验收门前自检",
    "",
    "四维证据和用户验收范围均已检查。",
    "",
  ].join("\n");
}

export function knowledgeDocument(): string {
  return [
    "# Knowledge fixture candidates",
    "",
    "## 候选知识",
    "",
    "### KNOW-001: Replace current fact",
    "",
    "- 类型：事实",
    "- 目标：knowledge-base/facts/fixture/current.md",
    "- 操作：替换",
    "- 内容来源：knowledge-post-images/KNOW-001.md",
    "- 处理结果：纳入",
    "- 依据：REQ-001, DES-001, AC-001, EVID-001",
    "",
    "### KNOW-002: Add durable rule",
    "",
    "- 类型：规则",
    "- 目标：knowledge-base/rules/fixture/atomic.md",
    "- 操作：新增",
    "- 内容来源：knowledge-post-images/KNOW-002.md",
    "- 处理结果：纳入",
    "- 依据：REQ-001, DES-001, AC-001, EVID-002",
    "",
    "### KNOW-003: Remove obsolete decision",
    "",
    "- 类型：决策",
    "- 目标：knowledge-base/decisions/fixture/obsolete.md",
    "- 操作：删除",
    "- 内容来源：无",
    "- 处理结果：纳入",
    "- 依据：REQ-001, DES-001, AC-001, EVID-003",
    "",
    "## 用户处理结果",
    "",
    "两项候选均进入精确补丁预览，最终确认由 knowledge gate 记录。",
    "",
    "## 知识门前自检",
    "",
    "知识类型、目标、长期有效性和实现细节排除项均已检查。",
    "",
  ].join("\n");
}

function confirmation(
  gate: GateName,
  actor: ConfirmationActor,
  material: ResolvedMaterialSet,
  at: string,
) {
  return {
    revision: 1,
    artifacts: material.artifacts,
    confirmed_by: actor,
    confirmed_at: at,
    summary: "Confirmed " + gate + " fixture baseline.",
    evidence: "Explicit fixture confirmation.",
  };
}

export async function createKnowledgeProject(changeId: string): Promise<{
  projectRoot: string;
  changeRoot: string;
  currentFactPath: string;
  newRulePath: string;
  obsoleteDecisionPath: string;
  originalFact: string;
  replacementFact: string;
  newRule: string;
  obsoleteDecision: string;
}> {
  const projectRoot = await mkdtemp(join(tmpdir(), "pm-knowledge-project-"));
  await initializeProject({ projectRoot, projectId: "knowledge-fixture" });
  const started = await startChange({
    projectRoot,
    changeId,
    now: new Date("2026-07-15T00:00:00.000Z"),
  });
  const changeRoot = started.changeDirectory;
  const currentFactPath = join(projectRoot, "knowledge-base", "facts", "fixture", "current.md");
  const newRulePath = join(projectRoot, "knowledge-base", "rules", "fixture", "atomic.md");
  const obsoleteDecisionPath = join(
    projectRoot,
    "knowledge-base",
    "decisions",
    "fixture",
    "obsolete.md",
  );
  const engineeringPath = join(projectRoot, "engineering", "fixture.ts");
  const originalFact = "# Current fact\n\nOriginal project truth.\n";
  const replacementFact = "# Current fact\n\nPromoted project truth.\n";
  const newRule = "# Atomic promotion\n\nAll knowledge targets change or none do.\n";
  const obsoleteDecision = "# Obsolete decision\n\nThis decision no longer applies.\n";
  await mkdir(join(projectRoot, "knowledge-base", "facts", "fixture"), { recursive: true });
  await mkdir(join(projectRoot, "knowledge-base", "decisions", "fixture"), { recursive: true });
  await mkdir(join(changeRoot, "knowledge-post-images"), { recursive: true });
  await writeFile(currentFactPath, originalFact);
  await writeFile(obsoleteDecisionPath, obsoleteDecision);
  await writeFile(engineeringPath, "export const fixture = true;\n");
  await writeFile(join(changeRoot, "requirements.md"), requirementsDocument());
  await writeFile(join(changeRoot, "design", "README.md"), designDocument());
  await writeFile(join(changeRoot, "knowledge-update.md"), knowledgeDocument());
  await writeFile(join(changeRoot, "knowledge-post-images", "KNOW-001.md"), replacementFact);
  await writeFile(join(changeRoot, "knowledge-post-images", "KNOW-002.md"), newRule);

  const baseline = "baseline-revision";
  const final = "final-revision";
  const engineeringDigest = await digestFile(engineeringPath);
  const checkpoint = digestText("engineering/fixture.ts\0" + engineeringDigest);
  await writeFile(
    join(changeRoot, "delivery", "README.md"),
    deliveryDocument({
      baseline,
      final,
      checkpoint,
      executedAt: "2026-07-15T00:00:02.000Z",
    }),
  );

  const state = await readChangeState(changeRoot);
  const materials = await resolveMaterialSets(changeRoot, state);
  state.phase = "knowledge";
  state.gates.requirements.status = "confirmed";
  state.gates.requirements.confirmations = [
    confirmation(
      "requirements",
      "user",
      materials.materials.requirements,
      "2026-07-15T00:00:03.000Z",
    ),
  ];
  state.gates.design.status = "confirmed";
  state.gates.design.confirmations = [
    confirmation(
      "design",
      "ai_project_manager",
      materials.materials.design,
      "2026-07-15T00:00:04.000Z",
    ),
  ];
  state.gates.acceptance.status = "confirmed";
  state.gates.acceptance.confirmations = [
    confirmation("acceptance", "user", materials.materials.delivery, "2026-07-15T00:00:05.000Z"),
  ];
  state.readiness = {
    status: "pass",
    assessed_artifacts: readinessArtifacts(materials.materials),
    concerns: [],
    assessed_at: "2026-07-15T00:00:01.000Z",
  };
  state.base.dependencies.engineering = [
    {
      path: "engineering/fixture.ts",
      digest: engineeringDigest,
      purpose: "Knowledge fixture implementation scope.",
    },
  ];
  state.implementation = {
    status: "verified",
    baseline_revision: baseline,
    final_revision: final,
    checkpoint: {
      scope_digest: checkpoint,
      captured_at: "2026-07-15T00:00:01.000Z",
    },
  };
  state.next_action = {
    owner: "ai_project_manager",
    action: "draft_knowledge_update",
    inputs: ["knowledge-update.md"],
  };
  await validateChangeState(state);
  await writeFile(join(changeRoot, "change.yaml"), stringify(state, { lineWidth: 0 }));

  return {
    projectRoot,
    changeRoot,
    currentFactPath,
    newRulePath,
    obsoleteDecisionPath,
    originalFact,
    replacementFact,
    newRule,
    obsoleteDecision,
  };
}

export async function readFixtureState(changeRoot: string): Promise<ChangeState> {
  return readChangeState(changeRoot);
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}
