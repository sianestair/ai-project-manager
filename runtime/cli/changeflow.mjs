#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const workflowSchema = "workflow-loop";
const validStages = new Set([
  "intent",
  "discovery",
  "segmenting",
  "planning",
  "implementation",
  "acceptance",
  "knowledge-update",
  "archive-ready",
  "archived",
]);

const planningArtifacts = [
  "proposal.md",
  "context.md",
  "spec.md",
  "design.md",
  "acceptance.md",
  "knowledge-delta.md",
  "tasks.md",
];

function usage(exitCode = 0) {
  const text = `
Usage:
  changeflow [--project <path>] status <change-id> [--json]
  changeflow [--project <path>] next <change-id> [--json]
  changeflow [--project <path>] validate <change-id> [--json]
  changeflow [--project <path>] promote-segment <change-id> <segment-id> [--json]
  changeflow [--project <path>] handoff <change-id> [--json]
  changeflow [--project <path>] archive-check <change-id> [--json]
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseArgs(args) {
  const options = { project: process.cwd(), json: false };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--project") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --project");
      }
      options.project = value;
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  return { options, positional };
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

function context(projectRoot) {
  return {
    projectRoot: path.resolve(projectRoot),
    activeDir: path.join(path.resolve(projectRoot), "changes", "active"),
  };
}

function changeDir(ctx, changeId) {
  return path.join(ctx.activeDir, changeId);
}

function assertChangeExists(ctx, changeId) {
  const dir = changeDir(ctx, changeId);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Active change not found: ${dir}`);
  }
  return dir;
}

function readTextIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === "null") {
    return null;
  }
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (trimmed === "[]") {
    return [];
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    return inner.length === 0 ? [] : inner.split(",").map((item) => item.trim().replace(/^["']|["']$/g, ""));
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function parseStateYaml(content) {
  return parseYaml(content) ?? {};
}

function formatScalar(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (Array.isArray(value)) {
    return `[${value.join(", ")}]`;
  }
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  return String(value);
}

function stringifyStateYaml(state) {
  const preferredOrder = [
    "schema",
    "version",
    "changeId",
    "stage",
    "ownerSkill",
    "confirmedSegments",
    "pendingSegments",
    "blockedBy",
    "lastHandoff",
    "updatedAt",
    "acceptancePassed",
    "knowledgeDeltaApplied",
    "archiveConfirmedByUser",
  ];
  const keys = [
    ...preferredOrder.filter((key) => Object.prototype.hasOwnProperty.call(state, key)),
    ...Object.keys(state).filter((key) => !preferredOrder.includes(key)).sort(),
  ];
  const orderedState = {};
  for (const key of keys) {
    orderedState[key] = state[key];
  }
  return stringifyYaml(orderedState);
}

function readState(dir) {
  const statePath = path.join(dir, "workflow-state.yaml");
  if (!fs.existsSync(statePath)) {
    return { path: statePath, exists: false, state: null };
  }
  const state = parseStateYaml(fs.readFileSync(statePath, "utf8")) ?? {};
  return { path: statePath, exists: true, state };
}

function writeState(statePath, state) {
  fs.writeFileSync(statePath, stringifyStateYaml(state), "utf8");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fileStatus(dir) {
  const files = [
    "workflow-state.yaml",
    "intent.md",
    "change-map.md",
    "working-state.md",
    "open-questions.md",
    "handoff.md",
    ...planningArtifacts,
  ];
  return Object.fromEntries(files.map((file) => [file, fs.existsSync(path.join(dir, file))]));
}

function artifactStatus(dir) {
  return Object.fromEntries(planningArtifacts.map((file) => [file, fs.existsSync(path.join(dir, file))]));
}

function readTasks(dir) {
  const content = readTextIfExists(path.join(dir, "tasks.md"));
  const tasks = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^[-*]\s*\[([ xX])\]\s*(.+?)\s*$/);
    if (match) {
      tasks.push({
        done: match[1].toLowerCase() === "x",
        text: match[2],
      });
    }
  }
  return tasks;
}

function hasPendingOpenQuestions(dir) {
  const content = readTextIfExists(path.join(dir, "open-questions.md"));
  if (!content.trim()) {
    return false;
  }
  return /^[-*]\s*\[\s\]/m.test(content) || /状态:\s*(pending|open|未回答|待回答)/i.test(content);
}

function workingStateReferences(dir) {
  const content = readTextIfExists(path.join(dir, "working-state.md"));
  const refs = new Set();
  const patterns = [
    /Segment\s*[:：]\s*([A-Za-z0-9_.-]+)/gi,
    /来源\s*[:：]\s*([A-Za-z0-9_.-]+)/gi,
    /\bSEG-[A-Za-z0-9_.-]+\b/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      refs.add(match[1] ?? match[0]);
    }
  }
  return Array.from(refs);
}

function buildStatus(ctx, changeId) {
  const dir = assertChangeExists(ctx, changeId);
  const stateInfo = readState(dir);
  const state = stateInfo.state;
  const tasks = readTasks(dir);

  return {
    projectRoot: ctx.projectRoot,
    changeId,
    changeDir: dir,
    workflowState: {
      exists: stateInfo.exists,
      path: stateInfo.path,
      state,
    },
    files: fileStatus(dir),
    artifacts: artifactStatus(dir),
    segments: {
      confirmedFromState: Array.isArray(state?.confirmedSegments) ? state.confirmedSegments : [],
      pendingFromState: Array.isArray(state?.pendingSegments) ? state.pendingSegments : [],
    },
    tasks: {
      total: tasks.length,
      complete: tasks.filter((task) => task.done).length,
      remaining: tasks.filter((task) => !task.done).length,
    },
    recommendations: stateInfo.exists
      ? []
      : [
          {
            action: "initialize_workflow_state",
            reason: "workflow-state.yaml does not exist.",
          },
        ],
  };
}

function validate(ctx, changeId) {
  const status = buildStatus(ctx, changeId);
  const findings = [];
  const state = status.workflowState.state;

  if (!status.workflowState.exists) {
    findings.push({ level: "error", code: "missing-workflow-state", message: "缺少 workflow-state.yaml。" });
    return { ...status, valid: false, findings };
  }

  if (state.schema !== workflowSchema) {
    findings.push({ level: "error", code: "invalid-schema", message: `workflow-state.yaml schema 必须是 ${workflowSchema}。` });
  }
  if (state.version !== 1) {
    findings.push({ level: "error", code: "invalid-version", message: "workflow-state.yaml version 必须是 1。" });
  }
  if (state.changeId !== changeId) {
    findings.push({ level: "error", code: "change-id-mismatch", message: "workflow-state.yaml changeId 与目录 change id 不一致。" });
  }
  if (!validStages.has(state.stage)) {
    findings.push({ level: "error", code: "invalid-stage", message: `未知 stage: ${state.stage}` });
  }

  const confirmed = new Set(Array.isArray(state.confirmedSegments) ? state.confirmedSegments : []);
  const refs = workingStateReferences(status.changeDir);
  const unconfirmedRefs = refs.filter((ref) => !confirmed.has(ref));
  if (refs.length > 0 && unconfirmedRefs.length > 0) {
    findings.push({
      level: "error",
      code: "working-state-unconfirmed-segment",
      message: "working-state.md 引用了未在 workflow-state.yaml confirmedSegments 中记录的 Segment。",
      refs: unconfirmedRefs,
    });
  }

  return {
    ...status,
    valid: !findings.some((finding) => finding.level === "error"),
    findings,
  };
}

function next(ctx, changeId) {
  const status = buildStatus(ctx, changeId);
  const dir = status.changeDir;
  const state = status.workflowState.state;

  if (!status.workflowState.exists) {
    return {
      action: "initialize_workflow_state",
      stage: "intent",
      changeId,
      output: "workflow-state.yaml",
      instruction: "创建 workflow-state.yaml，使用 workflow-loop schema，并记录当前 change id、ownerSkill、stage 和 updatedAt。",
      stop: false,
    };
  }

  if (Array.isArray(state.blockedBy) && state.blockedBy.length > 0) {
    return {
      action: "ask_user",
      stage: state.stage,
      changeId,
      reason: "workflow-state.yaml blockedBy 存在阻塞项。",
      blockedBy: state.blockedBy,
      stop: true,
    };
  }

  if (hasPendingOpenQuestions(dir)) {
    return {
      action: "ask_user",
      stage: state.stage,
      changeId,
      contextFiles: ["open-questions.md", "workflow-state.yaml", "working-state.md"],
      instruction: "读取 open-questions.md，只向用户提出阻塞下一阶段的问题；用户回答后将答案写回 change 状态。",
      stop: true,
    };
  }

  if (!status.files["intent.md"]) {
    return {
      action: "draft_intent",
      stage: state.stage,
      changeId,
      output: "intent.md",
      instruction: "根据用户原始意图创建 intent.md；只记录意图、范围和已知约束，不生成实现方案。",
      stop: false,
    };
  }

  if (!status.files["change-map.md"]) {
    return {
      action: "draft_change_map",
      stage: "segmenting",
      changeId,
      contextFiles: ["intent.md", "workflow-state.yaml", "working-state.md"],
      output: "change-map.md",
      instruction: "由 Codex 根据意图和当前真相拆分 Segment，记录依赖、输出和是否需要用户确认。",
      stop: false,
    };
  }

  if (!status.files["working-state.md"]) {
    return {
      action: "draft_working_state",
      stage: "segmenting",
      changeId,
      contextFiles: ["change-map.md", "segments/"],
      output: "working-state.md",
      instruction: "仅汇总已确认 Segment 的结论；未确认内容必须留在 Segment 草案或 open-questions.md。",
      stop: false,
    };
  }

  const missingArtifacts = planningArtifacts.filter((file) => !status.artifacts[file]);
  if (missingArtifacts.length > 0) {
    return {
      action: "draft_planning_artifact",
      stage: "planning",
      changeId,
      missingArtifacts,
      instruction: `使用目标项目的 OpenSpec/ChangePlan 工具生成缺失工件，优先处理: ${missingArtifacts[0]}。`,
      stop: false,
    };
  }

  if (state.stage === "archive-ready") {
    return {
      action: "archive_check",
      stage: state.stage,
      changeId,
      instruction: `运行 changeflow archive-check ${changeId} --json，并在用户最终确认后归档。`,
      stop: false,
    };
  }

  return {
    action: "continue_current_stage",
    stage: state.stage,
    changeId,
    instruction: "当前基础文件已齐备。由 Change Lead 根据 stage 推进实现、验收或知识回写；需要用户确认时停止。",
    stop: false,
  };
}

function promoteSegment(ctx, changeId, segmentId) {
  const dir = assertChangeExists(ctx, changeId);
  const stateInfo = readState(dir);
  if (!stateInfo.exists) {
    throw new Error("Cannot promote segment before workflow-state.yaml exists.");
  }
  const state = stateInfo.state;
  const confirmedSegments = new Set(Array.isArray(state.confirmedSegments) ? state.confirmedSegments : []);
  const pendingSegments = new Set(Array.isArray(state.pendingSegments) ? state.pendingSegments : []);
  confirmedSegments.add(segmentId);
  pendingSegments.delete(segmentId);
  const nextState = {
    ...state,
    confirmedSegments: Array.from(confirmedSegments).sort(),
    pendingSegments: Array.from(pendingSegments).sort(),
    updatedAt: today(),
  };
  writeState(stateInfo.path, nextState);
  return {
    promoted: true,
    changeId,
    segmentId,
    workflowStatePath: stateInfo.path,
    state: nextState,
  };
}

function handoff(ctx, changeId) {
  const status = buildStatus(ctx, changeId);
  const state = status.workflowState.state ?? {};
  const nextPacket = next(ctx, changeId);
  const handoffPath = path.join(status.changeDir, "handoff.md");
  const content = [
    "# Handoff",
    "",
    `Change: ${changeId}`,
    `Stage: ${state.stage ?? "missing-workflow-state"}`,
    `Updated: ${today()}`,
    "",
    "## 已确认 Segment",
    "",
    ...(status.segments.confirmedFromState.length > 0 ? status.segments.confirmedFromState.map((id) => `- ${id}`) : ["- 无"]),
    "",
    "## 待处理 Segment",
    "",
    ...(status.segments.pendingFromState.length > 0 ? status.segments.pendingFromState.map((id) => `- ${id}`) : ["- 无"]),
    "",
    "## 阻塞项",
    "",
    ...(Array.isArray(state.blockedBy) && state.blockedBy.length > 0 ? state.blockedBy.map((item) => `- ${item}`) : ["- 无"]),
    "",
    "## 下一步",
    "",
    "```json",
    JSON.stringify(nextPacket, null, 2),
    "```",
    "",
  ].join("\n");
  fs.writeFileSync(handoffPath, content, "utf8");

  if (status.workflowState.exists) {
    const nextState = {
      ...state,
      lastHandoff: "handoff.md",
      updatedAt: today(),
    };
    writeState(status.workflowState.path, nextState);
  }

  return {
    generated: true,
    changeId,
    handoffPath,
    next: nextPacket,
  };
}

export function archiveCheck(ctx, changeId) {
  const validation = validate(ctx, changeId);
  const state = validation.workflowState.state ?? {};
  const findings = [...validation.findings];
  const missingArtifacts = planningArtifacts.filter((file) => !validation.artifacts[file]);
  if (missingArtifacts.length > 0) {
    findings.push({ level: "error", code: "missing-planning-artifacts", message: "归档前缺少 planning artifacts。", files: missingArtifacts });
  }

  if (validation.tasks.total > 0 && validation.tasks.remaining > 0) {
    findings.push({ level: "error", code: "incomplete-tasks", message: "归档前 tasks.md 中仍有未完成任务。", remaining: validation.tasks.remaining });
  }

  if (state.acceptancePassed !== true && state.stage !== "archived") {
    findings.push({ level: "error", code: "acceptance-not-passed", message: "归档前必须记录 acceptancePassed: true。" });
  }

  if (state.knowledgeDeltaApplied !== true && state.stage !== "archived") {
    findings.push({ level: "error", code: "knowledge-delta-not-applied", message: "归档前必须记录 knowledgeDeltaApplied: true。" });
  }

  if (state.archiveConfirmedByUser !== true && state.stage !== "archived") {
    findings.push({ level: "error", code: "archive-not-confirmed", message: "归档前必须记录 archiveConfirmedByUser: true。" });
  }

  return {
    projectRoot: ctx.projectRoot,
    changeId,
    archiveAllowed: !findings.some((finding) => finding.level === "error"),
    findings,
  };
}

async function main() {
  const { options, positional } = parseArgs(process.argv.slice(2));
  const [command, changeId, segmentId] = positional;
  if (!command || command === "--help" || command === "-h") {
    usage(0);
  }
  if (!changeId) {
    throw new Error("Missing change id");
  }
  const ctx = context(options.project);

  switch (command) {
    case "status":
      print(buildStatus(ctx, changeId));
      break;
    case "next":
      print(next(ctx, changeId));
      break;
    case "validate":
      print(validate(ctx, changeId));
      break;
    case "promote-segment":
      if (!segmentId) {
        throw new Error("Missing segment id");
      }
      print(promoteSegment(ctx, changeId, segmentId));
      break;
    case "handoff":
      print(handoff(ctx, changeId));
      break;
    case "archive-check":
      print(archiveCheck(ctx, changeId));
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

export { context as workflowContext, validate };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
