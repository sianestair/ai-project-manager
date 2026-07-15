import type {
  AvailableAction,
  ArchiveReadinessFacts,
  Blocker,
  BlockedAction,
  ChangeState,
  DesignPermissionFact,
  Diagnostic,
  GateName,
  MaterialSetName,
  KnowledgePromotionFacts,
  NextAction,
  ResolvedGate,
  ResolvedMaterialSet,
  ResolvedReadiness,
  ResolvedReview,
  RecoveryFacts,
  SelfCheckFact,
  TaskContractFacts,
  TraceabilityFacts,
  TransactionFacts,
  VerificationFacts,
} from "./types.js";

interface CatalogEntry {
  owner: NextAction["owner"];
  description: string;
  inputs: string[];
}

export interface ActionContext {
  materials: Record<MaterialSetName, ResolvedMaterialSet>;
  gates: Record<GateName, ResolvedGate>;
  readiness: ResolvedReadiness;
  selfChecks: Record<GateName, SelfCheckFact>;
  designPermission: DesignPermissionFact;
  openBlockers: Blocker[];
  review: ResolvedReview;
  recovery: RecoveryFacts;
  traceability: TraceabilityFacts;
  tasks: TaskContractFacts;
  verification: VerificationFacts;
  knowledgePromotion: KnowledgePromotionFacts;
  transaction: TransactionFacts;
  archiveReadiness: ArchiveReadinessFacts;
}

