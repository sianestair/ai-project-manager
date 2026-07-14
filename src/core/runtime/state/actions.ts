import type {
  AvailableAction,
  BlockedAction,
  ChangeState,
  Diagnostic,
  NextAction,
} from "./types.js";

interface CatalogEntry {
  owner: NextAction["owner"];
  description: string;
  inputs: string[];
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
  start_implementation: {
    owner: "ai_project_manager",
    description: "开始实施已确认设计",
    inputs: ["delivery/README.md"],
  },
  archive: {
    owner: "ai_project_manager",
    description: "应用终态检查并归档 Change",
    inputs: ["change.yaml"],
  },
};

function availableAction(id: string): AvailableAction {
  const entry = ACTION_CATALOG[id];
  if (entry === undefined) {
    throw new Error("Unknown action id: " + id);
  }

  return {
    id,
    owner: entry.owner,
    action: id,
    description: entry.description,
    inputs: [...entry.inputs],
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

export function deriveActions(
  state: ChangeState,
  diagnostics: readonly Diagnostic[],
): {
  available: AvailableAction[];
  blocked: BlockedAction[];
} {
  const hasErrors = diagnostics.some((item) => item.severity === "error");
  const available: AvailableAction[] = [];
  const blocked: BlockedAction[] = [];

  if (!hasErrors && state.status === "active") {
    if (state.phase === "requirements" && state.gates.requirements.status !== "confirmed") {
      available.push(availableAction("draft_requirements"), availableAction("revise_requirements"));
    }

    if (state.phase === "design" && state.gates.requirements.status === "confirmed") {
      available.push(availableAction("draft_design"), availableAction("revise_design"));
    }
  }

  if (!available.some((item) => item.id === "request_requirements_confirmation")) {
    blocked.push(
      blockedAction(
        "request_requirements_confirmation",
        "requirements_self_check_not_recorded",
        "ai_project_manager",
        "Complete the requirements self-check in requirements.md.",
      ),
    );
  }

  if (state.gates.requirements.status !== "confirmed") {
    blocked.push(
      blockedAction(
        "confirm_requirements",
        "requirements_confirmation_not_ready",
        "user",
        "The AI project manager must first submit a self-checked requirements baseline.",
      ),
      blockedAction(
        "draft_design",
        "requirements_gate_not_confirmed",
        "user",
        "Confirm the current requirements material set.",
      ),
    );
  }

  if (state.gates.design.status !== "confirmed") {
    blocked.push(
      blockedAction(
        "start_implementation",
        "design_gate_not_confirmed",
        "user",
        "Complete readiness and confirm the current design material set.",
      ),
    );
  }

  blocked.push(
    blockedAction(
      "archive",
      "terminal_gates_not_satisfied",
      "ai_project_manager",
      "Complete implementation, acceptance, knowledge promotion, and archive checks.",
    ),
  );

  return {
    available,
    blocked,
  };
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
