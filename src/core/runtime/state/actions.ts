import type {
  AvailableAction,
  BlockedAction,
  ChangeState,
  DesignPermissionFact,
  Diagnostic,
  GateName,
  MaterialSetName,
  NextAction,
  ResolvedGate,
  ResolvedMaterialSet,
  ResolvedReadiness,
  SelfCheckFact,
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
};

const RECOVERABLE_GATE_DIAGNOSTICS = new Set(["readiness_concern_unresolved"]);

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

  const hasFatalErrors = diagnostics.some(
    (item) => item.severity === "error" && !RECOVERABLE_GATE_DIAGNOSTICS.has(item.code),
  );
  if (hasFatalErrors || state.status !== "active") {
    for (const id of [
      "confirm_requirements",
      "confirm_design",
      "start_implementation",
      "archive",
    ]) {
      addBlocked(
        blockedAction(
          id,
          "state_validation_failed",
          "ai_project_manager",
          "Resolve the current state diagnostics before executing workflow actions.",
        ),
      );
    }
    return { available, blocked };
  }

  const requirementsConfirmed = context.gates.requirements.valid;
  const designConfirmed = context.gates.design.valid;
  const acceptanceConfirmed = context.gates.acceptance.valid;
  const knowledgeConfirmed = context.gates.knowledge.valid;

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
    } else if (
      context.selfChecks.requirements.complete &&
      context.materials.requirements.digest !== null
    ) {
      const inputs = confirmationInputs(context, "requirements");
      addAvailable(availableAction("request_requirements_confirmation", { inputs }));
      addAvailable(availableAction("confirm_requirements", { inputs }));
    } else {
      const reason = context.selfChecks.requirements.complete
        ? "requirements_material_set_incomplete"
        : "requirements_self_check_not_recorded";
      const resumeWhen = context.selfChecks.requirements.complete
        ? "Resolve every required and included requirements material."
        : "Complete the requirements self-check in requirements.md.";
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
  } else if (state.phase === "implementation" && state.implementation.status === "not_started") {
    if (context.readiness.ready) {
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
    } else if (!context.selfChecks.acceptance.complete) {
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

  if (state.phase === "knowledge" && acceptanceConfirmed) {
    addAvailable(availableAction("draft_knowledge_update"));

    if (!knowledgeConfirmed) {
      if (
        context.selfChecks.knowledge.complete &&
        state.knowledge_promotion.status === "ready" &&
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
    } else {
      addAvailable(availableAction("apply_knowledge"));
    }
  }

  addBlocked(
    blockedAction(
      "archive",
      "terminal_gates_not_satisfied",
      "ai_project_manager",
      "Complete implementation, acceptance, knowledge promotion, and archive checks.",
    ),
  );

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