const ACTION_CATALOG: Record<string, CatalogEntry> = {
  draft_requirements: {
    owner: "ai_project_manager",
    description: "整理原始意图并形成可确认需求",
    inputs: ["requirements.md"],
  },
  revise_requirements: {
    owner: "ai_project_manager",
    description: "修订当前需求材料",
    inputs: ["requirements.md"],
  },
  request_requirements_confirmation: {
    owner: "ai_project_manager",
    description: "完成门前自检并请求需求确认",
    inputs: ["requirements.md"],
  },
  confirm_requirements: {
    owner: "user",
    description: "确认当前需求材料集合",
    inputs: ["requirements.md"],
  },
  draft_design: {
    owner: "ai_project_manager",
    description: "形成设计材料",
    inputs: ["design/README.md"],
  },
  revise_design: {
    owner: "ai_project_manager",
    description: "修订设计材料",
    inputs: ["design/README.md"],
  },
  assess_readiness: {
    owner: "ai_project_manager",
    description: "评估当前需求、设计和实施任务是否就绪",
    inputs: ["requirements.md", "design/README.md", "delivery/README.md"],
  },
  request_design_confirmation: {
    owner: "ai_project_manager",
    description: "提交已完成 readiness 的设计材料集合",
    inputs: ["design/README.md"],
  },
  confirm_design: {
    owner: "user",
    description: "按权限分类确认当前设计材料集合",
    inputs: ["design/README.md"],
  },
  start_implementation: {
    owner: "ai_project_manager",
    description: "开始实施已确认设计",
    inputs: ["delivery/README.md"],
  },
  continue_implementation: {
    owner: "ai_project_manager",
    description: "从当前任务、证据和检查点继续实施",
    inputs: ["delivery/README.md"],
  },
  review_task: {
    owner: "ai_project_manager",
    description: "评审当前实施任务及其证据",
    inputs: ["delivery/README.md"],
  },
  review_change: {
    owner: "ai_project_manager",
    description: "执行当前 Change 的整体收敛评审",
    inputs: ["delivery/README.md"],
  },
  prepare_acceptance: {
    owner: "ai_project_manager",
    description: "整理交付结果和用户验收材料",
    inputs: ["delivery/README.md"],
  },
  request_acceptance_confirmation: {
    owner: "ai_project_manager",
    description: "提交交付结果与验收证据",
    inputs: ["delivery/README.md"],
  },
  confirm_acceptance: {
    owner: "user",
    description: "确认当前交付材料集合",
    inputs: ["delivery/README.md"],
  },
  draft_knowledge_update: {
    owner: "ai_project_manager",
    description: "整理候选项目知识",
    inputs: ["knowledge-update.md"],
  },
  preview_knowledge: {
    owner: "ai_project_manager",
    description: "将已处理候选编译为精确知识补丁和预览",
    inputs: ["knowledge-update.md"],
  },
  request_knowledge_confirmation: {
    owner: "ai_project_manager",
    description: "提交候选知识和补丁预览",
    inputs: ["knowledge-update.md"],
  },
  confirm_knowledge: {
    owner: "user",
    description: "确认当前候选知识材料集合",
    inputs: ["knowledge-update.md"],
  },
  apply_knowledge: {
    owner: "ai_project_manager",
    description: "原子应用已确认知识补丁",
    inputs: ["knowledge-update.md"],
  },
  archive: {
    owner: "ai_project_manager",
    description: "应用终态检查并归档 Change",
    inputs: ["change.yaml"],
  },
  check_archive: {
    owner: "ai_project_manager",
    description: "检查全部终态门和归档前置条件",
    inputs: ["change.yaml"],
  },
  inspect_archive: {
    owner: "ai_project_manager",
    description: "读取已归档 Change 的终态证据",
    inputs: ["change.yaml"],
  },
  record_blocker: {
    owner: "ai_project_manager",
    description: "记录结构化 blocker 和恢复条件",
    inputs: ["change.yaml"],
  },
  resolve_blocker: {
    owner: "ai_project_manager",
    description: "核对恢复条件并解决当前 blocker",
    inputs: ["change.yaml"],
  },
  invalidate_requirements: {
    owner: "ai_project_manager",
    description: "从需求阶段失效当前及下游状态",
    inputs: ["change.yaml"],
  },
  invalidate_design: {
    owner: "ai_project_manager",
    description: "保留需求确认并从设计阶段回退",
    inputs: ["change.yaml"],
  },
  invalidate_implementation: {
    owner: "ai_project_manager",
    description: "保留上游确认并重新进入实施",
    inputs: ["change.yaml"],
  },
  invalidate_acceptance: {
    owner: "ai_project_manager",
    description: "保留已验证实现并重新准备验收",
    inputs: ["change.yaml"],
  },
  invalidate_knowledge: {
    owner: "ai_project_manager",
    description: "保留验收并重新整理候选知识",
    inputs: ["change.yaml"],
  },
  reassess_dependency_drift: {
    owner: "ai_project_manager",
    description: "重新评估已登记依赖或实施检查点漂移",
    inputs: ["change.yaml"],
  },
  recover_transaction: {
    owner: "ai_project_manager",
    description: "完成或回滚中断的知识事务",
    inputs: [".pm-transaction/transaction.json"],
  },
};

const RECOVERABLE_GATE_DIAGNOSTICS = new Set([
  "readiness_concern_unresolved",
  "blocker_status_conflict",
  "non_converging_blocker_required",
  "requirements_record_missing",
  "acceptance_record_missing",
  "acceptance_requirement_reference_missing",
  "design_record_missing",
  "design_requirement_reference_missing",
  "requirement_uncovered_by_design",
  "design_coverage_missing",
  "design_coverage_duplicate",
  "design_coverage_invalid",
  "task_record_missing",
  "artifact_uncovered_by_task",
  "verification_dimension_missing",
  "verification_dimension_duplicate",
  "verification_dimension_invalid",
  "artifact_uncovered_by_evidence",
  "evidence_record_missing",
  "tasks_not_completed",
  "implementation_not_verified",
  "implementation_final_revision_not_current",
]);

const PHASE_ORDER: Record<ChangeState["phase"], number> = {
  requirements: 0,
  design: 1,
  implementation: 2,
  acceptance: 3,
  knowledge: 4,
  archive_ready: 5,
  archived: 6,
};

