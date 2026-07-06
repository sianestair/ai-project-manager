import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { locateProject } from "./project-root.mjs";

export const projectSchema = "project-manager";
export const projectSchemaVersion = 1;

export const defaultLocations = Object.freeze({
  currentTruth: "knowledge-base/project",
  activeChanges: "changes/active",
  archivedChanges: "changes/archived",
  engineering: "engineering",
});

const allowedKeys = {
  root: new Set(["schema", "version", "project", "projectManager", "businessOwner", "locations"]),
  project: new Set(["name"]),
  projectManager: new Set(["name"]),
  businessOwner: new Set(["name", "preferredAddress"]),
  locations: new Set(Object.keys(defaultLocations)),
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addUnknownKeyFindings(findings, value, allowed, field) {
  if (!isPlainObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      findings.push({
        level: "error",
        code: "unknown-field",
        field: field ? `${field}.${key}` : key,
        message: `不支持的配置字段：${field ? `${field}.` : ""}${key}`,
      });
    }
  }
}

function requireObject(findings, value, field) {
  if (!isPlainObject(value)) {
    findings.push({ level: "error", code: "invalid-object", field, message: `${field} 必须是对象。` });
    return false;
  }
  return true;
}

function requireString(findings, value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    findings.push({ level: "error", code: "invalid-string", field, message: `${field} 必须是非空字符串。` });
    return false;
  }
  return true;
}

function validateRelativeLocation(findings, projectRoot, value, field) {
  if (!requireString(findings, value, field)) {
    return;
  }
  if (path.isAbsolute(value)) {
    findings.push({ level: "error", code: "absolute-location", field, message: `${field} 必须是项目内相对路径。` });
    return;
  }

  const resolved = path.resolve(projectRoot, value);
  const relative = path.relative(projectRoot, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    findings.push({ level: "error", code: "location-outside-project", field, message: `${field} 不能指向项目外部。` });
  }
}

export function validateProjectConfig(config, projectRoot) {
  const findings = [];
  if (!isPlainObject(config)) {
    return {
      valid: false,
      findings: [{ level: "error", code: "invalid-root", field: "", message: "project.yaml 根节点必须是对象。" }],
    };
  }

  addUnknownKeyFindings(findings, config, allowedKeys.root, "");

  if (config.schema !== projectSchema) {
    findings.push({
      level: "error",
      code: "invalid-schema",
      field: "schema",
      message: `schema 必须是 ${projectSchema}。`,
    });
  }
  if (config.version !== projectSchemaVersion) {
    findings.push({
      level: "error",
      code: "unsupported-version",
      field: "version",
      message: `version 必须是 ${projectSchemaVersion}。`,
    });
  }

  if (requireObject(findings, config.project, "project")) {
    addUnknownKeyFindings(findings, config.project, allowedKeys.project, "project");
    requireString(findings, config.project.name, "project.name");
  }
  if (requireObject(findings, config.projectManager, "projectManager")) {
    addUnknownKeyFindings(findings, config.projectManager, allowedKeys.projectManager, "projectManager");
    requireString(findings, config.projectManager.name, "projectManager.name");
  }
  if (requireObject(findings, config.businessOwner, "businessOwner")) {
    addUnknownKeyFindings(findings, config.businessOwner, allowedKeys.businessOwner, "businessOwner");
    requireString(findings, config.businessOwner.name, "businessOwner.name");
    requireString(findings, config.businessOwner.preferredAddress, "businessOwner.preferredAddress");
  }
  if (requireObject(findings, config.locations, "locations")) {
    addUnknownKeyFindings(findings, config.locations, allowedKeys.locations, "locations");
    for (const key of Object.keys(defaultLocations)) {
      validateRelativeLocation(findings, projectRoot, config.locations[key], `locations.${key}`);
    }
  }

  return { valid: !findings.some((finding) => finding.level === "error"), findings };
}

