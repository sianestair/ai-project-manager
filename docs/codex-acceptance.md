# Codex 第一版真实项目验收

状态：真实项目执行中（需求决策阻塞）

阶段：需求整理与用户决策

- 实施计划：[implementation-plan.md](implementation-plan.md) I-21
- 需求基线：[requirements.md](requirements.md) 第一版成功标准 1～11
- 架构基线：[architecture.md](architecture.md) §11、§12
- Codex 安装入口：[INSTALL.md](../src/adapters/codex/INSTALL.md)
- Codex 能力映射：[capability-map.md](../src/adapters/codex/capability-map.md)

## 1. 验收结论边界

`tests/e2e/wallet-login.test.ts` 证明发布 CLI 的公共状态闭环可以自动运行，但不等于真实业务验收。第一版只有同时满足以下条件，才可把 I-21 和 M6 标记为完成：

1. 用户选定一个真实、可修改、可运行的钱包应用项目作为受管理项目。
2. Codex 从用户原始意图“实现连接钱包登录”开始工作，而不是导入预先确认的夹具结论。
3. 用户分别明确确认需求、重大设计、最终验收和知识提升；Codex 或测试不得代替用户确认。
4. 真实工程实现、当前验证命令、两次中断恢复、一次局部实现回退、知识应用和 archived 终态都有项目文件证据。
5. 新 Change 只依赖提升后的项目当前知识和当前工程，不读取 archived Change 推导现状。

本文件只定义执行与取证方法，不预先确认目标项目的钱包协议、链、会话方案、业务范围或知识结论。

## 2. 当前真实执行记录

| 项目 | 当前证据 |
| --- | --- |
| 目标项目 | `D:\软件项目\vow-up`，用户于 2026-07-16 明确指定 |
| 运行时发布基线 | `my-workflow@2346c35773d54dc91780c26a275b49c5c808d39f` 的 `dist/bin/pm.js` |
| 目标开始 revision | `6a2766416908b347d2b48405d37131af09fe0a07` |
| 目标接入 revision | `6613293882bed994193ec5f0de004365436ae612`，已推送到 `origin/main` |
| 真实 Change | `changes/active/2026-07-16-wallet-login/` |
| 当前规范状态 | `phase=requirements`、`status=blocked`、requirements gate 未确认、需求自检未完成、唯一 available action 为用户 `resolve_blocker` |
| 依赖恢复 | 3 个 knowledge 与 4 个 engineering dependency digest 均为 `current`；提交后工作区无变更，`pm validate.valid=true`，无 error/warning |
| 当前 blocker | 产品入口、登录语义、与既有 Web DApp Change 的关系，以及 VowUp 当前知识权威路径与第一版固定知识应用路径的兼容方案 |
| 尚未满足 | 四类用户确认、两次规定中断、真实实现与验证、知识原子应用、归档、新 Change 权威检查、Codex 插件真实安装与唯一 Skill 发现 |

目标项目采用既有 `knowledge-base/project/` 当前真相权威和 legacy Change 工件。接入只增加 `PROJECT.yaml`，并明确含 `change.yaml` 的新式 Change 与既有 Change 双轨共存；没有运行 `pm init` 覆盖现有 `AGENTS.md`、知识规则或 legacy 工件。

本次已经证明真实目标选择、原始意图捕获、依赖摘要、规范 blocker、提交后恢复和 expected-failure 门可以工作；它尚未满足 I-21 或 M6 完成门。

## 3. 执行前提

- 使用当前提交重新运行 `pnpm run verify`，只消费重新生成的完整 `dist/`。
- 按发布单元内 `adapters/codex/INSTALL.md` 安装本地 Codex 插件，并确认只发现一个 `ai-project-manager` Skill。
- 在用户选定的目标项目中确认 Node.js 24 可用；目标项目不依赖本仓库根目录、`src/` 或本仓库 `node_modules`。
- 记录目标项目绝对路径、开始 revision、业务运行入口、测试入口和验收环境。
- 如果目标项目尚未采用目录契约，使用发布 CLI 执行 `pm init`；不得把本运行时仓库本身当成钱包业务项目来满足真实验收。

## 4. 必须执行的真实流程

### 4.1 原始意图与需求门

1. 用户只给出“实现连接钱包登录”。
2. Codex 运行 `pm change start <id> --title "连接钱包登录" --project <root> --json`。
3. 在需求整理前运行 `pm status`，保存需求未确认、实施被阻塞的输出。
4. Codex读取项目当前知识和相关工程，登记实际读取的 knowledge/engineering dependency digest。
5. Codex识别“连接钱包”和“建立登录会话”的差异，整理目标、范围、非范围、约束、`REQ-*` 与 `AC-*`，完成需求门前自检。
6. 用户审阅并明确确认后，才执行 `pm confirm requirements`；保存确认 revision、材料 digest、摘要和确认依据。

需求确认必须以目标项目实际情况为准。不得直接复制架构演练中的 SIWE、Cookie、链或钱包范围作为已确认业务决定。

### 4.2 设计、readiness 与第一次中断