function invalidationIsApplicable(
  state: ChangeState,
  context: ActionContext,
  stage: "requirements" | "design" | "implementation" | "acceptance" | "knowledge",
): boolean {
  const stageOrder = PHASE_ORDER[stage];
  if (PHASE_ORDER[state.phase] > stageOrder) {
    return true;
  }

  if (
    stage === "requirements" ||
    stage === "design" ||
    stage === "acceptance" ||
    stage === "knowledge"
  ) {
    return context.gates[stage].confirmations.length > 0;
  }

  return state.implementation.status !== "not_started";
}

function availableAction(
  id: string,
  overrides: { owner?: NextAction["owner"]; inputs?: string[] } = {},
): AvailableAction {
  const entry = ACTION_CATALOG[id];
  if (entry === undefined) {
    throw new Error("Unknown action id: " + id);
  }

  return {
    id,
    owner: overrides.owner ?? entry.owner,
    action: id,
    description: entry.description,
    inputs: overrides.inputs ?? [...entry.inputs],
  };
}

function blockedAction(
  id: string,
  reason: string,
  blockedBy: string,
  resumeWhen: string,
): BlockedAction {
  const entry = ACTION_CATALOG[id];
  if (entry === undefined) {
    throw new Error("Unknown action id: " + id);
  }

  return {
    id,
    description: entry.description,
    reason,
    blocked_by: blockedBy,
    resume_when: resumeWhen,
  };
}

function confirmationInputs(context: ActionContext, gate: GateName): string[] {
  const materialSet = context.gates[gate].material_set;
  return context.materials[materialSet].artifacts.map((artifact) => artifact.path);
}

