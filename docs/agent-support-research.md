# AI 项目经理 Agent 支持调研

状态：需求调研  
日期：2026-07-11  
目的：确定 AI 项目经理需要支持哪些编码 Agent，以及多 Agent 支持对后续设计和实现的影响。

## 1. 结论

“支持哪些 Agent”是产品需求，不只是实现细节。但是不能把“需求不绑定 Agent”理解成“同一份插件天然可以在所有 Agent 中运行”。

调研后的建议是：

1. 第一版完整支持并验收 Codex。
2. 从第一版架构设计开始，把 Claude Code 作为第二个完整适配目标，确保核心模型不能依赖 Codex 独有机制。
3. 使用 GitHub Copilot、Gemini CLI 和 OpenCode 检查核心工件、状态和命令是否可移植，后续按需求增加完整适配器。
4. Cursor、Windsurf、Cline 和 Roo Code 第一阶段只要求能够消费公共项目指令、项目状态和通用 Skill，不承诺原生安装、命令、Hook、子 Agent 和会话体验完全一致。
5. 不把任何 Agent 自带的聊天历史、Memory、任务列表或 UI 状态作为项目权威状态。

这意味着产品采用“可移植核心 + Agent 适配器”，而不是维护多份彼此独立的项目经理实现。

## 2. 什么叫支持

必须先区分支持级别，否则“支持某 Agent”无法验收。

### 2.1 完整支持

完整支持一个 Agent，至少表示：

- 有明确安装或启用方式。
- 用户有稳定的项目经理入口。
- 能读取项目级信息和当前变化状态。
- 能推进需求、设计、实现、验收和知识更新。
- 能恢复中断后的工作。
- 能执行权限确认策略。
- 有该 Agent 环境下的端到端验收。

### 2.2 标准兼容

标准兼容表示该 Agent 可以读取项目中的公共指令、知识、Change 工件和通用 Skill，并可以调用公共 CLI 或 MCP，但尚未提供或验证完整的原生体验。

### 2.3 未支持

只是在理论上可以读取 Markdown 或运行命令，不等于产品支持。没有安装说明、能力映射和验收证据时，不应宣称支持。

## 3. 候选 Agent

以下不是市场上所有编码 Agent 的完整名单，而是与本项目“本地项目管理、文件持久化、可扩展工作流、工程实施”最相关的候选。

| Agent | 主要运行形态 | 可复用能力 | 主要差异 | 建议级别 |
| --- | --- | --- | --- | --- |
| Codex | CLI、IDE、桌面、云端 | `AGENTS.md`、Agent Skills、MCP、子 Agent | Codex Plugin、Hook、配置和桌面任务机制是平台专用的 | 第一版完整支持 |
| Claude Code | 终端和 IDE 集成 | Skills、MCP、插件、子 Agent、Hook、项目指令 | 使用 `CLAUDE.md`、Claude Plugin 和自己的权限/Hook/Agent 格式 | 第二个完整适配目标 |
| GitHub Copilot | CLI、VS Code/JetBrains、GitHub 云端 Agent | `AGENTS.md`、Agent Skills、MCP、自定义 Agent、Hook | 本地 CLI、IDE 和云端 Agent 的能力并不完全一致，配置主要位于 `.github/` | 后续完整适配候选 |
| Gemini CLI | 终端、Headless、IDE Companion | `GEMINI.md`、Extension、自定义命令、MCP、Checkpoint | Extension Manifest 和命令格式专用；官方文档中没有与 Codex/Claude 完全等价的统一子 Agent/Hook 合约 | 后续完整适配候选 |
| OpenCode | 终端、桌面和 IDE | `AGENTS.md`、Agent Skills、MCP、主 Agent/子 Agent、Plugin | 使用 `opencode.json` 和 `.opencode/`，模型与提供商可以独立选择 | 后续完整适配候选 |
| Cursor | IDE 和 CLI | `AGENTS.md`、Rules、Skills、Subagents、Hooks、MCP | 核心体验与 `.cursor/` 和 IDE 状态结合较深，功能演进较快 | 第一阶段标准兼容 |
| Windsurf | IDE/Cascade | `AGENTS.md`、Rules、Skills、Workflows、MCP、Memories | `.windsurf/`、Cascade Workflows 和本机 Memory 是平台专用能力 | 第一阶段标准兼容 |
| Cline | IDE、CLI/SDK | Rules、Skills、MCP、Checkpoint，SDK 提供 Agent Runtime | Skills 仍标记为实验能力；安装和编排方式与 VS Code 扩展/SDK 绑定 | 第一阶段标准兼容 |
| Roo Code | VS Code 扩展 | `AGENTS.md`、Agent Skills、Modes、Tasks、MCP | 以 Mode 和 Task 为主要编排抽象，和其他 Agent 的子 Agent 模型不同 | 第一阶段标准兼容 |

