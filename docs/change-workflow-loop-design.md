# AI 项目经理内部变更工作流

状态：implementation
日期：2026-07-06
适用范围：`project-manager` Codex 插件、目标项目 `project.yaml` 和 active change 状态

## 目标

`project-manager` 为每个项目提供一位具名 AI 项目经理。项目经理是唯一公开入口，内部变更工作流把一个需求从意图推进到：

```text
澄清范围
-> 生成规划工件
-> 用户确认关键 Segment
-> 实现
-> 验收
-> 知识回写
-> 归档
```

本仓库不是业务项目，不保存任何目标项目的业务事实、业务规则或工程实现。

## 单入口架构

源码只维护一套：

```text
runtime/      project.yaml 与 change CLI 运行时
content/      公开项目经理 Skill 和内部工作流源文件
profiles/     项目 profile，例如 vowup
adapters/     插件产物生成器
hooks/        身份恢复和姓名唤起
```

第一版构建一个 Codex 插件：

```text
plugins/project-manager/
  .codex-plugin/plugin.json
  skills/project-manager/
  internal/skills/
  hooks/
  profiles/
  runtime/
  bin/
  node_modules/
```

只有 `skills/project-manager/` 是公开 Skill。原 change skills 和领域角色是项目经理按需加载的内部能力。

## 目标项目边界

目标项目只保存自己的状态：

```text
AGENTS.md
project.yaml
knowledge-base/project/
changes/active/
changes/archived/
engineering/
```

`project.yaml` 只保存项目名称、项目经理身份、业务负责人称呼和目录位置。目标项目不保存插件源码、schema runtime、插件 skills 或 OpenSpec wrapper。

## 四层职责

| 层级 | 负责 | 不负责 |
| --- | --- | --- |
| 项目经理 | 唯一用户入口、认识业务负责人、协调内部能力、汇总决策 | 要求用户调度内部角色 |
| AI agent loop | 理解意图、判断缺口、生成问题、执行实现、做验收判断 | 充当持久化状态的唯一来源 |
| internal skills | 规定流程、阶段、确认点、领域协作方式 | 机械解析和状态校验 |
| runtime CLI | 状态摘要、文件存在性、阶段门禁、归档前检查 | 业务判断、问题生成、设计选择 |

关键原则：工具只回答“现在缺什么、能不能进入下一步”。问什么、怎么设计、怎么实现，仍由 AI 根据目标项目上下文判断。

## 命令职责

`changeplan` 管理规划工件：

```bash
changeplan --project <target-project> new <change-id>
changeplan --project <target-project> status <change-id> --json
changeplan --project <target-project> instructions design --change <change-id> --json
changeplan --project <target-project> instructions apply --change <change-id> --json
changeplan --project <target-project> archive <change-id>
```

`changeflow` 管理流程状态：

```bash
changeflow --project <target-project> status <change-id> --json
changeflow --project <target-project> next <change-id> --json
changeflow --project <target-project> validate <change-id> --json
changeflow --project <target-project> promote-segment <change-id> <segment-id> --json
changeflow --project <target-project> handoff <change-id> --json
changeflow --project <target-project> archive-check <change-id> --json
```

## Active Change 文件

目标项目的 `changes/active/<change-id>/` 内保存规划工件：

```text
proposal.md
context.md
spec.md
design.md
acceptance.md
knowledge-delta.md
tasks.md
```

动态流程额外保存过程状态：

```text
workflow-state.yaml
intent.md
change-map.md
working-state.md
open-questions.md
handoff.md
segments/
return-packets/
```

这些文件只属于当前 change。验收前，不得把未来事实写入 `knowledge-base/project/`。

## 阶段模型

`workflow-state.yaml` 使用以下 stage：

| Stage | 含义 |
| --- | --- |
| `intent` | 已收到改变意图，尚未澄清边界 |
| `discovery` | 正在读取当前真相并识别问题 |
| `segmenting` | 正在拆分 Segment |
| `planning` | 正在生成规划工件 |
| `implementation` | 已允许实现 |
| `acceptance` | 正在验收 |
| `knowledge-update` | 验收后准备回写项目真相 |
| `archive-ready` | 满足归档条件，等待最终确认 |
| `archived` | 已归档 |

最小状态文件：

```yaml
schema: workflow-loop
version: 1
changeId: <change-id>
stage: intent
ownerSkill: change-lead
confirmedSegments: []
pendingSegments: []
blockedBy: []
lastHandoff: null
updatedAt: YYYY-MM-DD
acceptancePassed: false
knowledgeDeltaApplied: false
archiveConfirmedByUser: false
```

## Segment 与 Working State

Segment 是大 change 内部的确认单元。只有用户确认过的 Segment 才能进入 `working-state.md`。

`working-state.md` 是当前 change 内部的临时权威。草案、推断、subagent 单方结论不得直接提升。

确认 Segment 后运行：

```bash
changeflow --project <target-project> promote-segment <change-id> <segment-id> --json
```

## Domain Lead 与 Return Packet

领域 skill 或 subagent 只负责局部分析、草案、实现建议或检查，不直接拥有最终 working state。

返回给 Change Lead 的 return packet 必须包含：

```text
来源
目标 Segment
输入文件
结论
证据
风险
建议写入 working-state 的内容
不能确认的内容
```

Change Lead 接收后负责检查冲突，并在需要用户确认时停止。

## 验证标准

静态验证：

```bash
npm run schema:validate
npm run changeplan -- --project <target-project> list --json
npm run changeplan -- --project <target-project> status <change-id> --json
npm run changeflow -- --project <target-project> validate <change-id> --json
npm run build
```

场景验证：

- 发起 change 后，`changeflow next` 能要求初始化 `workflow-state.yaml`。
- 存在 pending open questions 时，`changeflow next` 返回 `ask_user`。
- 未确认 Segment 不允许进入 `working-state.md`。
- 缺少规划工件时，`changeplan instructions apply` 阻止实现。
- 验收、知识回写或用户确认缺失时，`changeflow archive-check` 阻止归档。