export function deriveActions(
  state: ChangeState,
  context: ActionContext,
  diagnostics: readonly Diagnostic[],
): {
  available: AvailableAction[];
  blocked: BlockedAction[];
} {
  const available: AvailableAction[] = [];
  const blocked: BlockedAction[] = [];
  const addAvailable = (action: AvailableAction) => {
    if (!available.some((candidate) => candidate.id === action.id)) {
      available.push(action);
    }
  };
  const addBlocked = (action: BlockedAction) => {
    if (!blocked.some((candidate) => candidate.id === action.id)) {
      blocked.push(action);
    }
  };
  const addApplicableInvalidations = () => {
    for (const stage of [
      "requirements",
      "design",
      "implementation",
      "acceptance",
      "knowledge",
    ] as const) {
      if (invalidationIsApplicable(state, context, stage)) {
        addAvailable(availableAction("invalidate_" + stage));
      }
    }
  };
  const blockWorkflowProgress = (reason: string, blockedBy: string, resumeWhen: string) => {
    for (const id of [
      "confirm_requirements",
      "confirm_design",
      "start_implementation",
      "continue_implementation",
      "review_task",
      "review_change",
      "confirm_acceptance",
      "confirm_knowledge",
      "archive",
    ]) {
      addBlocked(blockedAction(id, reason, blockedBy, resumeWhen));
    }
  };

  const hasFatalErrors = diagnostics.some(
    (item) => item.severity === "error" && !RECOVERABLE_GATE_DIAGNOSTICS.has(item.code),
  );
  if (state.status === "completed" && state.phase === "archived" && !hasFatalErrors) {
    addAvailable(availableAction("inspect_archive"));
    return { available, blocked };
  }
  if (hasFatalErrors || state.status === "completed") {
    blockWorkflowProgress(
      "state_validation_failed",
      "ai_project_manager",
      "Resolve the current state diagnostics before executing workflow actions.",
    );
    return { available, blocked };
  }

  const requirementsConfirmed = context.gates.requirements.valid;
  const designConfirmed = context.gates.design.valid;
  const acceptanceConfirmed = context.gates.acceptance.valid;
  const knowledgeConfirmed = context.gates.knowledge.valid;

  if (context.transaction.status === "pending") {
    addAvailable(availableAction("recover_transaction"));
    blockWorkflowProgress(
      "transaction_recovery_required",
      "ai_project_manager",
      "Commit or roll back the pending knowledge transaction before any workflow write.",
    );
    return { available, blocked };
  }

  if (context.openBlockers.length > 0) {
    const firstBlocker = context.openBlockers[0];
    if (firstBlocker !== undefined) {
      const owner =
        firstBlocker.blocked_by === "user"
          ? "user"
          : firstBlocker.blocked_by === "ai_project_manager"
            ? "ai_project_manager"
            : "external";
      addAvailable(availableAction("resolve_blocker", { owner }));
      blockWorkflowProgress(firstBlocker.reason, firstBlocker.blocked_by, firstBlocker.resume_when);
    }
    addApplicableInvalidations();
    return { available, blocked };
  }

  if (diagnostics.some((item) => item.code === "non_converging_blocker_required")) {
    addAvailable(availableAction("record_blocker"));
    addApplicableInvalidations();
    blockWorkflowProgress(
      "non_converging",
      "user",
      "Record a non_converging blocker and request a responsible decision.",
    );
    return { available, blocked };
  }

  if (state.status === "blocked") {
    addAvailable(availableAction("record_blocker"));
    blockWorkflowProgress(
      "blocker_status_conflict",
      "ai_project_manager",
      "Record the missing blocker or restore active status.",
    );
    return { available, blocked };
  }

  if (context.recovery.requires_reassessment) {
    addAvailable(availableAction("reassess_dependency_drift"));
    addApplicableInvalidations();
    blockWorkflowProgress(
      "dependency_drift_pending_reassessment",
      "ai_project_manager",
      "Reassess registered dependency and checkpoint drift before continuing.",
    );
    return { available, blocked };
  }

  if (!requirementsConfirmed) {
    addAvailable(availableAction("draft_requirements"));
    addAvailable(availableAction("revise_requirements"));

    const downstreamConfirmed = designConfirmed || acceptanceConfirmed || knowledgeConfirmed;
    if (downstreamConfirmed) {
      addBlocked(
        blockedAction(
          "request_requirements_confirmation",
          "downstream_confirmation_must_be_invalidated",
          "ai_project_manager",
          "Invalidate the affected design and downstream state before reconfirming requirements.",
        ),
      );
      addBlocked(
        blockedAction(
          "confirm_requirements",
          "downstream_confirmation_must_be_invalidated",
          "ai_project_manager",
          "Invalidate the affected design and downstream state before reconfirming requirements.",
        ),
      );
    } else if (!context.selfChecks.requirements.complete) {
      addBlocked(
        blockedAction(
          "request_requirements_confirmation",
          "requirements_self_check_not_recorded",
          "ai_project_manager",
          "Complete the requirements self-check in requirements.md.",
        ),
      );
      addBlocked(
        blockedAction(
          "confirm_requirements",
          "requirements_self_check_not_recorded",
          "ai_project_manager",
          "Complete the requirements self-check in requirements.md.",
        ),
      );
    } else if (!context.traceability.requirements_ready) {
      addBlocked(
        blockedAction(
          "request_requirements_confirmation",
          "requirements_traceability_incomplete",
          "ai_project_manager",
          "Add unique REQ-* and AC-* records with valid requirement traceability.",
        ),
      );
      addBlocked(
        blockedAction(
          "confirm_requirements",
          "requirements_traceability_incomplete",
          "ai_project_manager",
          "Add unique REQ-* and AC-* records with valid requirement traceability.",
        ),
      );
    } else if (context.materials.requirements.digest !== null) {
      const inputs = confirmationInputs(context, "requirements");
      addAvailable(availableAction("request_requirements_confirmation", { inputs }));
      addAvailable(availableAction("confirm_requirements", { inputs }));
    } else {
      const reason = "requirements_material_set_incomplete";
      const resumeWhen = "Resolve every required and included requirements material.";
      addBlocked(
        blockedAction(
          "request_requirements_confirmation",
          reason,
          "ai_project_manager",
          resumeWhen,
        ),
      );
      addBlocked(blockedAction("confirm_requirements", reason, "ai_project_manager", resumeWhen));
    }

    addBlocked(
      blockedAction(
        "draft_design",
        "requirements_gate_not_confirmed",
        "user",
        "Confirm the current requirements material set.",
      ),
    );
    addBlocked(
      blockedAction(
        "start_implementation",
        "requirements_gate_not_confirmed",
        "user",
        "Confirm requirements before designing or implementing.",
      ),
    );
  } else if (!designConfirmed) {
    addAvailable(availableAction("draft_design"));
    addAvailable(availableAction("revise_design"));
    addAvailable(availableAction("assess_readiness"));

    let designBlock: BlockedAction | null = null;
    if (acceptanceConfirmed || knowledgeConfirmed) {
      designBlock = blockedAction(
        "confirm_design",
        "downstream_confirmation_must_be_invalidated",
        "ai_project_manager",
        "Invalidate acceptance and downstream state before reconfirming design.",
      );
    } else if (!context.selfChecks.design.complete) {
      designBlock = blockedAction(
        "confirm_design",
        "design_self_check_not_recorded",
        "ai_project_manager",
        "Complete the design self-check in design/README.md.",
      );
    } else if (!context.designPermission.complete) {
      designBlock = blockedAction(
        "confirm_design",
        "design_permission_classification_incomplete",
        "ai_project_manager",
        "Record the design permission classification and rationale.",
      );
    } else if (!context.traceability.design_ready) {
      designBlock = blockedAction(
        "confirm_design",
        "design_traceability_incomplete",
        "ai_project_manager",
        "Complete DES-* coverage and all seven design applicability declarations.",
      );
    } else if (!context.tasks.ready) {
      designBlock = blockedAction(
        "confirm_design",
        "task_contracts_incomplete",
        "ai_project_manager",
        "Complete valid TASK-* contracts covering requirements, design, and acceptance criteria.",
      );
    } else if (!context.readiness.ready) {
      designBlock = blockedAction(
        "confirm_design",
        "readiness_" + context.readiness.status,
        "ai_project_manager",
        "Record a fresh pass or fully resolved concerns readiness assessment.",
      );
    } else if (context.materials.design.digest === null) {
      designBlock = blockedAction(
        "confirm_design",
        "design_material_set_incomplete",
        "ai_project_manager",
        "Resolve every required and included design material.",
      );
    }

    if (designBlock === null) {
      const inputs = confirmationInputs(context, "design");
      const owner =
        context.designPermission.authority === "user" ||
        context.readiness.concerns.some((concern) => concern.touches_user_confirmation)
          ? "user"
          : "ai_project_manager";
      addAvailable(availableAction("request_design_confirmation", { inputs }));
      addAvailable(availableAction("confirm_design", { owner, inputs }));
    } else {
      addBlocked(designBlock);
      addBlocked(
        blockedAction(
          "request_design_confirmation",
          designBlock.reason,
          designBlock.blocked_by,
          designBlock.resume_when,
        ),
      );
    }

    addBlocked(
      blockedAction(
        "start_implementation",
        "design_gate_not_confirmed",
        "user",
        "Complete readiness and confirm the current design material set.",
      ),
    );
  } else if (state.phase === "implementation") {
    if (state.implementation.status === "not_started") {
      if (!context.traceability.design_ready || !context.tasks.ready) {
        addBlocked(
          blockedAction(
            "start_implementation",
            "task_contracts_incomplete",
            "ai_project_manager",
            "Restore complete design traceability and task contracts before implementation.",
          ),
        );
      } else if (context.readiness.ready) {
        addAvailable(availableAction("start_implementation"));
      } else {
        addBlocked(
          blockedAction(
            "start_implementation",
            "readiness_" + context.readiness.status,
            "ai_project_manager",
            "Restore a fresh readiness result before beginning implementation.",
          ),
        );
      }
    } else if (state.implementation.status === "in_progress") {
      addAvailable(availableAction("continue_implementation"));
      addAvailable(availableAction("review_task"));
      addAvailable(availableAction("review_change"));
      addAvailable(availableAction("record_blocker"));
    } else if (context.verification.ready_for_acceptance) {
      addAvailable(availableAction("prepare_acceptance"));
    } else {
      addBlocked(
        blockedAction(
          "prepare_acceptance",
          "verification_not_ready",
          "ai_project_manager",
          "Complete all tasks and current four-dimensional evidence bound to implementation revisions.",
        ),
      );
    }
  }

  if (state.phase === "acceptance" && !acceptanceConfirmed) {
    if (state.implementation.status !== "verified") {
      addBlocked(
        blockedAction(
          "confirm_acceptance",
          "implementation_not_verified",
          "ai_project_manager",
          "Complete implementation verification and acceptance evidence.",
        ),
      );
    } else if (!context.verification.ready_for_acceptance) {
      addBlocked(
        blockedAction(
          "confirm_acceptance",
          "verification_not_ready",
          "ai_project_manager",
          "Complete all tasks and current four-dimensional evidence bound to implementation revisions.",
        ),
      );
    } else {
      addAvailable(availableAction("prepare_acceptance"));
      if (!context.selfChecks.acceptance.complete) {
        addBlocked(
          blockedAction(
            "confirm_acceptance",
            "acceptance_self_check_not_recorded",
            "ai_project_manager",
            "Complete the acceptance self-check in delivery/README.md.",
          ),
        );
      } else {
        const inputs = confirmationInputs(context, "acceptance");
        addAvailable(availableAction("request_acceptance_confirmation", { inputs }));
        addAvailable(availableAction("confirm_acceptance", { inputs }));
      }
    }
  }

  if (state.phase === "knowledge" && acceptanceConfirmed) {
    addAvailable(availableAction("draft_knowledge_update"));

    if (!knowledgeConfirmed) {
      addAvailable(availableAction("preview_knowledge"));
      if (
        context.selfChecks.knowledge.complete &&
        context.knowledgePromotion.ready_for_confirmation &&
        context.materials.knowledge.digest !== null
      ) {
        const inputs = confirmationInputs(context, "knowledge");
        addAvailable(availableAction("request_knowledge_confirmation", { inputs }));
        addAvailable(availableAction("confirm_knowledge", { inputs }));
      } else {
        addBlocked(
          blockedAction(
            "confirm_knowledge",
            "knowledge_confirmation_not_ready",
            "ai_project_manager",
            "Complete the knowledge self-check and prepare the candidate knowledge payload.",
          ),
        );
      }
    } else if (context.knowledgePromotion.ready_to_apply) {
      addAvailable(availableAction("apply_knowledge"));
    } else {
      addBlocked(
        blockedAction(
          "apply_knowledge",
          "knowledge_preview_stale",
          "ai_project_manager",
          "Invalidate the knowledge gate, regenerate the preview, and reconfirm the exact patch.",
        ),
      );
    }
  }

  if (state.phase === "archive_ready") {
    addAvailable(availableAction("check_archive"));
    if (context.archiveReadiness.ready) {
      addAvailable(availableAction("archive"));
    } else {
      addBlocked(
        blockedAction(
          "archive",
          context.archiveReadiness.unmet_conditions[0] ?? "archive_not_ready",
          "ai_project_manager",
          "Resolve every archive readiness condition reported by pm archive check.",
        ),
      );
    }
  }

  addApplicableInvalidations();

  if (
    !available.some((action) => action.id === "archive") &&
    !blocked.some((action) => action.id === "archive")
  ) {
    addBlocked(
      blockedAction(
        "archive",
        "terminal_gates_not_satisfied",
        "ai_project_manager",
        "Complete implementation, acceptance, knowledge promotion, and archive checks.",
      ),
    );
  }

  return { available, blocked };
}

export function nextActionIsAvailable(
  nextAction: NextAction,
  available: readonly AvailableAction[],
): boolean {
  return available.some(
    (candidate) =>
      candidate.id === nextAction.action &&
      candidate.owner === nextAction.owner &&
      JSON.stringify(candidate.inputs) === JSON.stringify(nextAction.inputs),
  );
}
