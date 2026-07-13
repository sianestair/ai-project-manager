# Agentic 开发方法调研：BMAD、OpenSpec 与 Superpowers

状态：调研完成
日期：2026-07-12
对照基线：[第一版架构基线](architecture.md)
采纳状态：I-01 至 I-08 已于 2026-07-13 纳入架构补强或实现约束
调研范围：BMAD Method、OpenSpec、obra/superpowers

## 1. 调研目的

本调研不选择一个现成框架替代当前架构，而是回答：

1. 三个项目截至当前稳定版如何组织意图、需求、设计、实施、验证和恢复。
2. 它们如何区分项目当前状态与进行中的变化。
3. 哪些机制能够补强当前 AI 项目经理架构。
4. 哪些机制会引入与第一版目标不相称的复杂度，不应照搬。

“Superpowers”在本文中指 [obra/superpowers](https://github.com/obra/superpowers)。本次只使用公开官方仓库、官方文档和 GitHub Release；没有安装或绑定 GitHub 插件。

## 2. 版本基线与时效性

截至 2026-07-12，通过三个官方 GitHub 仓库的 latest release API 核对到：

| 项目 | 最新稳定版 | 发布时间 | 本次重点 |
| --- | --- | --- | --- |
| BMAD Method | [v6.10.0](https://github.com/bmad-code-org/BMAD-METHOD/releases/tag/v6.10.0) | 2026-07-03 | `bmad-loop`、`bmad-dev-auto`、spec frontmatter 状态机、自动评审循环 |
| OpenSpec | [v1.6.0](https://github.com/Fission-AI/OpenSpec/releases/tag/v1.6.0) | 2026-07-10 | `/opsx:update`、artifact graph、验证与归档一致性、归档冲突保护 |
| Superpowers | [v6.1.1](https://github.com/obra/superpowers/releases/tag/v6.1.1) | 2026-07-02 | Codex 原生 Skill 发现、不依赖 SessionStart Hook、确定性插件打包 |

这些项目更新频繁。本文把具体版本作为证据快照，把可长期复用的设计原则与版本专属命令分开。

## 3. 总体结论

三个项目分别擅长不同层面：

- **BMAD** 是覆盖分析、规划、架构、story 和实施的完整方法体系，最强的是渐进式上下文、复杂度路由、实现就绪检查和长流程编排。
- **OpenSpec** 是轻量的 spec/change 工件与 CLI 模型，最强的是“当前真相 vs proposed change”、artifact dependency graph、delta 合并和跨 Agent 生成。
- **Superpowers** 是可组合的 Agent Skills 开发纪律，最强的是在关键时点强制正确行为：先理解和设计，再计划，按任务实施，评审，最后用新鲜证据证明完成。

当前架构方向总体正确，尤其是以下边界得到三者共同支持：

- 项目文件而不是聊天历史保存权威状态。
- 当前状态与 active Change 分离。
- 需求、设计、任务和验证之间需要可追溯。
- 实施可以自主推进，但开始实施和声明完成必须有明确门。
- Agent 专用机制应是适配器或增强层，核心状态不能依赖 Hook、Memory 或子 Agent。

最值得补强的不是增加更多角色或文档，而是六点：

1. 将“阶段”与“当前可执行动作”分开。
2. 增加业务语义上的实现就绪检查。
3. 在请求用户确认前先完成 AI 自检。
4. 把验证明确拆成完整性、符合性和工程质量。
5. 强化 blocked、评审回环和非收敛状态。
6. 让实施任务本身成为小而可验证的交付契约。

以上补强已于 2026-07-13 纳入架构基线；具体采纳边界见第 8 节。

## 4. BMAD Method

### 4.1 当前工作模型

BMAD v6 的主线仍是四个宏观阶段：Analysis、Planning、Solutioning、Implementation。不同复杂度使用不同路径：

- Quick Flow：清晰、较小的变化，使用 tech spec 或 `bmad-quick-dev`。
- BMad Method：产品或复杂功能，形成 PRD、架构、UX、epics/stories。
- Enterprise：在普通方法之上增加安全、DevOps 等更强约束。

官方 [Workflow Map](https://docs.bmad-method.org/reference/workflow-map/) 强调“每个工件成为下一步的上下文”，架构先于 epics/stories，从而让任务拆分能够吸收真实的技术约束。

BMAD 最近几个版本进一步把大而固定的流程收缩成更灵活的“spine”：

- v6.8 的 `bmad-spec` 把混乱输入压缩成紧凑的 SPEC 核心。
- v6.9 的 `bmad-architecture` 使用 `ARCHITECTURE-SPINE.md` 作为设计真相主干，并可按需要扩展输出。
- 同一 Skill 支持 Create、Update、Validate 意图，避免为同一材料生命周期维护多个重复 Skill。

### 4.2 值得借鉴的机制

#### A. 按风险和不确定性路由，而不是所有 Change 一刀切

BMAD 的 Quick Flow / Method / Enterprise 表明，过程强度应该由规划需求和风险决定，而不是只看 story 数量。

对当前架构的启发：

- 固定需求、设计、验收和知识门不变。
- 允许设计与交付材料的深度按变化风险扩展。
- 第一版不必马上增加三个正式 profile，但 `change.yaml` 可以预留一个由 AI 判断并说明理由的 `route` 或 `risk_class`。
- “连接钱包登录”涉及身份、安全和会话边界，应走完整设计与安全材料，而不是因为代码量不大就走最短路径。

#### B. 设计入口可以是 spine，而不是巨型文档

BMAD v6.9 的 architecture spine 与当前 `design/README.md + 条件性材料` 思路高度一致。README 应保存：

- 设计结论主干。
- 覆盖范围和未涉及范围。
- 关键决定。
- 其他设计材料的索引。

具体接口、安全、数据和运行设计可以按需展开。无需退回固定单一 `design.md`。

#### C. 实现就绪检查不是 schema validation

BMAD 的 `bmad-check-implementation-readiness` 会跨 PRD、UX、Architecture 和 Epics 检查完整性、覆盖和一致性，并输出 PASS / CONCERNS / FAIL。它是业务与设计判断，不只是文件是否存在。

对当前架构的启发：

- `pm validate` 继续只做结构、引用和状态一致性校验。
- AI 项目经理在请求设计确认前执行一次语义 readiness review；设计门确认后，只有仍然有效的 `PASS` 或已处置 `CONCERNS` 才允许进入实施。
- 结果建议为 `PASS`、`CONCERNS`、`FAIL`：
  - `PASS`：可实施。
  - `CONCERNS`：存在已知风险，但不改变确认基线；记录后可继续。
  - `FAIL`：需求、设计或任务存在阻塞，回到最早受影响材料。
- 第一版可把结果写入 `design/README.md` 的 readiness 小节，不必增加永久新文档。

#### D. 将“下一步是什么”作为产品能力

`bmad-help` 的价值不是又一个 Agent，而是能根据工件和进度回答下一步。当前 `pm status` 已有相同方向，应确保输出不是状态字段堆叠，而是：

- 当前目标。
- 已确认内容。
- 当前可执行动作。
- 被什么门阻止。
- 谁负责下一步。
- 继续所需的最小输入。

#### E. 可轮询、可恢复的执行状态

BMAD v6.10 的 [`bmad-dev-auto`](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/dev-auto.md) 使用 spec frontmatter 状态驱动单次无人执行：`draft`、`ready-for-dev`、`in-review`、`done`、`blocked` 等状态决定恢复入口。它还记录 `baseline_revision`、`final_revision`、阻塞原因、follow-up review 建议和 append-only review triage log。

对当前架构的启发：

- `change.yaml` 需要让 `pm status` 确定性解析恢复入口。
- `blocked` 不能只是布尔值，至少需要：原因、责任方、恢复条件、最早受影响阶段。
- 实施终态应记录 `baseline_revision` 与 `final_revision`，明确本次运行实际产生的提交范围。
- 评审回环需要计数和上限；超过上限应进入 `blocked/non_converging`，不能无限自动修补。
- review log 应追加而不是覆盖，以便解释为什么回退或接受某项偏差。

#### F. 失败要回到错误进入的层级

BMAD Quick Dev 明确区分 intent gap、bad spec 和 local implementation defect。当前架构的“回到最早受影响阶段”方向与之吻合，实施时应把这套判断做成 Skill 中的明确检查表，而不是让 Agent 临场凭感觉判断。

### 4.3 不建议直接照搬

- 不为第一版安装 BMAD 的完整 Agent/角色体系。
- 不把 PRD、Architecture、Epic、Story 全套文件设为每个 Change 的固定要求。
- 不把 `project-context.md` 变成项目当前状态的汇总副本；当前知识库和工程实现已经是更明确的权威来源。
- 不在第一版启用无人值守 `bmad-loop` 式自动化。先证明人工确认门、恢复和归档正确，再考虑持续编排。
- 不让 persona 或 party mode 成为业务判断的权威来源；它们最多是设计评审技术。

## 5. OpenSpec

### 5.1 当前工作模型

OpenSpec 的核心模型是：

```text
openspec/specs/                 当前行为真相
openspec/changes/<change>/      proposed change 与 delta
openspec/changes/archive/       完成后的历史证据
```

官方 [Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) 将 spec 定义为行为契约，将 change 定义为尚未进入当前真相的修改。归档时 delta 合并进 current specs，原 Change 完整保留。

OpenSpec 1.x 的重要变化是从固定阶段转向 action/artifact 模型：

- artifact 之间有依赖关系。
- 依赖表示“哪些动作现在可做”，而不是规定唯一的线性步骤。
- 默认 OPSX 核心动作是 explore、propose、apply、sync、archive。
- 扩展 profile 增加 new、continue、fast-forward、verify、bulk archive、onboard。
- v1.6 增加 `/opsx:update`，用于在不进入实施的情况下更新并协调已有规划材料。

默认 [`spec-driven/schema.yaml`](https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml) 定义 proposal、specs、design 和 tasks 的依赖与生成材料；项目还可定义自己的 schema。

### 5.2 值得借鉴的机制

#### A. 保留阶段治理，但用 artifact readiness 决定当前动作

OpenSpec 的 “actions, not phases” 对当前架构最有价值的启发不是删除需求、设计、验收门，而是避免把 `phase` 变成唯一执行逻辑。

建议：

- `phase` 继续作为用户可理解的宏观进度和治理边界。
- CLI 根据材料依赖、确认门和阻塞条件计算 `available_actions`。
- 材料可以在需要时更新；更新上游材料会使对应确认和下游结果失效。
- `pm status` 输出“可以做什么”和“为什么不能做其他动作”，而不是只输出阶段名。

这能同时保留当前需求中的确认责任和真实工作的迭代性。

#### B. 当前真相与 proposed delta 分离

OpenSpec 的两目录模型直接支持当前架构对 `knowledge-base/` 与 active Change 的分离。它进一步证明：

- active Change 不应直接改写项目当前知识。
- 提升前应能看到准确 delta。
- 归档必须同时完成“应用 delta”和“保留 Change 证据”。

当前 `knowledge-update.md + knowledge.patch` 比 OpenSpec 的行为 spec 更宽，因为它还覆盖规则和决策；这个扩展是合理的，但应继承它的 delta 冲突保护。

#### C. 归档必须做带前置条件的安全合并

OpenSpec v1.6 修复了一个重要问题：当另一个 Change 已向同一 requirement 增加 scenario 后，过期的 MODIFIED requirement 不能静默覆盖或删除新内容，而应停止归档。

对当前架构的启发：

- `knowledge.patch` 不应只是普通文本补丁。
- 每个目标知识单元需要记录基线 digest 或前置条件。
- `pm knowledge apply` 发现目标在确认后变化时必须拒绝应用，重新生成 delta 并重新确认。
- `pm archive apply` 必须复用与 `validate` 相同的 canonical resolution，不能有两套门逻辑。
- 阻塞必须返回非零退出码，防止脚本把失败当成功。

#### D. artifact schema 与材料集合

OpenSpec 用 schema 描述 artifact ID、依赖、模板和生成规则，与当前 `change.yaml.materials` 方向接近。

第一版建议：

- 将默认材料契约写成内部 schema，驱动 `pm init`、`status`、`validate` 和模板生成。
- 不立即向用户开放自定义 schema；先把默认 schema 做稳定。
- Agent 适配器和命令文件从同一核心 manifest/schema 生成，避免 Codex、Claude 等适配器各复制一套流程。

#### E. 更新规划材料是独立动作

OpenSpec v1.6 的 `/opsx:update` 表明，“修改已有计划并保持相关材料一致”值得成为显式动作。

当前第一版不一定需要增加 `pm update` CLI。更合理的是：

- Skill 定义 `revise` 行为：识别受影响材料、更新内容、使相关确认失效、重新计算 available actions。
- CLI 只提供 `invalidate`、`validate` 和状态计算等确定性原语。
- 等真实使用证明需要一键协调多材料时，再增加高级命令。

#### F. 验证要区分三个维度

OpenSpec 的 [Reviewing Changes](https://github.com/Fission-AI/OpenSpec/blob/main/docs/reviewing-changes.md) 将实施后验证拆为：

- Completeness：任务和需求是否全部覆盖。
- Correctness：实现是否满足需求和场景。
- Coherence：实现是否遵守设计决定。

当前 `delivery/verification.md` 应固定采用这三个维度，再额外加入本项目需要的工程质量证据。这样“测试通过”不会被误当作“需求已满足”。

### 5.3 不建议直接照搬

- 不把 OpenSpec 的 behavior spec 当作完整项目知识；它不覆盖全部事实、规则和决策治理。
- 不照搬默认的单个 `design.md` 和 `tasks.md`，当前材料集合更适合复杂 Change。
- 不完全取消 phase。当前产品明确要求用户随时知道处于什么阶段，并有需求、设计、验收和知识确认责任。
- 不在第一版采用 v1.5 的 Stores；官方仍将其标记为 very early beta。
- 不让 Agent 手工模拟归档 CLI；知识合并和归档应由确定性核心统一执行。

## 6. Superpowers

### 6.1 当前工作模型

Superpowers 是一组可组合的过程 Skills，而不是项目状态数据库。核心链路大致为：

```text
brainstorming
  -> written design/spec
  -> writing-plans
  -> executing-plans 或 subagent-driven-development
  -> review
  -> verification-before-completion
  -> finishing branch
```

它强调：

- 实施前必须先理解意图并让用户批准设计。
- 计划需要细到没有项目上下文的实施者也能执行。
- 每个任务拥有自己的测试和评审闭环。
- Agent 的“完成了”不是证据，必须执行新的验证命令。
- Skills 是行为约束；项目文件和 Git 承载实际设计、计划与代码。

v6.0 重写了 task-scoped review，采用更紧凑的任务 brief、spec compliance + code quality 评审和最终全局 review。v6.1.1 明确 Codex 使用原生 Skill discovery，不再注册 SessionStart Hook。

### 6.2 值得借鉴的机制

#### A. 请求用户确认前先自检

[`brainstorming`](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md) 不只要求用户同意口头设计，还要求：

1. 写入设计文件。
2. 对占位符、矛盾、歧义和范围做自检。
3. 再让用户审阅持久化文件。

对当前架构的启发：每个用户确认门前都增加 AI 自检，但不增加用户门数量：

- 需求：目标、范围、非范围、验收标准、冲突和遗漏。
- 设计：需求覆盖、类型覆盖、权限分类、风险和替代方案。
- 验收：完整性、符合性、设计一致性、工程验证和剩余问题。
- 知识：知识类型、目标位置、长期有效性、是否混入实现细节。

#### B. 计划任务是可独立验证的契约

[`writing-plans`](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md) 要求每个任务足够小，拥有自己的 test cycle，并明确 consumes / produces。

当前 `delivery/tasks.md` 可吸收以下最小任务字段：

- 任务目标。
- 对应 `REQ-*` / `DES-*` / `AC-*`。
- Consumes：依赖的接口、文件或前置任务。
- Produces：输出及供后续任务使用的接口。
- 预计修改范围。
- 验证命令和预期结果。
- 完成状态与证据引用。

不是要求把每个 shell 步骤写成教程，而是保证任务边界足以独立实施、拒绝和验证。

#### C. 证据先于完成声明

[`verification-before-completion`](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md) 的核心是：任何完成、修复或测试通过声明都必须有当前回合实际运行的完整验证证据。

这应进入通用 AI 项目经理 Skill 的硬规则：

- 不接受“之前跑过”“子 Agent 说通过”“应该没问题”。
- 验证命令、退出码、关键输出和时间写入 `delivery/verification.md`。
- 测试通过只证明相应技术断言，不自动证明全部需求满足。
- 最终完成声明必须逐项回看需求和设计，而不是只看测试总数。

#### D. 两层任务评审可以是适配器增强

[`subagent-driven-development`](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md) 对每个任务先做 spec compliance，再做 code quality，最后进行 whole-branch review。这比一个泛化 code review 更容易定位问题属于需求偏差还是实现质量。

当前架构不应把子 Agent 变成核心依赖，但 Codex 适配器可以在能力存在时映射为：

1. 实施者执行单个任务。
2. 独立上下文检查需求/设计符合性。
3. 独立上下文检查代码质量。
4. 所有任务后进行整体 Change review。

不支持子 Agent 的平台由主 Agent 顺序执行相同检查，材料与状态语义不变。

#### E. Skill 应围绕行为职责拆分，而不是 persona

Superpowers v5.1 移除了唯一的 named code-reviewer agent，改用通用 subagent 加自包含 prompt template；v6 又持续把平台措辞改为 vendor-neutral。

这支持当前“逻辑角色不等于固定 Agent”的边界。第一版仍可只有一个通用项目经理 Skill，但内部流程应有清晰职责模块；只有真实使用证明某个模块需要独立触发、独立上下文或独立测试时，才拆成新的 Skill。

#### F. Codex 适配不应依赖 Hook

Superpowers v6.1.1 特别修复了 Codex 意外发现 Claude SessionStart Hook 的问题，并明确 Codex 采用原生 Skill discovery、`hooks: {}`。这直接支持当前架构：

- 核心流程不能依赖 SessionStart Hook 注入。
- Codex 适配器优先使用原生 Skill/Plugin 发现。
- Hook 只做便利性增强，且 manifest 必须显式避免跨平台自动发现。

### 6.3 不建议直接照搬

- 不采用“任何任务都必须同样重的设计流程”作为产品核心；当前架构已经通过风险分类和条件性材料控制深度。
- 不把“每次都必须使用子 Agent”设成核心要求。
- 不让 Skill 的内部 todo 或 `.superpowers/sdd/` scratch 成为 active Change 权威状态。
- 不默认自动更新远端 Skill 内容；受管理流程的核心版本应可锁定、可复现、可升级审查。
- 不把 TDD 固化为所有项目唯一工程方法；项目规则可以要求 TDD，但核心应要求“可验证证据”，而不是绑定一种测试顺序。

## 7. 横向对照

| 关注点 | 当前架构 | BMAD | OpenSpec | Superpowers | 结论 |
| --- | --- | --- | --- | --- | --- |
| 当前真相 | KB + engineering + project contract | project context + planning artifacts + code | specs 是 current truth | 不提供统一真相模型 | 保留当前模型，吸收 OpenSpec delta 安全 |
| active Change | 五项必需材料 + 条件性集合 | spec / PRD / architecture / story 等 | change folder + artifact graph | spec + plan + Git 工作 | 当前模型更完整，不需替换 |
| 流程结构 | 阶段 + 门 + 派生 actions | 分轨阶段 + readiness | actions + dependencies | Skill 链 + hard gates | 阶段用于治理，dependencies 用于可执行动作 |
| 用户确认 | 需求、重大设计、验收、知识 | spec 与最终结果，高风险停机 | 计划 review 与 archive | 设计批准、最终 review | 当前确认责任合理，增加门前自检 |
| 中断恢复 | `change.yaml` + structured blocker/review + next action | frontmatter 状态和终态 | artifact state resolution | 依赖文件/Git，弱状态模型 | 已吸收 blocked/review loop/final revision |
| 回退 | 回到最早受影响阶段 | intent/spec/patch 分层修复 | 更新 artifact，依赖重新解析 | 回到 brainstorm/plan/implementation | 将影响分类写成 Skill 检查表 |
| 验证 | 四维 delivery evidence + user acceptance | readiness + review | completeness/correctness/coherence | evidence before claims | 保持四维验证模型 |
| 多 Agent | 可移植核心 + adapter | 多 Agent/角色和模块 | 多工具命令生成 | 多 harness Skill 映射 | 核心单源生成 adapter，角色保持逻辑化 |
| 自动化 | 第一版不依赖 | bmad-loop/dev-auto | CLI actions | subagent execution | 延后无人编排，先证明有监督闭环 |

## 8. 对当前架构的具体建议

### 8.1 已采纳到架构补强与实现约束

这些建议不推翻已确认架构。I-01 至 I-07 已提升为状态模型、流程门、材料契约或归档安全不变量；I-08 作为可移植核心与适配器的实现约束，由同一核心 manifest/schema 投影平台材料。

#### I-01：状态解析输出 `available_actions`

`pm status` 根据材料依赖、确认门和阻塞条件计算可执行动作，例如：

```yaml
available_actions:
  - revise_design
  - request_design_confirmation
blocked_actions:
  implementation:
    reason: design_gate_not_confirmed
```

`phase` 保留为用户进度视图，不作为唯一流程执行器。采纳时将 `available_actions` 和 `blocked_actions` 定义为 canonical resolver 的派生输出，不写回 `change.yaml`；持久化的 `next_action` 必须属于当前可执行动作。

#### I-02：设计门前增加 readiness assessment

通用 Skill 在进入实施前产生 `PASS / CONCERNS / FAIL` 结论，覆盖：

- 需求与验收标准是否完整。
- 设计是否覆盖所有相关类型。
- 设计决定与需求是否一致。
- 实施任务是否覆盖需求和设计。
- 风险、权限分类和回退条件是否清楚。

CLI 只校验该结论已记录且材料未变化，不替代 AI 判断。

#### I-03：所有确认门前增加 AI 自检

自检写入对应入口材料，不增加新门。用户看到的应是已经过内部检查的候选基线，而不是第一遍生成结果。

#### I-04：统一验证模型

`delivery/verification.md` 至少包含：

1. Completeness：需求、任务、验收标准是否覆盖。
2. Correctness：实际行为是否满足需求和场景。
3. Coherence：实现是否遵守设计决定和长期约束。
4. Engineering quality：测试、静态检查、安全检查和运行证据。

#### I-05：强化 blocked 与 review loop

`change.yaml` 增加或明确：

- `blockers[]` 中的 `reason`、`blocked_by`、`resume_when`、`affected_stage`。
- `review.iteration` 与 `review.max_iterations`。
- `implementation.baseline_revision` 与 `implementation.final_revision`。

超过评审回环上限必须停下请求判断，不能无限自动修复。

#### I-06：定义任务契约

`delivery/tasks.md` 的每个任务包含追溯、Consumes、Produces、修改范围、验证和证据。任务粒度以“能否独立验证和评审”为准，不以文件数量或固定分钟数为准。

#### I-07：知识应用使用三方前置条件

`knowledge.patch` 同时绑定：

- 用户确认的候选知识版本。
- 生成补丁时目标知识单元的 digest。
- 预期应用后的目标 digest。

目标在确认后变化就拒绝应用，重新预览和确认。

#### I-08：适配器从同一核心 manifest 生成

Codex Skill、Plugin manifest、命令入口和未来 Claude Code 适配材料应由核心 manifest/schema 投影，不手工复制流程正文。

### 8.2 建议真实演练后再决定

- 正式的 quick / standard / high-risk 路由字段。
- 将通用项目经理 Skill 拆成 readiness、verification、knowledge promotion 等独立 Skills。
- Codex 子 Agent 两层任务评审。
- project-local custom artifact schema。
- 多 Change 并行与同一知识 topic 的合并协调。
- 可轮询的自动执行器或无人值守 loop。

### 8.3 第一版明确不吸收

- 完整 BMAD persona/Agent/party-mode 体系。
- OpenSpec Stores beta、workspace/initiative 等未稳定抽象。
- Superpowers 的强制 worktree 和强制 TDD 作为跨项目核心规则。
- 依赖 Agent Memory、SessionStart Hook 或子 Agent 才能成立的门。
- 另一份汇总式 project context 作为项目当前状态。
- 自动从远端更新核心 Skill 而不锁版本和审查变化。

## 9. 用“连接钱包登录”验证这些启发

### 9.1 Change 启动

- AI 项目经理读取钱包、身份、安全相关 facts/rules，并登记依赖 digest。
- 根据身份和安全风险，建议走完整设计材料而非最短路径。
- `pm status` 显示需求整理可执行，设计确认和实施尚不可执行。

### 9.2 需求与设计

- 需求自检发现“连接钱包”与“身份登录”不是同一行为。
- `design/README.md` 选择架构、接口、安全和交互四类设计覆盖。
- readiness assessment 检查 nonce、重放、切换账户、会话过期和非范围是否都有需求、设计和任务映射。
- PASS 后才请求用户确认设计集合。

### 9.3 实施

- `delivery/tasks.md` 将钱包连接、nonce、签名验证、会话和账户切换拆成可独立验证任务。
- Codex 有子 Agent 时可执行 task-level spec compliance + quality review；没有时由主 Agent 顺序完成同一检查。
- 每次实施检查点更新 scope digest 和 review iteration，不依赖聊天恢复。

### 9.4 验证与归档

- verification 按 completeness、correctness、coherence、engineering quality 四维输出证据。
- 用户确认交付后，生成知识 delta 和带目标前置 digest 的 patch。
- 如果另一个 Change 已更新钱包安全规则，知识应用停止并重新协调，不能覆盖新规则。
- 最终记录 baseline/final revision、用户确认和知识应用结果后归档。

这个演练说明：最有价值的启发可以进入当前架构的实现细节，不需要把项目改造成 BMAD、OpenSpec 或 Superpowers 的目录和角色体系。

## 10. 建议的下一步

进入实现规划时，建议先把 I-01 至 I-08 转换为：

1. `change.schema.json` 字段和不变量。
2. 通用 AI 项目经理 Skill 的门前自检、readiness、回退和验证协议。
3. `pm status`、`validate`、`confirm`、`knowledge apply`、`archive` 的确定性行为。
4. Codex 适配器的原生 Skill/Plugin 映射。
5. “连接钱包登录”端到端验收用例。

架构基线已吸收派生动作、门前自检、readiness、结构化 blocker、评审收敛、任务契约、四维验证、知识三方前置条件和单源适配器投影。下一步在实现规划中把这些不变量转换为 schema、Skill、CLI、Codex 适配器和端到端验收用例。

## 11. 官方资料

### BMAD Method

- [BMAD Method repository](https://github.com/bmad-code-org/BMAD-METHOD)
- [v6.10.0 release](https://github.com/bmad-code-org/BMAD-METHOD/releases/tag/v6.10.0)
- [v6.9.0 release](https://github.com/bmad-code-org/BMAD-METHOD/releases/tag/v6.9.0)
- [v6.8.0 release](https://github.com/bmad-code-org/BMAD-METHOD/releases/tag/v6.8.0)
- [Workflow Map](https://docs.bmad-method.org/reference/workflow-map/)
- [Getting Started and planning tracks](https://docs.bmad-method.org/tutorials/getting-started/)
- [Autonomous Development Loops](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/reference/dev-auto.md)
- [Quick Dev explanation](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/docs/explanation/quick-dev.md)
- [Implementation readiness Skill](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/3-solutioning/bmad-check-implementation-readiness/SKILL.md)
- [Correct Course Skill](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/src/bmm-skills/4-implementation/bmad-correct-course/SKILL.md)

### OpenSpec

- [OpenSpec repository](https://github.com/Fission-AI/OpenSpec)
- [v1.6.0 release](https://github.com/Fission-AI/OpenSpec/releases/tag/v1.6.0)
- [v1.5.0 release](https://github.com/Fission-AI/OpenSpec/releases/tag/v1.5.0)
- [Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md)
- [Workflows](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md)
- [OPSX](https://github.com/Fission-AI/OpenSpec/blob/main/docs/opsx.md)
- [Reviewing Changes](https://github.com/Fission-AI/OpenSpec/blob/main/docs/reviewing-changes.md)
- [Default spec-driven schema](https://github.com/Fission-AI/OpenSpec/blob/main/schemas/spec-driven/schema.yaml)

### Superpowers

- [Superpowers repository](https://github.com/obra/superpowers)
- [v6.1.1 release](https://github.com/obra/superpowers/releases/tag/v6.1.1)
- [v6.0.0 release](https://github.com/obra/superpowers/releases/tag/v6.0.0)
- [Using Superpowers](https://github.com/obra/superpowers/blob/main/skills/using-superpowers/SKILL.md)
- [Brainstorming](https://github.com/obra/superpowers/blob/main/skills/brainstorming/SKILL.md)
- [Writing Plans](https://github.com/obra/superpowers/blob/main/skills/writing-plans/SKILL.md)
- [Subagent-Driven Development](https://github.com/obra/superpowers/blob/main/skills/subagent-driven-development/SKILL.md)
- [Verification Before Completion](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md)
