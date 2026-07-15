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
export type InvalidationStage =
  | "requirements"
  | "design"
  | "implementation"
  | "acceptance"
  | "knowledge";
export type BlockerOwner = "user" | "ai_project_manager" | "external" | "external_system";
export type ReviewOutcome = "passed" | "changes_requested";
export type ArtifactRecordKind =
  | "requirement"
  | "acceptance"
  | "design"
  | "task"
  | "evidence"
  | "knowledge";
export type TaskStatus = "pending" | "in_progress" | "completed" | "blocked";
export type VerificationDimension =
  | "completeness"
  | "correctness"
  | "coherence"
  | "engineering_quality";
export type KnowledgeOperation = "create" | "replace" | "delete";
export type ChangeLocation = "active" | "archived";

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
  blocked_by: BlockerOwner;
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
  archive?: {
    archived_at: string;
    final_revision: string;
    applied_files: ArtifactDigest[];
    confirmation_revisions: Record<GateName, number>;
  };
  blockers: Blocker[];
  review: {
    iteration: number;
    max_iterations: number;
    last_outcome: ReviewOutcome | null;
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

export interface ResolvedReview {
  iteration: number;
  max_iterations: number;
  last_outcome: ReviewOutcome | null;
  at_limit: boolean;
  non_converging: boolean;
  can_continue: boolean;
}

export interface DependencyDriftFact {
  kind: "knowledge" | "engineering";
  path: string;
  purpose: string;
  expected_digest: string;
  current_digest: string | null;
  status: "current" | "changed" | "missing" | "invalid";
}

export interface WorkspaceChangeFact {
  path: string;
  status: string;
  registered: boolean;
}

export interface RecoveryFacts {
  current_goal: string;
  inputs: string[];
  confirmed_gates: GateName[];
  requires_reassessment: boolean;
  dependency_drift: DependencyDriftFact[];
  checkpoint: {
    recorded_scope_digest: string | null;
    current_scope_digest: string | null;
    recorded_at: string | null;
    status: "not_recorded" | "fresh" | "stale" | "unavailable";
  };
  workspace: {
    git_available: boolean;
    base_revision: string | null;
    current_revision: string | null;
    changes: WorkspaceChangeFact[];
  };
  resume_conditions: string[];
}

export interface MarkdownRecordFact {
  id: string;
  kind: ArtifactRecordKind;
  title: string;
  path: string;
  line: number;
  fields: Record<string, string>;
  references: string[];
}

export interface ArtifactIndex {
  records: MarkdownRecordFact[];
  design_coverage: ContractDeclaration[];
  verification_dimensions: ContractDeclaration[];
}

export interface ContractDeclaration {
  name: string;
  value: string;
  path: string;
  line: number;
}

export interface TraceabilityFacts {
  requirements_ready: boolean;
  design_ready: boolean;
  design_scope_ready: boolean;
  knowledge_ready: boolean;
  uncovered_requirements_by_design: string[];
  dangling_references: string[];
  duplicate_ids: string[];
}

export interface TaskContractFact {
  id: string;
  path: string;
  line: number;
  title: string;
  status: TaskStatus | null;
  traceability: string[];
  dependencies: string[];
  evidence: string[];
  valid: boolean;
}

export interface TaskContractFacts {
  records: TaskContractFact[];
  ready: boolean;
  all_completed: boolean;
  uncovered_requirements: string[];
  uncovered_design: string[];
  uncovered_acceptance: string[];
}

export interface VerificationDimensionFact {
  dimension: VerificationDimension;
  status: "covered" | "not_applicable" | "missing" | "invalid";
  evidence_ids: string[];
  reason: string | null;
  path: string | null;
  line: number | null;
}

export interface EvidenceFact {
  id: string;
  path: string;
  line: number;
  dimension: VerificationDimension | null;
  traceability: string[];
  executed_at: string | null;
  fresh: boolean;
  valid: boolean;
}

export interface VerificationFacts {
  dimensions: VerificationDimensionFact[];
  evidence: EvidenceFact[];
  structurally_complete: boolean;
  evidence_fresh: boolean;
  traceability_complete: boolean;
  ready_for_acceptance: boolean;
}

export interface KnowledgePatchTarget {
  knowledge_id: string;
  path: string;
  operation: KnowledgeOperation;
  before_digest: string;
  after_digest: string;
  before_image: string | null;
  after_image: string | null;
}

export interface KnowledgePatchEnvelope {
  schema_version: 1;
  change_id: string;
  candidate_digest: string;
  targets: KnowledgePatchTarget[];
}

export interface KnowledgePromotionFacts {
  status: ChangeState["knowledge_promotion"]["status"];
  candidate_current: boolean;
  patch_current: boolean;
  targets_current: boolean;
  no_change: boolean;
  ready_for_confirmation: boolean;
  ready_to_apply: boolean;
  verified: boolean;
  conflicts: string[];
}

export interface TransactionFacts {
  status: "none" | "pending" | "invalid";
  operation: "knowledge_apply" | null;
  path: string | null;
  completed_targets: number;
  total_targets: number;
  recovery_actions: Array<"commit" | "rollback">;
}

export interface ArchiveReadinessFacts {
  ready: boolean;
  unmet_conditions: string[];
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
    location: ChangeLocation;
  };
  materials: Record<MaterialSetName, ResolvedMaterialSet>;
  gates: Record<GateName, ResolvedGate>;
  readiness: ResolvedReadiness;
  self_checks: Record<GateName, SelfCheckFact>;
  design_permission: DesignPermissionFact;
  blockers: Blocker[];
  open_blockers: Blocker[];
  review: ResolvedReview;
  implementation: ChangeState["implementation"];
  artifact_index: ArtifactIndex;
  traceability: TraceabilityFacts;
  tasks: TaskContractFacts;
  verification: VerificationFacts;
  knowledge_promotion: KnowledgePromotionFacts;
  transaction: TransactionFacts;
  archive_readiness: ArchiveReadinessFacts;
  available_actions: AvailableAction[];
  blocked_actions: BlockedAction[];
  next_action: NextAction & {
    valid: boolean;
  };
  recovery: RecoveryFacts;
  diagnostics: Diagnostic[];
}
