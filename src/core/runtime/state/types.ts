export type Phase =
  | "requirements"
  | "design"
  | "implementation"
  | "acceptance"
  | "knowledge"
  | "archive_ready"
  | "archived";

export type ChangeStatus = "active" | "blocked" | "completed";
export type GateStatus = "pending" | "confirmed" | "invalidated";
export type MaterialSetName = "requirements" | "design" | "delivery" | "knowledge";
export type ReadinessStatus = "not_assessed" | "pass" | "concerns" | "fail" | "stale";
export type GateName = "requirements" | "design" | "acceptance" | "knowledge";
export type ConfirmationActor = "user" | "ai_project_manager";

export interface ProjectConfig {
  schema_version: 1;
  project_id: string;
}

export interface ArtifactDigest {
  path: string;
  digest: string;
}

export interface DependencyRecord extends ArtifactDigest {
  purpose: string;
}

export interface MaterialGroup {
  required: string[];
  included: string[];
}

export interface Confirmation {
  revision: number;
  artifacts: ArtifactDigest[];
  confirmed_by: ConfirmationActor;
  confirmed_at: string;
  summary: string;
  evidence: string;
}

export interface Gate {
  status: GateStatus;
  material_set: MaterialSetName;
  confirmations: Confirmation[];
}

export interface ReadinessConcern {
  id: string;
  impact: string;
  owner: string;
  resolution: string | null;
  touches_user_confirmation: boolean;
}

export interface ReadinessRecord {
  status: ReadinessStatus;
  assessed_artifacts: ArtifactDigest[];
  concerns: ReadinessConcern[];
  assessed_at: string | null;
}

export interface Blocker {
  reason: string;
  blocked_by: string;
  resume_when: string;
  affected_stage: Exclude<Phase, "archive_ready" | "archived">;
  created_at: string;
  status: "open" | "resolved";
}

export interface NextAction {
  owner: "ai_project_manager" | "user" | "external";
  action: string;
  inputs: string[];
}

export interface HistoryEvent {
  at: string;
  event: string;
  summary: string;
}

export interface ChangeState {
  schema_version: 1;
  change_id: string;
  title: string;
  phase: Phase;
  status: ChangeStatus;
  base: {
    project_revision: string | null;
    captured_at: string;
    dependencies: {
      knowledge: DependencyRecord[];
      engineering: DependencyRecord[];
    };
  };
  materials: Record<MaterialSetName, MaterialGroup>;
  gates: {
    requirements: Gate;
    design: Gate;
    acceptance: Gate;
    knowledge: Gate;
  };
  readiness: ReadinessRecord;
  implementation: {
    status: "not_started" | "in_progress" | "verified";
    baseline_revision: string | null;
    final_revision: string | null;
    checkpoint: {
      scope_digest: string | null;
      captured_at: string | null;
    };
  };
  knowledge_promotion: {
    status: "not_started" | "ready" | "applied" | "verified";
    candidate_digest: string | null;
    patch_digest: string | null;
    targets: Array<{
      path: string;
      before_digest: string;
      after_digest: string;
    }>;
    applied_files: ArtifactDigest[];
  };
  blockers: Blocker[];
  review: {
    iteration: number;
    max_iterations: number;
    last_outcome: string | null;
  };
  next_action: NextAction;
  history: HistoryEvent[];
}

export type DiagnosticSeverity = "error" | "warning" | "information";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ResolvedMaterialSet {
  name: MaterialSetName;
  artifacts: ArtifactDigest[];
  digest: string | null;
}

export interface ResolvedGate {
  status: GateStatus;
  persisted_status: GateStatus;
  material_set: MaterialSetName;
  confirmations: Confirmation[];
  current_confirmation: Confirmation | null;
  valid: boolean;
  next_revision: number;
  invalid_reason: string | null;
}

export interface ResolvedReadiness extends ReadinessRecord {
  persisted_status: ReadinessStatus;
  fresh: boolean;
  ready: boolean;
  invalid_reason: string | null;
}

export interface SelfCheckFact {
  path: string;
  section: string;
  complete: boolean;
  reason: string | null;
}

export interface DesignPermissionFact extends SelfCheckFact {
  authority: ConfirmationActor | null;
}

export interface AvailableAction extends NextAction {
  id: string;
  description: string;
}

export interface BlockedAction {
  id: string;
  description: string;
  reason: string;
  blocked_by: string;
  resume_when: string;
}

export interface ResolvedChangeState {
  project: {
    root: string;
    project_id: string;
    schema_version: number;
  };
  change: {
    change_id: string;
    title: string;
    phase: Phase;
    status: ChangeStatus;
    project_revision: string | null;
  };
  materials: Record<MaterialSetName, ResolvedMaterialSet>;
  gates: Record<GateName, ResolvedGate>;
  readiness: ResolvedReadiness;
  self_checks: Record<GateName, SelfCheckFact>;
  design_permission: DesignPermissionFact;
  blockers: Blocker[];
  review: ChangeState["review"];
  available_actions: AvailableAction[];
  blocked_actions: BlockedAction[];
  next_action: NextAction & {
    valid: boolean;
  };
  recovery: {
    current_goal: string;
    inputs: string[];
  };
  diagnostics: Diagnostic[];
}
