import type { ChangeState } from "../state/types.js";

export function agentsTemplate(): string {
  return [
    "# AI Project Manager",
    "",
    "This project uses the portable AI project manager workflow.",
    "",
    "- Read confirmed current knowledge from `knowledge-base/`.",
    "- Read current implementation and executable validation from `engineering/`.",
    "- Read unfinished Change state from `changes/active/<change-id>/`.",
    "- Treat `changes/archived/` as historical evidence only.",
    "- Do not treat chat history, Agent memory, hooks, or task UI as authoritative state.",
    "- Use the `ai-project-manager` Skill when installed and call the `pm` CLI for deterministic checks.",
    "",
  ].join("\n");
}

export function knowledgeReadmeTemplate(): string {
  return [
    "# Project knowledge",
    "",
    "Only user-confirmed knowledge belongs here.",
    "",
    "- `facts/`: current facts and long-lived system boundaries.",
    "- `rules/`: continuing business, engineering, governance, security, and permission constraints.",
    "- `decisions/`: long-lived decisions, alternatives, trade-offs, and consequences.",
    "",
    "Active or archived Change material is not a substitute for this current-state knowledge.",
    "",
  ].join("\n");
}

export function requirementsTemplate(title: string): string {
  return [
    "# " + title + "：需求",
    "",
    "状态：待整理",
    "",
    "## 原始意图",
    "",
    "待记录。原始意图不自动等于已确认需求。",
    "",
    "## 为什么要做",
    "",
    "待整理。",
    "",
    "## 目标与预期结果",
    "",
    "待整理。",
    "",
    "## 范围",
    "",
    "待整理。",
    "",
    "## 非范围",
    "",
    "待整理。",
    "",
    "## 约束",
    "",
    "待整理。",
    "",
    "## 验收标准",
    "",
    "待整理。",
    "",
    "## 需求门前自检",
    "",
    "待执行。",
    "",
  ].join("\n");
}

export function designReadmeTemplate(title: string): string {
  return [
    "# " + title + "：设计",
    "",
    "状态：待形成",
    "",
    "## 设计结论与关键取舍",
    "",
    "待形成。",
    "",
    "## 设计范围覆盖",
    "",
    "待说明涉及与不涉及的设计类型及理由。",
    "",
    "## 权限分类",
    "",
    "- 确认责任：待分类",
    "- 理由：待记录。",
    "",
    "## 材料清单",
    "",
    "- `design/README.md`",
    "",
    "## 设计门前自检",
    "",
    "待执行。",
    "",
  ].join("\n");
}

export function deliveryReadmeTemplate(title: string): string {
  return [
    "# " + title + "：交付",
    "",
    "状态：未开始",
    "",
    "## 当前实施状态",
    "",
    "未开始。",
    "",
    "## 任务与依赖",
    "",
    "待形成。",
    "",
    "## 验证与证据",
    "",
    "待形成。",
    "",
    "## 未解决问题",
    "",
    "暂无已记录问题。",
    "",
    "## 材料清单",
    "",
    "- `delivery/README.md`",
    "",
    "## 验收门前自检",
    "",
    "待执行。",
    "",
  ].join("\n");
}

export function knowledgeUpdateTemplate(title: string): string {
  return [
    "# " + title + "：候选知识",
    "",
    "状态：待整理",
    "",
    "## 候选知识",
    "",
    "待在验收后整理。尚未整理不等于无知识变更。",
    "",
    "## 用户处理结果",
    "",
    "待确认。",
    "",
    "## 知识门前自检",
    "",
    "待执行。",
    "",
  ].join("\n");
}

export function createInitialChangeState(input: {
  changeId: string;
  title: string;
  capturedAt: string;
  projectRevision: string | null;
}): ChangeState {
  return {
    schema_version: 1,
    change_id: input.changeId,
    title: input.title,
    phase: "requirements",
    status: "active",
    base: {
      project_revision: input.projectRevision,
      captured_at: input.capturedAt,
      dependencies: {
        knowledge: [],
        engineering: [],
      },
    },
    materials: {
      requirements: {
        required: ["requirements.md"],
        included: [],
      },
      design: {
        required: ["design/README.md"],
        included: [],
      },
      delivery: {
        required: ["delivery/README.md"],
        included: [],
      },
      knowledge: {
        required: ["knowledge-update.md"],
        included: [],
      },
    },
    gates: {
      requirements: {
        status: "pending",
        material_set: "requirements",
        confirmations: [],
      },
      design: {
        status: "pending",
        material_set: "design",
        confirmations: [],
      },
      acceptance: {
        status: "pending",
        material_set: "delivery",
        confirmations: [],
      },
      knowledge: {
        status: "pending",
        material_set: "knowledge",
        confirmations: [],
      },
    },
    readiness: {
      status: "not_assessed",
      assessed_artifacts: [],
      concerns: [],
      assessed_at: null,
    },
    implementation: {
      status: "not_started",
      baseline_revision: null,
      final_revision: null,
      checkpoint: {
        scope_digest: null,
        captured_at: null,
      },
    },
    knowledge_promotion: {
      status: "not_started",
      candidate_digest: null,
      patch_digest: null,
      targets: [],
      applied_files: [],
    },
    blockers: [],
    review: {
      iteration: 0,
      max_iterations: 3,
      last_outcome: null,
    },
    next_action: {
      owner: "ai_project_manager",
      action: "draft_requirements",
      inputs: ["requirements.md"],
    },
    history: [
      {
        at: input.capturedAt,
        event: "change_started",
        summary: "从项目当前状态创建 Change。",
      },
    ],
  };
}