## 4. 已经形成的跨 Agent 公共基础

### 4.1 `AGENTS.md`

`AGENTS.md` 已经是多个编码 Agent 识别的仓库级指导格式，适合放置稳定、简短、需要每次工作都遵守的项目规则和路由说明。

它适合保存“如何找到项目材料、必须遵守哪些约束”，但不适合作为 Change 状态数据库，也不应该塞入全部项目知识。

### 4.2 Agent Skills

以 `SKILL.md` 为入口的 Agent Skills 已经成为跨 Agent 的开放格式。Codex、Claude Code、GitHub Copilot、Cursor、Windsurf、OpenCode、Cline 和 Roo Code 都已经提供支持或兼容能力，但安装位置、调用方式和支持成熟度不同。

因此通用的项目经理流程能力应优先写成标准 Skill 源码，再由适配器投影到各 Agent 要求的位置。不能把某个平台的插件目录直接当成唯一源码。

### 4.3 MCP

MCP 在主要候选中已经普遍存在，适合连接 GitHub、数据库、设计工具和项目管理系统等外部能力。

本项目的核心状态首先应保存在项目文件中。只有需要访问外部系统或提供跨进程工具时才使用 MCP，不能为了跨 Agent 而把所有本地流程都做成 MCP 服务。

### 4.4 文件和 CLI

所有候选都能读取项目文件，大多数可以执行终端命令。这是最稳定的公共能力。

确定性校验、状态摘要和格式迁移如果确实需要程序实现，应提供 Agent 无关的 CLI 或库；各 Agent 只负责调用它，不应分别重写业务判断。

## 5. 对架构设计的影响

### 5.1 必须拆分可移植核心与 Agent 适配器

建议的逻辑边界是：

```text
项目内权威数据
  +
通用需求/设计/实现/验收流程
  +
确定性运行时
        |
        +-- Codex adapter
        +-- Claude Code adapter
        +-- Copilot adapter
        +-- Gemini CLI adapter
        +-- OpenCode adapter
        +-- IDE agent compatibility
```

核心层负责：

- 项目和 Change 的信息模型。
- 阶段、完成条件和权限策略。
- 项目知识更新规则。
- 可恢复状态。
- Agent Skills 的通用流程源码。
- 可确定执行和校验的公共运行时。

适配器负责：

- 安装与发现。
- 用户入口。
- Agent 专用配置和 Manifest。
- Skill、命令和角色文件的位置映射。
- Hook 和权限系统映射。
- 子 Agent 或委派机制映射。
- 各运行环境的端到端测试。

### 5.2 核心正确性不能依赖 Hook

不同 Agent 的 Hook 事件、输入格式、阻断能力和成熟度不同。Hook 可以改善体验或做自动检查，但核心流程不能因为某个平台没有同等 Hook 就失效。

归档、知识更新和高风险操作等关键约束，应当能通过项目状态和确定性校验独立判断。

### 5.3 核心流程不能依赖子 Agent

Codex、Claude Code、Copilot、OpenCode、Cursor 和 Roo Code 都有不同程度的委派能力，但名称、上下文继承、权限和返回方式不统一。

领域角色应当被定义为“输入、职责、输出和权限”的逻辑角色。某个 Agent 支持原生子 Agent 时可以映射为子 Agent；不支持时，主 Agent 也必须能够顺序执行同一职责。

### 5.4 会话不是权威状态

