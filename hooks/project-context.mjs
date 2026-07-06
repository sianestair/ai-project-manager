#!/usr/bin/env node

import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadProjectConfig,
  projectContext,
  renderProjectContext,
} from "../runtime/project/project-config.mjs";

function readStdin() {
  return new Promise((resolve, reject) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      try {
        resolve(input.trim().length > 0 ? JSON.parse(input) : {});
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on("error", reject);
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isManagerInvocation(prompt, managerName = null) {
  const trimmed = String(prompt ?? "").trim();
  if (/^@project-manager(?:\b|\s|[，,：:。])/i.test(trimmed)) {
    return true;
  }
  if (/^项目经理(?:\s|[，,：:。]|$)/.test(trimmed)) {
    return true;
  }
  if (managerName) {
    return new RegExp(`^${escapeRegExp(managerName)}(?:\\s|[，,：:。]|$)`).test(trimmed);
  }
  return false;
}

function emitAdditionalContext(eventName, additionalContext) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext,
    },
  })}\n`);
}

export function handleHook(input, environment = process.env) {
  const cwd = input.cwd || process.cwd();
  const pluginRoot = environment.PLUGIN_ROOT || environment.CLAUDE_PLUGIN_ROOT || null;
  const loaded = loadProjectConfig(cwd);
  const context = projectContext(loaded, pluginRoot);

  if (input.hook_event_name === "SessionStart") {
    return { eventName: "SessionStart", additionalContext: renderProjectContext(context) };
  }

  if (input.hook_event_name === "UserPromptSubmit") {
    const managerName = context.status === "initialized" ? context.managerName : null;
    if (!isManagerInvocation(input.prompt, managerName)) {
      return null;
    }
    return {
      eventName: "UserPromptSubmit",
      additionalContext: [
        renderProjectContext(context),
        "用户正在直接调用 AI 项目经理。加载并遵循 project-manager Skill；不要将请求路由成普通无身份对话。",
      ].join("\n"),
    };
  }

  return null;
}

async function main() {
  const input = await readStdin();
  const output = handleHook(input);
  if (output) {
    emitAdditionalContext(output.eventName, output.additionalContext);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
