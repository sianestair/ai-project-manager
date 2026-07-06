#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(args) {
  const options = { project: process.cwd() };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
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

const { options, positional } = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(options.project);
const changeId = positional[0];

if (!changeId) {
  console.error("用法: node profiles/vowup/scripts/check-change-language.mjs [--project <path>] <change-id>");
  process.exit(2);
}

const changeDir = path.join(projectRoot, "changes", "active", changeId);

if (!fs.existsSync(changeDir)) {
  console.error(`未找到 active change: ${changeDir}`);
  process.exit(2);
}

const files = [
  "proposal.md",
  "context.md",
  "spec.md",
  "design.md",
  "acceptance.md",
  "knowledge-delta.md",
  "tasks.md",
  "README.md",
].map((fileName) => path.join(changeDir, fileName))
  .filter((filePath) => fs.existsSync(filePath));

const bannedLinePatterns = [
  /^#\s+(Proposal|Context|Spec|Design|Acceptance|Knowledge Delta|Tasks)\b/,
  /^##\s+(Why|What Changes|Scope|Out Of Scope|Current Truth Likely Affected|Impact)\b/,
  /^##\s+(Consumed Current Truth|External References|Inherited Constraints|Declared Baseline Changes|Conflicts Or Gaps)\b/,
  /^##\s+(Future Facts|Future Rules|Boundaries|Trace To Current Truth)\b/,
  /^##\s+(Selected Approach|Data, Interfaces, And Events|Security And Failure Handling|Alternatives Considered|Spec Traceability|Risks)\b/,
  /^##\s+(Acceptance Scope|Checks|Validation Commands|Manual Verification|Not Verified)\b/,
  /^##\s+(Apply Only After Acceptance|Project Updates|No Project Update|Archive Conditions)\b/,
  /^##\s+\d+\.\s+(Preparation|Implementation|Verification|Documentation|Knowledge And Archive)\b/,
  /^###\s+(Vocabulary|Facts|Rules|Decisions|Contract Structure|Configuration Model|Runtime Instance Model)\b/,
  /^###\s+(Contracts Module Boundary|Query Projection Boundary|App Boundary|Factory Interface Shape|Runtime Interface Shape|Signature Payloads)\b/,
  /^###\s+(Reward Release|Termination Settlement|Event Semantics|Access Control|State Checks|Transfer Safety|Failure Behavior)\b/,
  /<!--\s*(Explain|Describe|Define|List|State|Record|Summarize|Briefly|Map|Check|Task description)\b/,
  /^Define and implement the contracts MVP for an end-to-end Vow flow$/,
];

const findings = [];

for (const filePath of files) {
  const relativePath = path.relative(projectRoot, filePath);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (bannedLinePatterns.some((pattern) => pattern.test(line))) {
      findings.push({
        file: relativePath,
        line: index + 1,
        text: line,
      });
    }
  }
}

if (findings.length > 0) {
  console.error(`发现 ${findings.length} 处英文模板残留:`);
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.text}`);
  }
  process.exit(1);
}

console.log(`语言检查通过: ${changeId}`);
