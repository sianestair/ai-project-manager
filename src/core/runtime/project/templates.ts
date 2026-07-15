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
    "## 需求记录",
    "",
    "使用 `### REQ-001: 标题` 记录稳定需求标识；正文可自由组织。",
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
    "使用 `### AC-001: 标题`，并通过 `- 追溯：REQ-001` 引用需求。",
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
    "每项使用 `涉及：理由` 或 `不适用：理由`，不得只写结论。",
    "",
    "- 架构与模块职责：待评估",
    "- 接口与协议：待评估",
    "- 数据：待评估",
    "- 交互：待评估",
    "- 安全：待评估",
    "- 运行：待评估",
    "- 决策记录：待评估",
    "",
    "## 设计记录",
    "",
    "使用 `### DES-001: 标题`，并通过 `- 追溯：REQ-001, AC-001` 建立基本覆盖。",
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
    "使用 `### TASK-001: 标题`。每项固定包含：目标、追溯、Consumes、Produces、预计修改范围、依赖任务、验证方法、预期结果、状态和证据。无依赖或暂无证据时明确写 `无`。",
    "",
    "## 验证与证据",
    "",
    "每项 `EVID-*` 固定记录：维度、追溯、命令或操作、工作目录或环境、执行时间、退出码或结果、关键输出、断言、基线 revision、最终 revision 和 checkpoint digest。",
    "",
    "- Completeness：待形成",
    "- Correctness：待形成",
    "- Coherence：待形成",
    "- Engineering quality：待形成",
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
    "使用 `### KNOW-001: 标题`，固定填写类型、目标、操作、内容来源、处理结果和依据。新增/替换的完整 post-image 放在 `knowledge-post-images/<id>.md`，删除时内容来源写 `无`；处理结果只能写 `纳入` 或 `排除`。",
    "",
    "如果确实没有需要提升的知识，在本节单独写一行 `无知识变更`。当前仍待整理；尚未整理不等于无知识变更。",
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