各 Agent 的恢复机制差异很大：有的保存线程，有的保存 Checkpoint，有的依赖 IDE，有的运行在临时云端环境。

项目目标、已确认决定、当前阶段、未解决问题和知识更新状态必须保存在项目内。Agent 的 Memory 和会话恢复只能作为便利层。

### 5.5 需要能力清单和一致性测试

每个完整支持的 Agent 都应有一份能力清单，说明：

- 支持哪些入口和安装方式。
- 是否支持自动加载 Skill。
- 是否支持子 Agent、Hook 和 MCP。
- 权限确认如何映射。
- 哪些能力降级为主 Agent 顺序执行。
- 已通过哪些端到端场景。

只有通过公共一致性场景，才能把该 Agent 标记为“完整支持”。

## 6. 对第一版范围的建议

第一版不应同时实现所有适配器。那会让“连接钱包登录”的业务验证变成 Agent 平台兼容性工程。

建议第一版范围为：

- 完成可移植核心。
- 完成 Codex 适配器并走通真实功能闭环。
- 在设计文档中完成 Claude Code 的能力映射，证明没有使用无法替代的 Codex 专属假设。
- 用公共格式检查 GitHub Copilot、Gemini CLI 和 OpenCode 的可适配性。
- 暂不实现 Cursor、Windsurf、Cline 和 Roo Code 的原生适配器。

第二个完整适配器建议选择 Claude Code，因为它的 Skills、插件、子 Agent、Hook 和 MCP 能力足以检验适配器边界，而用户也已经明确认识并关注该 Agent。

## 7. 建议形成的产品需求

1. 多 Agent 支持是正式产品需求。
2. 第一版完整支持 Codex，但 Codex 不是产品唯一目标平台。
3. 核心项目数据、流程语义和确定性运行时必须与 Agent 无关。
4. 新 Agent 通过适配器接入，不能复制一套核心流程。
5. `AGENTS.md`、Agent Skills、MCP、项目文件和 CLI 是优先采用的公共基础。
6. Agent 专用 Memory、会话、Hook、子 Agent 和插件只能作为增强层。
7. 每个宣称完整支持的 Agent 必须通过同一套端到端一致性测试。

## 8. 官方资料

- Codex：[Customization](https://developers.openai.com/codex/concepts/customization)、[Plugins](https://developers.openai.com/codex/plugins)、[Advanced configuration](https://developers.openai.com/codex/config-advanced)
- Claude Code：[Extend Claude Code](https://code.claude.com/docs/en/features-overview)、[Subagents](https://code.claude.com/docs/en/sub-agents)、[Hooks](https://code.claude.com/docs/en/hooks)
- GitHub Copilot：[Agent Skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)、[Custom agents](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-custom-agents)、[CLI reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference)
- Gemini CLI：[Overview](https://google-gemini.github.io/gemini-cli/)、[Extensions](https://google-gemini.github.io/gemini-cli/docs/extensions/)、[CLI](https://google-gemini.github.io/gemini-cli/docs/cli/)
- Cursor：[Rules](https://docs.cursor.com/context/rules-for-ai)、[CLI](https://docs.cursor.com/en/cli/using)、[MCP](https://docs.cursor.com/context/model-context-protocol)
- Windsurf：[Memories, Rules, Workflows and Skills](https://docs.windsurf.com/zh/windsurf/cascade/memories)
- OpenCode：[Overview](https://opencode.ai/docs)、[Agents](https://opencode.ai/docs/agents/)、[Tools](https://opencode.ai/docs/tools/)
- Cline：[Skills](https://docs.cline.bot/customization/skills)、[SDK](https://docs.cline.bot/sdk/overview)
- Roo Code：[Modes](https://roocodeinc.github.io/Roo-Code/basic-usage/using-modes/)、[Skills](https://roocodeinc.github.io/Roo-Code/features/skills/)
- 公共格式：[AGENTS.md](https://agents.md/)、[Agent Skills](https://agentskills.io/)

## 9. 时效性说明

Agent 产品能力变化很快。本调研用于确定稳定的产品边界，不把当前某个产品的具体文件名或预览功能固化成核心要求。开始实现某个适配器前，需要再次核对该 Agent 的官方文档和实际版本。