export function loadProjectConfig(startPath = process.cwd()) {
  const located = locateProject(startPath);
  if (!located.configExists) {
    return { ...located, status: "uninitialized", valid: false, config: null, findings: [] };
  }

  let config;
  try {
    config = parseYaml(fs.readFileSync(located.configPath, "utf8"));
  } catch (error) {
    return {
      ...located,
      status: "invalid",
      valid: false,
      config: null,
      findings: [{
        level: "error",
        code: "yaml-parse-error",
        field: "",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const validation = validateProjectConfig(config, located.projectRoot);
  return {
    ...located,
    status: validation.valid ? "initialized" : "invalid",
    valid: validation.valid,
    config,
    findings: validation.findings,
  };
}

export function createProjectConfig(input) {
  return {
    schema: projectSchema,
    version: projectSchemaVersion,
    project: { name: input.projectName.trim() },
    projectManager: { name: input.managerName.trim() },
    businessOwner: {
      name: input.ownerName.trim(),
      preferredAddress: input.ownerAddress.trim(),
    },
    locations: {
      ...defaultLocations,
      ...(input.locations ?? {}),
    },
  };
}

export function initializeProjectConfig(startPath, input) {
  const located = locateProject(startPath);
  if (located.configExists) {
    const existing = loadProjectConfig(startPath);
    const error = new Error(`项目已经存在 project.yaml，不能重复初始化：${located.configPath}`);
    error.code = existing.status === "initialized" ? "already-initialized" : "existing-invalid-config";
    error.details = existing;
    throw error;
  }

  const config = createProjectConfig(input);
  const validation = validateProjectConfig(config, located.projectRoot);
  if (!validation.valid) {
    const error = new Error("项目配置未通过校验。");
    error.code = "invalid-project-config";
    error.details = validation;
    throw error;
  }

  writeConfigAtomic(located.configPath, config);
  return loadProjectConfig(located.projectRoot);
}

function writeConfigAtomic(configPath, config) {
  const temporaryPath = `${configPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, stringifyYaml(config, { lineWidth: 0 }), "utf8");
  fs.renameSync(temporaryPath, configPath);
}

export function updateProjectConfig(startPath, updates) {
  const loaded = loadProjectConfig(startPath);
  if (loaded.status !== "initialized") {
    const error = new Error("只有已初始化且有效的 project.yaml 才能更新。");
    error.code = "project-not-initialized";
    error.details = loaded;
    throw error;
  }

  const current = loaded.config;
  const next = {
    ...current,
    project: {
      ...current.project,
      ...(updates.projectName !== undefined ? { name: updates.projectName.trim() } : {}),
    },
    projectManager: {
      ...current.projectManager,
      ...(updates.managerName !== undefined ? { name: updates.managerName.trim() } : {}),
    },
    businessOwner: {
      ...current.businessOwner,
      ...(updates.ownerName !== undefined ? { name: updates.ownerName.trim() } : {}),
      ...(updates.ownerAddress !== undefined ? { preferredAddress: updates.ownerAddress.trim() } : {}),
    },
    locations: {
      ...current.locations,
      ...(updates.locations ?? {}),
    },
  };

  const validation = validateProjectConfig(next, loaded.projectRoot);
  if (!validation.valid) {
    const error = new Error("更新后的项目配置未通过校验。");
    error.code = "invalid-project-config";
    error.details = validation;
    throw error;
  }

  writeConfigAtomic(loaded.configPath, next);
  return loadProjectConfig(loaded.projectRoot);
}

export function projectContext(loadResult, pluginRoot = null) {
  if (loadResult.status === "initialized") {
    const config = loadResult.config;
    return {
      status: "initialized",
      projectRoot: loadResult.projectRoot,
      configPath: loadResult.configPath,
      pluginRoot,
      projectName: config.project.name,
      managerName: config.projectManager.name,
      ownerName: config.businessOwner.name,
      ownerAddress: config.businessOwner.preferredAddress,
      locations: config.locations,
    };
  }
  return {
    status: loadResult.status,
    projectRoot: loadResult.projectRoot,
    configPath: loadResult.configPath,
    pluginRoot,
    findings: loadResult.findings,
  };
}

export function renderProjectContext(context) {
  if (context.status === "initialized") {
    return [
      "AI 项目经理项目上下文：",
      `- 项目：${context.projectName}`,
      `- 项目经理：${context.managerName}`,
      `- 项目业务负责人：${context.ownerName}`,
      `- 对业务负责人的称呼：${context.ownerAddress}`,
      `- 项目根目录：${context.projectRoot}`,
      ...(context.pluginRoot ? [`- project-manager 插件根目录：${context.pluginRoot}`] : []),
      `- 当前项目真相：${context.locations.currentTruth}`,
      `- Active changes：${context.locations.activeChanges}`,
      `- Archived changes：${context.locations.archivedChanges}`,
      `- 工程实现：${context.locations.engineering}`,
      `当用户称呼“${context.managerName}”或“项目经理”时，将请求交给 project-manager Skill 处理。`,
      "项目经理负责协调内部角色；只有业务决策、验收确认和归档确认需要升级给项目业务负责人。",
    ].join("\n");
  }
  if (context.status === "invalid") {
    return [
      "AI 项目经理检测到无效的 project.yaml。",
      `配置路径：${context.configPath}`,
      "不要覆盖该文件；应先报告校验错误并请求用户修复或明确修改。",
    ].join("\n");
  }
  return [
    "当前项目尚未初始化 AI 项目经理。",
    `预期配置路径：${context.configPath}`,
    ...(context.pluginRoot ? [`project-manager 插件根目录：${context.pluginRoot}`] : []),
    "不要自行虚构项目经理或业务负责人姓名。用户调用 @project-manager 初始化时，执行一次性初始化。",
  ].join("\n");
}