1. Codex形成覆盖全部 `REQ-*`/`AC-*` 的 `DES-*`、七类设计适用性声明和完整 `TASK-*` 契约。
2. 身份、安全、隐私、权限和会话边界属于重大设计，设计确认责任必须为 `user`。
3. Codex完成 readiness 评估，并把 `assessed_artifacts` 绑定当前 requirements、design 和 delivery task 材料。
4. 在设计确认前主动结束当前 Codex 任务，不执行确认。
5. 新建 Codex 任务，只读取 `AGENTS.md`、`PROJECT.yaml`、相关当前知识/工程、active Change 文件，并重新运行 `pm status` 与 `pm validate`。
6. 恢复结果必须仍为 design 阶段、requirements gate 有效、design confirmation 由用户负责、输入和 digest 与中断前一致。
7. 用户明确确认重大设计后，才执行 `pm confirm design`。

### 4.3 实施、回退与第二次中断

1. Codex在已确认边界内实施任务，记录 baseline revision、实际 engineering dependencies 和 checkpoint digest。
2. 主动引入或选择一个真实发现的局部实现问题；确认它不改变需求或重大设计后，执行 `pm invalidate implementation --reason <reason>`。
3. 回退结果必须保留 requirements/design 确认与 baseline，清除下游验收/知识有效性，并推荐 `continue_implementation`。
4. 修复问题、更新任务和 checkpoint，然后在实现尚未完成时主动结束第二个 Codex 任务。
5. 新建 Codex 任务，仅凭项目文件和 CLI 恢复；必须得到 implementation 阶段、fresh checkpoint、当前任务、验证入口与继续条件。

### 4.4 四维验证与用户验收

1. 所有 `TASK-*` 完成，并为 completeness、correctness、coherence、engineering quality 分别记录当前 `EVID-*`。
2. 每项证据绑定相同的 baseline/final revision 和当前 checkpoint digest，执行时间晚于 checkpoint。
3. 钱包业务至少验证成功、拒签、nonce 重放、账户切换、断开连接、会话过期，以及目标项目确认的其他 `AC-*`。
4. 最终 delivery 材料改变后，重新评估并绑定当前 readiness artifacts。
5. `pm validate` 必须显示 `verification.ready_for_acceptance: true`，再由用户亲自在目标验收环境检查结果。
6. 用户明确接受交付后，才执行 `pm confirm acceptance`。

### 4.5 知识确认、原子应用与归档

1. Codex只整理长期有效的 fact、rule、decision 候选，排除可由代码直接读取的短期实现细节。
2. 运行 `pm knowledge preview`，向用户展示纳入项、排除项、精确 post-image、candidate digest、patch digest 和各目标 before/after digest。
3. 用户明确确认精确知识包后，才执行 `pm confirm knowledge` 和 `pm knowledge apply`。
4. 知识应用必须全部成功或零目标改变；本 Change 自己替换/删除的已登记知识依赖应与确认后的 post-image 自动一致。
5. `pm archive check` 通过后执行 `pm archive apply`；随后 `pm validate <archived-id>` 必须成功，active 路径必须消失，archived 只提供 `inspect_archive`。

### 4.6 新 Change 的状态权威检查

1. 从提升后的当前知识与当前工程启动另一个新 Change，并登记实际读取的当前依赖。
2. 不读取前一个 archived Change，确认 `pm status` 能独立形成新工作的初始状态。
3. archived 内容变化不得改变新 Change 的 canonical state；已登记的当前知识变化必须产生 dependency drift 和重新评估条件。

## 5. 验收证据包

证据保存在真实目标项目的标准材料中，不在 Codex 专用目录复制第二份业务正文。最终报告至少引用：

| 证据 | 必须可核对的结果 |
| --- | --- |
| 发布基线 | 本仓库 commit、`pnpm run verify` 结果、实际使用的 `dist/` 版本 |
| Codex 发现 | 本地 marketplace、plugin 和唯一 Skill 的发现结果 |
| 需求门 | requirements revision、用户确认摘要、材料 digest |
| 第一次恢复 | 新 Codex 任务中的 phase、有效上游 gate、确认 owner、recovery inputs |
| 设计门 | design revision、用户确认的重大取舍与材料 digest |
| 回退 | invalidate reason、保留的上游 gate、恢复动作 |
| 第二次恢复 | fresh checkpoint、当前任务、baseline 和继续条件 |
| 四维验证 | 四类当前证据、命令/环境/时间/结果、baseline/final/checkpoint |
| 验收门 | 用户实际检查结果、acceptance revision、delivery digest |
| 知识门 | 纳入/排除项、三方 digest、用户确认 revision、原子应用结果 |
| 归档 | archive check、archived 路径、终态引用、archived validate |
| 权威边界 | 新 Change 不依赖 archive；当前知识漂移可被 resolver 检出 |

## 6. 完成判定

若缺少真实目标项目、任一用户确认、任一中断恢复、真实业务验证、知识原子应用或 archived 终态，I-21 与 M6 均不得标记完成；尚未启动时记为“待真实项目执行”，已经启动但未闭环时记为“真实项目执行中”并明确当前阶段和 blocker。结构测试、自动 E2E、Codex 插件可发现性和 AI 自述均不能单独替代真实验收。
