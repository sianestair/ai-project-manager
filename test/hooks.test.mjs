import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handleHook } from "../hooks/project-context.mjs";
import { initializeProjectConfig } from "../runtime/project/project-config.mjs";

function temporaryProject(t, initialized = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-manager-hook-"));
  fs.mkdirSync(path.join(root, ".git"));
  if (initialized) {
    initializeProjectConfig(root, {
      projectName: "VowUp",
      managerName: "林舟",
      ownerName: "张三",
      ownerAddress: "张总",
    });
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("SessionStart injects project identity and plugin root", (t) => {
  const root = temporaryProject(t);
  const result = handleHook(
    { hook_event_name: "SessionStart", cwd: root },
    { PLUGIN_ROOT: "C:/plugins/project-manager" },
  );

  assert.equal(result.eventName, "SessionStart");
  assert.match(result.additionalContext, /项目经理：林舟/);
  assert.match(result.additionalContext, /张总/);
  assert.match(result.additionalContext, /C:\/plugins\/project-manager/);
});
test("UserPromptSubmit routes only explicit manager invocations", (t) => {
  const root = temporaryProject(t);
  const invoked = handleHook({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "林舟，继续推进项目" }, {});
  const ordinary = handleHook({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "检查一下测试" }, {});

  assert.match(invoked.additionalContext, /直接调用 AI 项目经理/);
  assert.equal(ordinary, null);
});

test("uninitialized project routes explicit initialization without inventing identity", (t) => {
  const root = temporaryProject(t, false);
  const result = handleHook({ hook_event_name: "UserPromptSubmit", cwd: root, prompt: "@project-manager 初始化" }, {});

  assert.match(result.additionalContext, /尚未初始化/);
  assert.match(result.additionalContext, /不要自行虚构/);
});
