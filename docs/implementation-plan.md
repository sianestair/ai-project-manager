# AI 项目经理：第一版实现计划

状态：第一版实现计划（已确认）
阶段：实现
日期：2026-07-14
需求基线：[requirements.md](requirements.md)
架构基线：[architecture.md](architecture.md)
Agent 支持依据：[agent-support-research.md](agent-support-research.md)
方法调研依据：[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md)
第一阶段目标平台：Codex

实施进度：Slice 1（I-01～I-06）和 Slice 2（I-07～I-09）均已完成并验证；Vite+、`src/`、单一自包含 `dist/`、CAC 命令目录、确认材料 digest、readiness 新鲜度与 `pm confirm` 已形成可运行基线；下一切片为 blocker、回退与评审收敛。

## 1. 计划目标与不可变边界

本计划把已确认的需求与架构转换为可执行的实现任务。它不重新讨论或改变以下基线：

1. 受管理项目的固定目录契约是 `knowledge-base/`、`engineering/`、`changes/active/` 和 `changes/archived/`，根入口是 `AGENTS.md` 与 `PROJECT.yaml`。
2. 项目文件是项目当前状态与 Change 状态的唯一权威来源；聊天、Memory、任务 UI、Hook 和子 Agent 不是权威状态。
3. `change.yaml` 是 active Change 唯一的机器可读业务状态文件；Markdown 材料保存可评审正文与证据。
4. 项目当前状态、active Change 状态和 archived Change 历史证据严格分离，新工作不从 archived Change 重建现状。
5. 需求、重大设计、最终验收和知识提升由用户确认；AI 项目经理在已确认边界内自主推进局部、可逆实现选择。
6. CLI 只做确定性读取、校验、摘要、状态门、事务和文件操作，不判断需求是否正确、设计是否合理或用户是否真正同意。
7. `phase` 表示宏观治理阶段；`available_actions` 与 `blocked_actions` 由 canonical state resolver 实时派生，不持久化为第二份状态。
8. 第一版只有一个通用 `ai-project-manager` Skill、一个 Agent 无关 CLI 和一个 Codex 适配器。
9. 知识提升必须同时满足候选 digest、补丁 digest、目标 `before_digest` 和预期 `after_digest`，并以不可部分成功的方式应用。
10. 本文既是实施顺序基线，也是当前实现进度与验证门的记录；实现不得越过尚未进入的切片提前扩张范围。

实现任务中的“语义评估”是 AI 项目经理按照通用 Skill 执行并写入标准材料的职责；“确定性验证”是运行时对字段、引用、摘要和状态不变量的检查。两者不得互相替代。

## 2. 推荐技术方案

### 2.1 技术栈结论

| 方面 | 第一版推荐 | 选择依据 | 长期约束 |
| --- | --- | --- | --- |
| 运行时 | Node.js 24 LTS；开发基线固定到当前 24.x 安全补丁，`engines.node` 限定在 24 LTS 线 | Node.js 官方建议生产应用使用 LTS；截至本文日期，24 是 LTS，26 仍是 Current。文件、进程、加密、测试和跨平台路径能力足以覆盖 CLI | 支持期内跟随 24.x 安全补丁；升级 Node major 必须跑完公共一致性与 Codex E2E，不在依赖中偷偷抬高最低版本 |
| 语言 | TypeScript 7.x，精确版本锁定；`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` | 状态模型、门不变量、事务结果和错误类型需要静态约束；TypeScript 7 已发布稳定版 | 不依赖 TypeScript 编译器 API；schema 是外部文件契约，TS 类型不能成为第二份权威 schema |
| 模块系统 | 原生 ESM，`package.json.type = module`；Node 模块解析；不发布 CommonJS 双包 | CLI 与 pnpm 11 都可使用原生 ESM；单一模块格式减少双包分歧 | 第一版公开入口是 `pm` CLI，不承诺可供外部代码导入的稳定 JS API |
| 依赖管理 | Vite+ 作为统一工具链入口；底层包管理固定 pnpm 11.x，精确版本写入 `packageManager`，提交 `pnpm-lock.yaml` | `vp install` 复用已锁定的包管理器和 lockfile；构建、检查、测试与打包不再各维护一套零散入口 | Vite+ 与 pnpm 升级必须是显式变更；第一版仍是单包源码仓库和单一发布单元，不预建多包 workspace |
| 构建 | Vite+ `vp pack`，底层 tsdown/Rolldown；从 `src/core/runtime/cli/main.ts` 构建 Node 24 ESM bundle 到 `dist/bin/pm.js` | CLI 消费者不需要源码、TypeScript loader 或第三方 `node_modules`；构建依赖图只内联入口实际可达代码 | Node 内置模块保持 external；所有第三方运行依赖必须显式进入 bundle；不生成 standalone executable |
| 发布 | `dist/` 是第一版唯一、完整、自包含发布单元；`npm pack ./dist` 只是一种封装方式；Codex 适配器属于同一 `dist/`，不是独立产品 | 发布和验收只消费 `dist/`，不会回到仓库根或 `src/` 找文件；同一发布物携带 CLI、schema、manifest、Skill 与适配器 | `dist/` 必须完全可重建且不手工维护；不依赖公开 registry；不得包含测试、源码、构建配置或未使用依赖 |
| 测试 | Vite+ `vp test`（Vitest）运行单元测试；CLI 与发布验收继续使用真实子进程和仓库外临时目录 | 纯函数获得快速反馈，发布测试仍覆盖真实 `dist/bin/pm.js`，不把内部 mock 当作完成证据 | 完成声明只接受新近执行的检查、测试、bundle 和独立发布目录证据 |
| CLI 框架 | CAC 7 只用于命令注册、argv 解析、参数校验与帮助生成；命令入口按 `commands/<command>/index.ts` 组织 | 后续 confirm、invalidate、blocker、knowledge、archive 会持续扩展命令面；集中 switch 与手写帮助不再适合作为稳定入口 | CAC 只能存在于 CLI 边界；command action 只做输入适配、operation 调用和输出，不承担状态门或业务判断 |
| 运行时依赖 | `yaml` 解析/写入 YAML；`ajv` 校验 JSON Schema；`cac` 组织 CLI；构建时按入口依赖图将实际使用代码和传递依赖内联到 `pm.js` | YAML、JSON Schema 与 CLI 都是已确认发布入口的组成部分；自包含 bundle 避免假设目标 Agent 已安装依赖或能访问 registry | 发布 `package.json` 不声明第三方运行依赖；新增裸模块 import 必须在构建或发布检查中失败；Node 24 是唯一外部运行时 |
| 质量检查 | Vite+ 统一提供 `vp check`、`vp test`、`vp pack`；综合发布门由 `vp run verify` 串联发布内容和独立运行检查 | 类型、格式、lint、行为和发布内容共用一套本地/CI 入口 | 不为 Codex 维护第二套验证逻辑；构建工具配置不能改变核心状态语义 |

版本依据：

- [Node.js Releases](https://nodejs.org/en/about/previous-releases) 说明生产应用应使用 Active LTS 或 Maintenance LTS，并列出 Node 24 为 LTS。
- [Node.js 24 LTS announcement](https://nodejs.org/en/blog/release/v24.11.0) 说明 24.x 的 LTS 支持持续到 2028 年 4 月。
- [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) 是本文日期下的稳定版本依据；[TypeScript strict](https://www.typescriptlang.org/docs/handbook/2/basic-types.html) 建议新代码启用严格检查。
- [pnpm installation and compatibility](https://pnpm.io/installation) 说明 pnpm 11 需要 Node 22 及以上并支持 Node 24，且可用 `packageManager` 固定项目版本。
- [Vite+ Pack](https://viteplus.dev/guide/pack) 说明 `vp pack` 使用 tsdown 构建可发布 package 与 Node CLI；[tsdown dependency handling](https://tsdown.dev/options/dependencies) 说明普通 `dependencies` 默认 external，必须显式配置需要内联的运行依赖。

### 2.2 为什么选择 Node.js + TypeScript

1. 核心只能假设 Agent 能读写文件和运行命令。Node.js 在 Codex、未来 Claude Code、Copilot、Gemini CLI、OpenCode 和主要 IDE Agent 环境中都属于低摩擦公共运行时。
2. 第一版的大部分复杂度是“有类型的状态变换”，不是高吞吐服务。TypeScript 能直接表达阶段、门、readiness、blocker、review、transaction 和 resolver result 的封闭联合类型。
3. Node 标准库提供跨平台文件、SHA-256、原子 rename、子进程和内置测试，适合实现无服务、文件优先的确定性 CLI。
4. 编译后 JavaScript 与 Agent 平台解耦；Codex 适配器只负责安装、入口和能力映射，不需要重新实现业务状态逻辑。
5. 与 Python 相比，Node 的 npm 包和 `bin` 安装更适合交付同一个 CLI 与静态 Skill/adapter 资产；与 Rust/Go 相比，第一版无需承担跨平台二进制矩阵和 schema/Markdown 生态重建成本。

### 2.3 编译、运行和打包契约

计划中的发布流为：

~~~text
src/core/runtime/cli/main.ts
  -> vp pack / tsdown / Rolldown
  -> dist/bin/pm.js（内联实际使用的第三方运行依赖）
src/core/{manifest,schemas,skills} + src/adapters/codex
  -> 受构建配置控制的校验、投影与复制
  -> dist/ 完整发布树 + 生成的 dist/package.json
  -> package-content test
  -> 把 dist/ 复制到仓库外且无 node_modules 的临时目录
  -> 直接运行 pm --version / pm init / pm change start / pm status / pm validate
  -> npm pack ./dist 后重复发布入口检查
~~~

约束如下：

- 不使用 `tsx`、`ts-node` 或自定义 loader 作为产品运行方式。
- Agent 无关运行时代码和实际使用的第三方依赖构建为一个未压缩 ESM bundle；schema、Skill、manifest 和适配器安装资产保持可检查的独立文件。
- `src/core/manifest.yaml` 是发布版本、公共资产与适配器投影的单一清单，不是 Change 状态，也不包含业务项目知识；构建后位于 `dist/core/manifest.yaml`。
- `dist/` 是唯一发布边界，不能依赖仓库根 `package.json`、`src/`、开发配置或 `node_modules`；构建开始前必须完整清空。
- 不生成 `.d.ts`、`.d.ts.map` 或 standalone executable；第一版 bundle 不压缩，也不生成 source map。
- 发布测试必须验证 `dist/` 与 tarball 中没有测试夹具、临时事务、用户项目数据、旧实现资产或第三方裸模块 import。
- 第一版只承诺 Node 驱动的 `pm` CLI；未来若需要 standalone executable，应作为新的长期技术决定，不改变核心状态语义。

### 2.4 直接采用的局部、可逆选择

以下选择不改变产品边界，实施时直接采用：

- 使用稳定 action ID，例如 `draft_requirements`、`assess_readiness`、`apply_knowledge`；`pm status` 另行渲染人类可读说明。
- 命令默认输出人类可读文本，并统一支持 `--json` 供测试与 Agent 稳定消费。
- 时间、Git、文件系统和随机临时名通过小型 port 注入，纯状态推导不得直接读取系统时钟或进程全局状态。
- YAML 写回采用固定字段顺序，避免无意义重排；Markdown 摘要只规范 UTF-8 BOM 和 CRLF/LF，不吞掉正文空白差异。
- 受管理路径统一转为项目根相对的 POSIX 风格路径写入状态，运行时再映射到当前操作系统路径。
- CLI 使用 CAC 7；`main.ts` 只保留启动与顶层错误边界，`create-cli.ts` 组装 CLI，`commands/<command>/index.ts` 分别注册命令并调用核心实现。

### 2.5 已确认的长期技术决定

这些决定不重新打开需求、受管理项目目录契约、状态权威或确认责任，但形成长期安装、发布或持久化兼容边界，均已由用户确认：

| ID | 确认方案 | 长期影响 | 实施约束 |
| --- | --- | --- | --- |
| LT-01 | 第一版最低运行时固定为 Node 24 LTS，不提供免 Node 的单文件可执行程序 | 受管理项目和 Codex 环境必须安装兼容 Node | 发布验收只把 Node 24 视为外部运行时；Vite+ experimental executable 不进入第一版 |
| LT-02 | 第一版稳定编程接口只有 `pm` CLI 与项目文件契约，不承诺外部可导入的 JS library API | 不扩大模块拆分、错误类型和 semver 责任 | 发布包只声明 `bin.pm`；不生成 `.d.ts` 或 library exports |
| LT-03 | `knowledge.patch` 使用版本化 JSON envelope，保存有序目标操作、before/after digest 和精确 post-image；人类说明仍在 `knowledge-update.md` | 该格式随 archived Change 长期保存 | 知识模块必须在该 envelope 上实现预览、确认和冲突保护 |
| LT-04 | 第一版原子保证限定在同一台机器、同一项目文件系统；网络盘和跨设备 rename 不宣称已支持 | 多文件事务和归档 rename 的故障语义依赖文件系统边界 | 原子应用与归档只在已验证的本地同文件系统路径执行 |
| LT-05 | Vite+ 统一开发工具链；`src/` 是唯一源码树，`dist/` 是包含核心与 Codex 适配器的唯一完整发布单元 | 构建输出布局、离线可运行性和适配器随包交付成为发布契约 | 运行依赖按入口 bundle；发布只消费 `dist/`；Codex 适配器不形成第二产品或第二套核心语义 |

TypeScript、Vite+、pnpm 的具体 patch 版本和 `src/` 内的文件拆分属于局部、可逆选择，由实现任务锁定并通过 lockfile 与发布测试记录，不需要逐项请求用户确认。

## 3. 目标源码布局

下面是实现阶段预计形成的源码布局，不是受管理项目的目录契约：

~~~text
package.json                  # 私有开发工具链 manifest
pnpm-lock.yaml
tsconfig.json
vite.config.ts
scripts/
  verify-release.mjs
src/
  core/
    manifest.yaml
    schemas/
      project.schema.json
      change.schema.json
    skills/
      ai-project-manager/
        SKILL.md
    runtime/
      cli/
        main.ts
        create-cli.ts
        output.ts
        errors.ts
        commands/
          init/index.ts
          change/start/index.ts
          status/index.ts
          validate/index.ts
          confirm/index.ts
      project/
        discover.ts
        init.ts
        change-start.ts
        git.ts
      materials/
        paths.ts
        sets.ts
        markdown-contract.ts
        digest.ts
      state/
        types.ts
        resolver.ts
        actions.ts
        invariants.ts
      governance/
        artifacts.ts
        confirmations.ts
        readiness.ts
        self-checks.ts
        blockers.ts
        review.ts
        invalidation.ts
      operations/
        confirm.ts
        validate.ts
        knowledge-preview.ts
        knowledge-apply.ts
        archive.ts
        transaction.ts
      templates/
        ...
  adapters/
    codex/
      templates/
        ...
      capability-map.md
      build.ts
tests/
  unit/
  integration/
  gates/
  recovery/
  knowledge/
  e2e/
  fixtures/
~~~

构建结果固定为：

~~~text
dist/
  package.json
  bin/
    pm.js
  core/
    manifest.yaml
    schemas/
      project.schema.json
      change.schema.json
    skills/
      ai-project-manager/
        SKILL.md
  adapters/
    codex/
      ... 由核心资产与 Codex 模板生成的安装材料
~~~

第一版仍是一个发布单元。`src/core/` 与 `src/adapters/codex/` 表达职责和依赖边界，不代表建立多个 npm package、多个 Skill、多个产品或多个运行服务；构建后的核心与 Codex 适配器共同进入同一个 `dist/`。

## 4. 模块职责与禁止判断

| 模块 | 职责 | Consumes | Produces | 依赖 | 禁止承担的业务判断 |
| --- | --- | --- | --- | --- | --- |
| `src/core/manifest.yaml` | 声明核心版本、schema、Skill、CLI 入口、模板和适配器投影资产 | 仓库内公共资产路径与版本 | `dist/core/manifest.yaml` 与构建/适配器生成的单一资产清单 | 无运行时模块 | 不描述某个项目或 Change，不决定流程阶段，不复制 Skill 正文 |
| project schema | 校验 `PROJECT.yaml` 的契约版本与项目身份 | 解析后的 YAML | schema errors 或已验证 ProjectConfig | Ajv | 不判断项目名称是否“合适”，不保存当前阶段或当前 Change |
| change schema | 校验 `change.yaml` 的字段、枚举、基本结构与版本 | 解析后的 YAML | schema errors 或已验证 ChangeState | Ajv | 不判断需求、设计、证据或确认是否正确 |
| project discovery | 定位项目根、Git revision、active Change 与固定目录 | cwd、显式 `--project`/change id、文件系统 | ProjectPaths、GitSnapshot、ChangeLocation | path/fs ports | 不根据 archived Change 或聊天猜测当前状态；多个 Change 时不自动合并 |
| material set resolver | 展开 required/included，核对 README 索引与路径安全 | ChangeState、Change 目录、Markdown 索引 | 规范化 MaterialSet、缺失/多余/越界错误 | paths、Markdown contract parser | 不判断材料内容质量，不自动把未登记文件加入确认集合 |
| digest engine | 计算文件、材料集合、工程范围和补丁摘要 | 规范化路径与内容 | SHA-256 digest、范围清单、drift facts | crypto、Git/file walker | 不证明内容正确，不把无关整体目录变化当成自动门 |
| canonical resolver | 汇总 schema、材料、digest、门、readiness、blocker、review、revision 和事务恢复事实 | ProjectSnapshot、ChangeState、当前文件 | ResolvedChangeState、diagnostics、recovery facts | 前述纯模块 | 不选择方案、不推断用户确认、不修改文件 |
| action derivation | 从 resolved facts 推导可执行与受阻动作 | ResolvedChangeState | available/blocked action objects | resolver types、rule table | 不替 AI 项目经理选择推荐动作；只校验 `next_action` 是否可执行 |
| readiness validator | 校验 AI 已记录的 readiness 结构、材料绑定和 concern 处置状态 | readiness record、当前材料 digest | pass/concerns/fail/stale 的机械有效性 | material/digest、schema | 不自行做语义 readiness review，不把文件齐全等同于 PASS |
| blocker/review invariants | 校验 blocker 必填字段、状态联动、迭代上限和 revision | ChangeState、resolved review facts | diagnostics、allowed recovery actions | state rules | 不判断某个缺陷是否应接受，不自动延长 `max_iterations` |
| confirmation operation | 在明确调用元数据存在时绑定当前材料集合摘要并追加 revision | gate、confirmed_by、summary、evidence、resolved state | 新 confirmation、phase/next action/history 更新 | resolver、digest、atomic YAML write | 不根据沉默、对话继续或测试通过推断确认；不替用户确认需求/验收/知识 |
| invalidation operation | 按调用者给出的最早受影响阶段失效当前及下游门并保留历史 | stage、reason、resolved state | invalidated confirmations、回退后的 phase/next action/history | state dependency map | 不判断最早受影响阶段；不得删除代码、材料或旧确认记录 |
| knowledge preview | 把已整理候选转换为版本化精确载荷并计算三方 digest | `knowledge-update.md`、目标知识文件、候选选择 | `knowledge.patch`、预览、targets | path safety、digest | 不决定哪些内容是长期知识，不替用户确认候选 |
| transaction/knowledge apply | 预检全部目标，暂存 post-image，故障恢复，全部提交或全部回滚，再验证 after digest | 已确认 patch、目标 current state | 应用结果、transaction evidence、applied_files | resolver、digest、atomic fs ops | 不合并冲突、不使用 `--force`、不在 before mismatch 时“尽量应用” |
| archive operation | 复用 resolver 检查终态，写入终态引用并同文件系统移动完整目录 | archive-ready Change、Git/knowledge result | archived snapshot、非零失败或成功结果 | resolver、transaction | 不增加重复用户确认，不读取 archived Change 反推当前知识 |
| CLI/presentation | 解析命令、映射 exit code、渲染 human/JSON 输出 | argv、runtime services | stdout/stderr/exit code | 所有 operation ports | 不包含第二套门逻辑，不因 human 输出便利改变 resolver 结论 |
| 通用 Skill | 指导 AI 项目经理进行需求、设计、readiness、自检、权限、回退、任务、四维验证、知识与恢复 | 项目当前状态、resolved status、用户意图 | 标准材料修改、明确确认请求、CLI 调用 | 公共文件与 CLI | 不把内部 todo、子 Agent 输出或会话当权威；不绕过确认责任 |
| Codex 适配器 | 安装/发现通用 Skill，提供稳定入口、能力映射与 Codex E2E | core manifest、通用 Skill、编译后 CLI | Codex plugin/安装资产、capability evidence | 适配器生成器 | 不复制核心流程正文，不使 Hook/Memory/子 Agent 成为正确性前提 |
| tests/fixtures | 固定输入、期望状态、故障注入和真实验收脚本 | schema、CLI、Skill、adapter artifact | 可重复证据与回归保护 | 编译后产物 | 不把 fixture 的钱包设计当成真实业务项目已确认设计 |

## 5. 关键确定性契约

### 5.1 canonical resolver 单向管线

所有读命令和写命令必须先运行同一条解析管线：

~~~text
discover project
  -> validate PROJECT.yaml
  -> locate active Change
  -> validate change.yaml
  -> resolve required/included material sets
  -> compute current digests
  -> evaluate confirmation validity
  -> evaluate readiness freshness
  -> evaluate dependency/checkpoint drift
  -> evaluate blockers/review/revisions/transaction recovery
  -> derive available_actions and blocked_actions
  -> validate persisted next_action
  -> return one ResolvedChangeState
~~~

`pm status`、`pm validate`、`pm confirm`、`pm knowledge apply` 和 `pm archive apply` 不得各自重新实现其中任何一段门判断。写命令只在 resolver 给出的动作可执行时构造一个新的合法状态，再以原子写方式落盘。

### 5.2 resolver 输出

机器输出至少包含：

- project root、project id、schema version。
- change id、phase、status、当前目标摘要入口。
- 已确认且仍有效的门，以及失效原因。
- material set 文件清单和当前 digest。
- readiness 状态、fresh/stale 结论与 concerns。
- blocker、review iteration、baseline/final revision 和 checkpoint drift。
- available actions、blocked actions、推荐 next action 的合法性。
- 需要读取的最小输入和恢复条件。
- diagnostics，分为 error、warning 和 information。

resolver 结果是内存中的派生视图，不写成新的项目状态文件。

### 5.3 digest 与路径规则

1. Change 内 Markdown、YAML、JSON 与 `knowledge.patch` 按 UTF-8 读取；去除 BOM、把 CRLF 规范为 LF 后计算 SHA-256，其他字符与尾部空白保持敏感。
2. material set digest 不是把多个文件内容简单拼接，而是对按 POSIX 相对路径排序的 `path + file_digest` 清单计算摘要；新增、删除、改名或改内容都会变化。
3. 工程目录 digest 优先使用 Git 的 tracked + untracked but not ignored 文件清单；无 Git 时使用固定、安全的文件遍历策略，并排除 VCS 元数据、包缓存和运行时事务临时文件。
4. 所有状态路径必须是项目根内的规范相对路径；拒绝 `..`、绝对路径、越界 symlink 和大小写冲突。
5. `absent` 是新建/删除知识目标的显式前置状态，不用空文件 digest 代替不存在。
6. digest 只证明版本相同。业务正确性、用户确认和 Git 历史仍由各自机制负责。

### 5.4 action 规则

第一版 action ID 是内置固定集合，至少覆盖：

- `draft_requirements`、`revise_requirements`、`request_requirements_confirmation`、`confirm_requirements`。
- `draft_design`、`revise_design`、`assess_readiness`、`request_design_confirmation`、`confirm_design`。
- `start_implementation`、`continue_implementation`、`review_task`、`review_change`、`prepare_acceptance`。
- `request_acceptance_confirmation`、`confirm_acceptance`、`draft_knowledge_update`、`preview_knowledge`。
- `request_knowledge_confirmation`、`confirm_knowledge`、`apply_knowledge`、`check_archive`、`archive`。
- `record_blocker`、`resolve_blocker`、`invalidate_requirements`、`invalidate_design`、`reassess_dependency_drift`、`recover_transaction`。

available action 是“当前安全且前置条件满足”；blocked action 必须带精确原因、责任方和恢复条件。`pending` 门本身不是 blocker。持久化 `next_action` 只能引用一个当前 available action；由 AI 项目经理选择哪一个最值得推荐。

### 5.5 写入与事务规则

- 单文件 YAML 更新采用同目录临时文件、flush、rename 替换，并保留稳定字段顺序。
- 知识多目标应用先验证全部 before digest，再暂存全部 post-image；事务日志只记录机械恢复所需步骤，不记录业务状态。
- 事务中断后，任何普通写命令先拒绝并要求 `recover_transaction`；恢复只能完成已确认载荷或回滚到全部 before-image，不能产生第三种内容。
- 事务临时目录使用保留前缀并从材料发现和 digest 遍历中排除；完成后必须删除。
- 归档只允许 active 与 archived 位于同一项目文件系统，并使用目录 rename。若目标已存在、跨设备或终态写入失败，保持 active Change 可恢复并返回非零退出码。
- 不提供 `--force` 跳过确认、冲突、readiness、blocker、知识或归档门。

### 5.6 CLI 退出语义

| Exit code | 含义 |
| --- | --- |
| 0 | 命令成功，或 validate/status 没有阻止当前请求的错误 |
| 2 | CLI 用法、参数或目标选择错误 |
| 3 | schema、材料、引用或状态不变量错误 |
| 4 | 动作被预期状态门阻止；JSON 输出必须列出 blocked reason |
| 5 | digest、知识目标、工作区或事务冲突 |
| 6 | 文件系统、Git 子进程或内部未分类失败 |

具体数字是局部实现选择，但一经第一版发布就进入 CLI 兼容契约；测试必须锁定。

## 6. 分阶段实施顺序

### Slice 1：最小纵向切片

目标是最早形成一个真实可运行但治理能力有限的闭环：

~~~text
pm init
  -> pm change start <id>
  -> pm status <id>
  -> pm validate <id>
~~~

这个切片只证明项目初始化、Change 创建、项目文件恢复、schema 和基础状态解析正确。它不提前实现确认、readiness、知识应用或归档。

#### I-01 工具链、包与核心 manifest

- **目标**：建立 Node.js + TypeScript + Vite+ 的可检查、可测试、可打包骨架，并让 `src/core/manifest.yaml` 成为公共资产单一清单、`dist/` 成为唯一自包含发布单元。
- **Consumes**：本文第 2 节技术选择；架构建议源码布局与单源投影约束。
- **Produces**：私有开发 `package.json`、lockfile、TypeScript/Vite+ 配置、check/test/pack/verify 入口、`src/core/manifest.yaml`、自包含 `dist/` 和最小 CLI version 入口。
- **预计修改范围**：仓库根配置、`vite.config.ts`、`scripts/`、`src/core/manifest.yaml`、`src/core/runtime/cli/`、发布内容测试。
- **依赖任务**：LT-01、LT-02、LT-05 确认；无代码任务依赖。
- **验证方法与预期结果**：`vp run verify` 通过；仓库外无 `node_modules` 时可直接运行 `dist/bin/pm.js`；`npm pack ./dist` 只含允许资产；`pm --version` 返回核心版本且不读取源码路径。
- **依据**：[requirements.md](requirements.md) R8、R9；[architecture.md](architecture.md) §9、§10.2、§10.3、已确认基线 9/10；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-08。

#### I-02 project/change schemas 与类型边界

- **目标**：把 `PROJECT.yaml` 和 `change.yaml` 第一版结构、枚举与基础必填项固化为 JSON Schema，并建立 schema 验证后的内部类型边界。
- **Consumes**：架构 §4.1、§4.2 的完整模型和枚举；`src/core/manifest.yaml`。
- **Produces**：`project.schema.json`、`change.schema.json`、Ajv validator、schema fixtures、合法/非法样例。
- **预计修改范围**：`src/core/schemas/`、`src/core/runtime/state/types.ts`、`invariants.ts`、`tests/unit/schemas/`。
- **依赖任务**：I-01。
- **验证方法与预期结果**：合法样例通过；未知 schema version、非法 phase/status、缺少 required material、错误 blocker/review/readiness 结构均失败，并返回稳定的路径化错误。
- **依据**：[requirements.md](requirements.md) R7、R12；[architecture.md](architecture.md) §3.2、§4.1、§4.2、§5.2。

#### I-03 项目发现、材料集合与 digest 基础

- **目标**：实现固定项目根发现、安全路径、required/included 展开和 SHA-256 纯函数，为所有后续门提供同一材料事实。
- **Consumes**：`PROJECT.yaml`、Change 目录、`change.yaml.materials`、Git/文件系统快照。
- **Produces**：ProjectPaths、MaterialSet、file/set/range digest、drift facts 和路径错误。
- **预计修改范围**：`src/core/runtime/project/discover.ts`、`git.ts`、`materials/paths.ts`、`sets.ts`、`digest.ts`、对应 unit fixtures。
- **依赖任务**：I-02。
- **验证方法与预期结果**：Windows/POSIX 路径得到相同持久化相对路径；内容/集合变更改变摘要；仅 CRLF/LF 差异不改变文本摘要；越界和 symlink escape 被拒绝。
- **依据**：[requirements.md](requirements.md) R7、R12；[architecture.md](architecture.md) §3.4、§3.5、§4.4、§8。

#### I-04 `pm init` 与 `pm change start`

- **目标**：从空项目建立固定目录和根材料，并从项目当前状态创建含五项必需材料的 active Change。
- **Consumes**：core manifest、schemas、模板、项目根、change id/title、Git snapshot。
- **Produces**：`AGENTS.md`、`PROJECT.yaml`、知识目录和 README、`engineering/`、active/archived 目录；新 Change 的 `change.yaml`、`requirements.md`、`design/README.md`、`delivery/README.md`、`knowledge-update.md`。
- **预计修改范围**：`project/init.ts`、`change-start.ts`、模板、CLI 命令绑定和 integration fixtures。
- **依赖任务**：I-01～I-03。
- **验证方法与预期结果**：空目录 init 成功且重复执行幂等；冲突文件不被覆盖；change start 记录 project revision/captured_at、初始 history 与 requirements 下一动作；重复 id 或 archived 同名返回非零。
- **依据**：[requirements.md](requirements.md) R2、R7、R12；[architecture.md](architecture.md) §3.1、§10.1、§10.3、§11.1。

#### I-05 canonical resolver 与 action derivation 骨架

- **目标**：建立唯一解析管线和纯 action rule table，首先支持 requirements 初始态、缺失材料和基础 schema/phase 矛盾。
- **Consumes**：ProjectSnapshot、validated ChangeState、MaterialSet/digest facts。
- **Produces**：ResolvedChangeState、available/blocked actions、diagnostics、next_action validity。
- **预计修改范围**：`state/resolver.ts`、`actions.ts`、`invariants.ts`、unit/gate fixtures。
- **依赖任务**：I-02～I-04。
- **验证方法与预期结果**：新 Change 只允许需求整理相关动作；implementation/confirm/archive 均显示具体 blocked reason；相同输入始终产生字节稳定的 JSON 结果。
- **依据**：[requirements.md](requirements.md) R1、R7；[architecture.md](architecture.md) §4.3、§5.1、已确认基线 11；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-01。

#### I-06 `pm status` 与 `pm validate`

- **目标**：用同一 resolver 提供人类恢复摘要、稳定 JSON 和基础完整性验证，完成第一条纵向切片。
- **Consumes**：ResolvedChangeState、CLI argv、输出格式。
- **Produces**：status 恢复摘要、validate diagnostics、稳定 exit code。
- **预计修改范围**：`cli/main.ts`、`cli/create-cli.ts`、`cli/options.ts`、`cli/commands/**`、`output.ts`、`errors.ts`、`operations/validate.ts`、CLI integration tests。
- **依赖任务**：I-05。
- **验证方法与预期结果**：`init -> change start -> status -> validate` 在新进程中成功；删除任一必需材料后 validate 为 3；非法 next_action 被拒绝；status 不修改项目文件。
- **依据**：[requirements.md](requirements.md) R1、R7、成功标准 8～10；[architecture.md](architecture.md) §4.3、§8、§10.3、§12。

### Slice 2：确认、门前自检与 readiness

#### I-07 确认材料集合与 digest 失效

**实施状态**：已完成并通过内容变化、文件集合变化、revision 追加与新进程解析测试。

- **目标**：解析完整确认对象，验证 confirmation revision/artifacts，并在集合或内容变化后把旧确认解析为失效。
- **Consumes**：gate material_set、required/included、当前 digest、历史 confirmations。
- **Produces**：confirmation validity facts、下一 revision、失效 diagnostics。
- **预计修改范围**：`materials/sets.ts`、`governance/confirmations.ts`、resolver/invariants、gate fixtures。
- **依赖任务**：I-03、I-05。
- **验证方法与预期结果**：内容、文件增删或 included 变化使确认失效；只追加新 revision 不覆盖旧记录；无变化时确认在新进程中仍有效。
- **依据**：[requirements.md](requirements.md) R2、R4、R6、R10；[architecture.md](architecture.md) §3.4、§4.4、§4.5、§5.3。

#### I-08 readiness 记录与门规则

**实施状态**：已完成并通过 pass、fail、stale、未处置/已处置 concerns 与用户权限分类测试。

- **目标**：实现 readiness 结构验证、assessed artifacts 新鲜度、concern 处置约束和进入实施的机械门。
- **Consumes**：AI 写入的 readiness 结论、需求/设计/任务材料摘要、concerns。
- **Produces**：fresh pass/concerns/fail/stale facts、available/blocked actions。
- **预计修改范围**：`governance/readiness.ts`、resolver/action rules、schema 补充、readiness fixtures。
- **依赖任务**：I-02、I-05、I-07。
- **验证方法与预期结果**：未评估、fail、stale、未处置 concern 均不能进入 implementation；已处置 concerns 只有在权限分类满足时可继续；CLI 不自行生成 PASS。
- **依据**：[requirements.md](requirements.md) R4、R5、R11；[architecture.md](architecture.md) §4.3、§5.1、§5.3、已确认基线 12；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-02、I-03。

#### I-09 `pm confirm` 与阶段推进

**实施状态**：已完成并通过显式元数据、确认责任、门前自检、阶段推进、原子 YAML 写入与独立发布目录测试。

- **目标**：在门前条件满足且调用者提供明确确认元数据时，原子记录 requirements/design/acceptance/knowledge 确认并推进状态。
- **Consumes**：gate、change id、confirmed_by、summary、evidence、当前 resolved state。
- **Produces**：新 confirmation revision、history、phase 与 next_action 更新。
- **预计修改范围**：`governance/confirmations.ts`、CLI confirm 命令、state writer、integration/gate tests。
- **依赖任务**：I-07、I-08。
- **验证方法与预期结果**：requirements/acceptance/knowledge 拒绝非 user；design 仅在权限分类字段完整时允许 AI 项目经理确认；门前自检/readiness 不满足时返回 4；确认绑定当前全部材料摘要。
- **依据**：[requirements.md](requirements.md) R2、R4、R6、R10、R11；[architecture.md](architecture.md) §4.5、§5.1、§5.3。

### Slice 3：blocker、回退与评审收敛

#### I-10 blocker 与 review loop 不变量

- **目标**：把 structured blocker、status 联动、review iteration/max 和 non_converging 停机实现为纯规则。
- **Consumes**：blockers、status、review、implementation revisions、history。
- **Produces**：合法/非法 diagnostics、resolve/review actions、non_converging blocked state。
- **预计修改范围**：`governance/blockers.ts`、`review.ts`、resolver/action rules、gate fixtures。
- **依赖任务**：I-05、I-06。
- **验证方法与预期结果**：未解决 blocker 必须对应 blocked；无 blocker 不得保持 blocked；达到上限后只允许处理 blocker/回退，不能继续自动修补；旧评审记录不被覆盖。
- **依据**：[requirements.md](requirements.md) R5、R7、R11；[architecture.md](architecture.md) §5.2、§8、已确认基线 13；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-05。

#### I-11 `pm invalidate` 与最早受影响阶段回退

- **目标**：按明确输入的 requirements/design/implementation/acceptance/knowledge 影响层级，使对应及下游状态失效并保留追溯。
- **Consumes**：stage、reason、当前门/readiness/implementation/knowledge 状态。
- **Produces**：invalidated confirmation revision、stale readiness、回退 phase/next_action、history event。
- **预计修改范围**：`governance/invalidation.ts`、CLI invalidate、state dependency table、integration tests。
- **依赖任务**：I-07、I-09、I-10。
- **验证方法与预期结果**：需求回退失效全部下游；设计回退保留需求确认；局部实现回退不破坏上游门；操作不删除代码、材料或旧证据。
- **依据**：[requirements.md](requirements.md) 核心流程回退、R2、R4、R10；[architecture.md](architecture.md) §7、§11.4。

#### I-12 中断恢复与依赖/检查点漂移

- **目标**：让新的 CLI 进程只凭项目文件输出正确目标、确认、阶段、阻塞、偏差、恢复条件和下一动作。
- **Consumes**：项目当前状态、active Change、base dependencies、implementation checkpoint、Git workspace。
- **Produces**：恢复摘要、具体 drift paths、reassess/invalidate/continue actions。
- **预计修改范围**：resolver recovery 部分、`project/git.ts`、status renderer、`tests/recovery/`。
- **依赖任务**：I-06、I-10、I-11。
- **验证方法与预期结果**：设计确认前和实施中两类快照在新进程恢复；无关未登记变更只报告不阻塞；已登记依赖变化要求重新评估；多个 active Change 时没有明确 id 则拒绝猜测。
- **依据**：[requirements.md](requirements.md) R7、R12、成功标准 8/9；[architecture.md](architecture.md) §4.4、§8、§11.3、§11.4。

### Slice 4：任务契约与四维验证

#### I-13 内置 Markdown 契约与跨材料追溯

- **目标**：实现固定、不可由项目自定义的 Markdown 标识/字段解析，检查 `REQ-*`、`AC-*`、`DES-*`、`TASK-*`、`EVID-*`、`KNOW-*` 的存在与基本覆盖。
- **Consumes**：requirements/design/delivery/knowledge 材料和入口 README 索引。
- **Produces**：ArtifactIndex、引用图、缺失/重复/悬空/未覆盖 diagnostics。
- **预计修改范围**：`materials/markdown-contract.ts`、模板、validate rules、traceability fixtures。
- **依赖任务**：I-03、I-06。
- **验证方法与预期结果**：同一 Change 内重复 ID、悬空引用和未覆盖验收标准失败；不适用设计/验证维度必须有理由字段；工具只检查结构和覆盖，不宣称语义满足。
- **依据**：[requirements.md](requirements.md) R3～R6；[architecture.md](architecture.md) §3.4、§3.5、§12。

#### I-14 任务小型交付契约

- **目标**：校验每个任务包含目标、追溯、Consumes、Produces、预计修改范围、依赖、验证方法/预期结果、状态和证据引用。
- **Consumes**：ArtifactIndex 与 delivery task 材料。
- **Produces**：TaskContract facts、依赖图、task-level diagnostics。
- **预计修改范围**：Markdown contract parser、task validators、delivery templates、unit/gate fixtures。
- **依赖任务**：I-13。
- **验证方法与预期结果**：缺任一必填字段失败；循环依赖失败；completed task 没有当前 Change 的 EVID 引用失败；工具不按时间或文件数评价任务粒度。
- **依据**：[requirements.md](requirements.md) R5、R6；[architecture.md](architecture.md) §3.4、已确认基线 14；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-06。

#### I-15 四维验证、证据新鲜度与 implementation revisions

- **目标**：校验 completeness、correctness、coherence、engineering quality 四维证据以及命令、环境、时间、结果、关键输出和断言；绑定 baseline/final revision 与 checkpoint。
- **Consumes**：delivery material set、TaskContract、Git revisions、EVID records。
- **Produces**：acceptance readiness facts、evidence diagnostics、implementation verified/blocked actions。
- **预计修改范围**：verification validator、review/revision rules、delivery templates、`tests/gates/` 与 integration fixtures。
- **依赖任务**：I-10、I-13、I-14。
- **验证方法与预期结果**：只跑测试但缺 completeness/coherence 时不能进入 acceptance；历史或其他 Agent 口头结果不算证据；四维满足且 final revision 记录后可准备验收。
- **依据**：[requirements.md](requirements.md) R5、R6、成功标准 5；[architecture.md](architecture.md) §3.4、§5.2、§11.5、已确认基线 14；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-04。

### Slice 5：知识三方 digest、原子应用与归档

#### I-16 `pm knowledge preview` 与 patch envelope

- **目标**：把用户可理解的候选选择编译为版本化、路径安全、可重复生成的精确 patch，并计算 candidate/patch/before/after digest。
- **Consumes**：`knowledge-update.md`、当前目标知识、候选处理结果。
- **Produces**：`knowledge.patch`、人类 diff 预览、targets 与 knowledge_promotion ready 状态。
- **预计修改范围**：`knowledge-preview.ts`、patch type/validator、digest/path logic、knowledge fixtures。
- **依赖任务**：LT-03 确认；I-07、I-13。
- **验证方法与预期结果**：相同输入生成字节稳定 patch；新增/修改/删除目标均有显式 before/after；越界、重复目标、候选未处理或混合当前项目文件外路径均失败。
- **依据**：[requirements.md](requirements.md) R10、R12；[architecture.md](architecture.md) §3.4、§4.4、§5.4、已确认基线 15；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-07。

#### I-17 `pm knowledge apply`、冲突与故障恢复

- **目标**：实现全部前置条件预检、post-image 暂存、不可部分成功提交、after 校验和中断恢复。
- **Consumes**：已确认 candidate/patch digests、current targets、before/after digests、transaction port。
- **Produces**：全部应用或全部未应用的知识树、applied_files、verified 状态、事务/冲突证据。
- **预计修改范围**：`transaction.ts`、`knowledge-apply.ts`、resolver transaction facts、`tests/knowledge/` 与 fault injection。
- **依赖任务**：LT-04 确认；I-09、I-16。
- **验证方法与预期结果**：任一 before mismatch 时零目标改变且 exit 5；在每个事务步骤注入中断后，新进程可完整提交或回滚；任一 after mismatch 不能标记 verified 或归档。
- **依据**：[requirements.md](requirements.md) R7、R10、R12；[architecture.md](architecture.md) §4.4、§5.4、§12；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-07。

#### I-18 `pm archive check/apply`

- **目标**：复用 canonical resolver 验证全部终态门，记录最终引用并把完整 Change 从 active 原样移动到 archived。
- **Consumes**：requirements/design/acceptance/knowledge 有效确认、readiness、verified implementation、verified knowledge、无 blocker/review 超限、revision/checkpoint。
- **Produces**：archive check report；archived Change 完整终态快照；active 路径消失。
- **预计修改范围**：`operations/archive.ts`、CLI archive 命令、resolver archive rules、atomic archive fixtures。
- **依赖任务**：I-10、I-15、I-17。
- **验证方法与预期结果**：任何缺门、无知识变更未确认、unresolved blocker、after mismatch 或目标 archived 冲突都非零且不移动；成功时只发生同项目 rename，archived 终态可 validate，新 status 不把它作为当前输入。
- **依据**：[requirements.md](requirements.md) R6、R10、R12、成功标准 6～9；[architecture.md](architecture.md) §3.6、§5.4、§11.7、§12。

### Slice 6：通用 Skill、Codex 适配器与最终验收

#### I-19 通用 `ai-project-manager` Skill

- **目标**：把发现顺序、阶段职责、门前自检、readiness、权限、回退、blocker、评审、任务、四维验证、知识和恢复写成一个 Agent 无关 Skill。
- **Consumes**：完整 CLI 行为、action IDs、材料模板、需求/架构基线。
- **Produces**：`src/core/skills/ai-project-manager/SKILL.md`、示例调用、Skill contract tests，以及对应的 `dist/core/skills/` 发布资产。
- **预计修改范围**：通用 Skill、manifest asset entry、Skill fixtures/文档检查。
- **依赖任务**：I-06、I-09～I-18。
- **验证方法与预期结果**：Skill 不引用 Codex 专用路径；禁用 Hook/Memory/子 Agent 后仍可按文件和 CLI 完成公共场景；所有确认请求前都有对应自检步骤。
- **依据**：[requirements.md](requirements.md) R1、R2、R4、R6、R7、R9～R11；[architecture.md](architecture.md) §9.1、§10.2；[agent-support-research.md](agent-support-research.md) §4.2、§5；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-02～I-06。

#### I-20 Codex 适配器与单源投影

- **目标**：从 core manifest 和通用 Skill 生成 Codex 安装资产、稳定入口和能力映射，不复制核心流程正文。
- **Consumes**：核心 bundle、`src/core/manifest.yaml`、通用 Skill、实现时重新核对的 Codex 官方文档。
- **Produces**：Codex plugin/安装包、入口说明、capability map、adapter package test。
- **预计修改范围**：`src/adapters/codex/`、Vite+ adapter projection、`dist/adapters/codex/`、发布验证、Codex fixtures。
- **依赖任务**：I-01、I-19。
- **验证方法与预期结果**：全新 Codex 环境能安装并发现唯一项目经理 Skill；adapter 生成结果与 manifest 一致；移除 Codex 增强后核心 CLI 测试仍通过；没有重复 Skill 正文。
- **依据**：[requirements.md](requirements.md) R1、R9、成功标准 10/11；[architecture.md](architecture.md) §9.2、§9.3；[agent-support-research.md](agent-support-research.md) §5、§6；[agentic-development-frameworks-research.md](agentic-development-frameworks-research.md) I-08。

#### I-21 自动化公共 E2E 与“连接钱包登录”真实验收

- **目标**：先用夹具自动走完整状态闭环，再在 Codex 中对一个真实项目从“实现连接钱包登录”意图完成两次中断、回退、验收、知识应用和归档。
- **Consumes**：打包后的 CLI、Codex 适配器、通用 Skill、真实目标项目、用户在流程中的确认。
- **Produces**：公共自动化 E2E 证据、Codex capability evidence、真实 Change archived snapshot、最终验收报告。
- **预计修改范围**：`tests/e2e/`、fixtures、Codex acceptance guide；真实业务实现只发生在被选定的受管理项目，不进入本仓库核心源码。
- **依赖任务**：I-18～I-20；真实验收还依赖用户提供/确认目标项目与业务决定。
- **验证方法与预期结果**：自动夹具覆盖成功/失败闭环；真实流程在设计确认前和实现中主动中断并可恢复；用户完成需求、设计、验收、知识确认；知识原子应用后归档；新 Change 只从更新后的当前状态启动。
- **依据**：[requirements.md](requirements.md) 第一版成功标准 1～11；[architecture.md](architecture.md) §11、§12；[agent-support-research.md](agent-support-research.md) 完整支持定义。

## 7. 关键依赖与实施关键路径

### 7.1 任务关键路径

~~~text
长期技术确认 LT-01/LT-02
  -> I-01 toolchain + manifest
  -> I-02 schemas
  -> I-03 materials/digest
  -> I-04 init/start
  -> I-05 resolver/actions
  -> I-06 status/validate
  -> I-07 confirmation validity
  -> I-08 readiness
  -> I-09 confirm
  -> I-10 blocker/review
  -> I-11 invalidate
  -> I-12 recovery
  -> I-13 traceability
  -> I-14 task contract
  -> I-15 four-dimensional verification
  -> LT-03/LT-04
  -> I-16/I-17 knowledge
  -> I-18 archive
  -> I-19 Skill
  -> I-20 Codex adapter
  -> I-21 E2E acceptance
~~~

I-13～I-15 可在 I-10～I-12 稳定后部分并行准备夹具，但不得在 canonical resolver 之前另建状态判断。I-19 可提前起草结构，但只有 CLI action、门和错误语义稳定后才能冻结正文。

### 7.2 模块依赖规则

- `state/` 可以依赖纯 types、schema result 和 material facts，不能依赖 CLI presentation。
- `operations/` 必须依赖 resolver，不能直接重新读取零散字段做自己的门判断。
- `cli/` 只能协调 operation 与输出，不被核心状态模块反向依赖。
- `src/adapters/codex/` 只能消费核心公共资产和 manifest，不能被 `src/core/runtime/` 导入；两者构建后进入同一个 `dist/`。
- Skill 可以描述如何调用 CLI，但运行时不能解析 Skill 来决定状态。
- tests 可以使用 fault ports 和 fixtures，产品代码不得依赖 tests 或某个真实钱包项目。

### 7.3 外部依赖

- Node.js 24 LTS 与精确 pnpm 版本。
- Git 是 revision 和优先工程范围清单来源；无 Git 项目仍支持基础文件模式，但真实第一版验收必须在 Git 项目中完成。
- Codex 适配器实现开始前重新核对官方 Skill/Plugin 格式和实际安装版本，不能只依赖 2026-07-11 的调研快照。
- “连接钱包登录”真实验收依赖一个可安全修改、可运行验证的目标项目，以及用户在四个确认门上的明确决定。

## 8. 测试层次与验收矩阵

### 8.1 schema 与纯函数单元测试

范围：

- project/change schema 的合法与非法样例。
- phase/gate/readiness/blocker/review/knowledge 枚举和交叉不变量。
- 路径规范化、越界拒绝、文本/文件集合/range digest。
- material set 展开、confirmation freshness、readiness stale。
- action derivation、invalidation dependency table、exit error mapping。
- Markdown IDs、引用图、任务字段和四维验证字段。

预期：相同输入产生完全相同的 resolved JSON；纯函数不读取真实 cwd、时钟、Git 或用户环境。

### 8.2 CLI 集成测试

每个发布集成测试先把完整 `dist/` 复制到仓库外且无 `node_modules` 的临时目录并以子进程运行；tarball 测试再对 `npm pack ./dist` 的解包结果重复入口检查：

- `pm init` 幂等与冲突保护。
- `pm change start` 创建/重复/非法 id。
- `status --json` 的稳定结构。
- `validate` 的成功、schema 失败、材料失败和 next_action 失败。
- confirm/invalidate/knowledge/archive 的参数、输出和 exit code。

预期：测试产品实际发布入口，不绕过 CLI 直接调用内部 operation。

### 8.3 expected-success / expected-failure 状态门测试

采用表驱动 fixture，每个状态同时断言 available actions、blocked actions、diagnostics 和 exit code：

| 场景 | Expected success | Expected failure |
| --- | --- | --- |
| 初始 requirements | draft/revise requirements | design、implementation、archive |
| requirements 材料有效且自检完成 | request/confirm requirements | 未提供明确确认元数据的 confirm |
| design + fresh readiness pass | request/confirm design | readiness stale/fail/未处置 concern 下实施 |
| implementation verified + 四维证据 | prepare/request acceptance | 只有测试通过、缺 completeness/coherence |
| acceptance confirmed | draft/preview knowledge | 未确认验收直接知识应用 |
| knowledge confirmed + before match | knowledge apply | candidate/patch/before 任一不匹配 |
| archive ready | archive check/apply | blocker、review 超限、after mismatch、缺门 |

### 8.4 中断恢复测试

至少覆盖：

1. 设计材料和 readiness 已完成、等待用户设计确认时终止进程。
2. 实施中已有 baseline revision、checkpoint、部分任务和失败证据时终止进程。
3. 修改已登记知识依赖、工程范围和无关未登记范围后分别恢复。
4. 多个 active Change 存在但未指定 id。
5. knowledge transaction 的每个写入/rename 步骤故障注入。
6. archive terminal write 与目录 rename 之间故障注入。

预期：新进程只凭项目文件恢复；不读取旧聊天；要么给出合法下一动作，要么给出精确 blocker/transaction recovery，不静默继续。

### 8.5 知识冲突和原子归档测试

- 单目标新增、修改、删除。
- 多目标全部成功。
- 第二个目标 before mismatch，断言第一个目标也未变化。
- 暂存后故障、第一目标提交后故障、after verify 故障，断言可恢复。
- “无知识变更”明确确认，不生成 patch，仍可到 archive_ready。
- archived 目标已存在、跨设备模拟、active/archived rename 失败。
- 成功归档后 active 不存在、archived 完整、知识 digest 与 applied_files 一致。
- 新 Change 的 resolver 不读取 archived 内容。

### 8.6 “连接钱包登录”端到端验收

验收分两层：

1. **自动化流程夹具**：用可控工程夹具走完所有命令、门、回退和事务，证明运行时确定性。
2. **Codex 真实项目验收**：在真实受管理项目中让 Codex 使用通用 Skill 与 CLI 完成业务变化，证明产品可用。

真实验收必须观察到：

- 原始“实现连接钱包登录”只进入 intent/requirements 整理，不直接成为已确认需求。
- AI 项目经理识别“连接钱包”和“身份登录”可能不同，并把目标、范围、非范围、安全和 AC 提交用户确认；具体认证方案不由本计划预先确认。
- 重大设计和安全边界由用户确认，局部可逆实现选择由 AI 项目经理自主完成。
- 在设计确认前主动中断一次，`pm status` 能恢复全部最小输入。
- 在实现中主动中断一次，能从 checkpoint、任务和新鲜证据继续。
- 故意制造一次局部实现缺陷并只回退实现；再模拟一次关键设计变化并保留需求确认。
- 验收材料覆盖四个验证维度，用户明确确认交付结果。
- 候选知识由用户确认；若目标发生冲突，整个应用停止并重新预览。
- 知识应用与归档完成后，新 Change 只读取项目当前知识和工程，不从历史 Change 推导钱包能力。

第一版不能仅靠自动夹具宣称 Codex “完整支持”；必须保留真实项目安装方式、能力映射和上述 E2E 证据。

### 8.7 统一验证入口

计划中的最终入口为：

~~~text
vp run verify
  = vp check（typecheck + lint + format check）
  + vp pack
  + unit
  + integration
  + gates
  + recovery
  + knowledge
  + package-content
~~~

Codex 真实项目验收单独保留人工确认证据，不伪装成完全自动化测试。

## 9. 里程碑与完成门

| 里程碑 | 可交付结果 | 完成门 |
| --- | --- | --- |
| M1 最小纵向切片 | init/start/status/validate 可从独立 `dist/` 与其 tarball 运行 | 新进程恢复初始 Change；无 `node_modules` 运行；基础成功/失败测试通过 |
| M2 确认与 readiness | digest 绑定、门前自检协议、confirm、stale 检测 | 材料变化使旧确认失效；未就绪不能实施 |
| M3 回退与恢复 | blocker/review/invalidate/checkpoint | 两个中断点恢复；非收敛停止；最早阶段回退正确 |
| M4 任务与验证 | 追溯、任务契约、四维证据 | 缺字段/缺维度 expected-failure；完整材料可进入 acceptance |
| M5 知识与归档 | preview/apply/recover/archive | 多目标冲突零部分写入；终态原样归档；新 Change 不读历史 |
| M6 Codex 完整支持 | 通用 Skill、Codex adapter、真实 E2E | 安装、入口、能力映射、两次中断和钱包登录闭环全部有证据 |

每个里程碑结束都必须运行当时已存在的全部 `vp run verify` 子集；不能为了进入下一切片而临时放宽已有 expected-failure。

## 10. 第一版明确非目标

第一版不引入：

- 多 Agent 完整适配；只完整支持和验收 Codex。
- 强制子 Agent；有委派能力时也只是 Codex 适配器增强。
- 多 Skill 体系；readiness、verification、knowledge promotion 先是一个通用 Skill 内的逻辑职责。
- 项目自定义工作流 schema、artifact profile 或路径重映射。
- 多 Change 并行协调、同 topic 自动合并或跨 Change 调度；多个 active Change 只做明确选择，不做协调。
- 无人值守循环、轮询执行器或无限自动修补。
- Web 控制台、常驻服务、数据库、队列、MCP Server 或跨项目控制平面。
- 完整 BMAD persona/party-mode、OpenSpec Stores 或 Superpowers 强制 worktree/TDD。
- Hook、Memory、任务 UI 或子 Agent 才能成立的正确性门。
- 公开 registry 发布、自动升级核心 Skill、standalone executable 或稳定 JS library API。
- 迁移、兼容或复用上一版 `project-manager` 运行时代码与工件。

## 11. 最终验收定义

第一版实现可以提交用户验收，必须同时满足：

1. M1～M6 的完成门全部通过。
2. `pm status`、`validate`、`knowledge apply` 和 `archive apply` 使用同一 canonical resolver。
3. schema、材料、确认、readiness、blocker、review、任务、证据、知识与归档的 expected-failure 都有自动回归。
4. 两个规定中断点以及知识/归档事务故障都能在新进程恢复。
5. 完整 `dist/` 在仓库外、无 `node_modules` 环境可直接运行，其 tarball 解包后得到同等能力；Codex 适配器从核心 manifest/Skill 生成并位于同一发布单元。
6. 禁用 Codex Hook、Memory、子 Agent 和并行增强后，核心闭环仍成立。
7. “连接钱包登录”真实 Change 经过需求确认、重大设计确认、实现与四维验证、用户验收、知识确认、原子应用和归档。
8. 用户能够亲自查看当前阶段、确认对象、阻塞原因、验证证据、知识预览和 archived 终态，而不需要直接操作内部 Agent 或手工编辑 YAML。

本计划通过用户确认后，实施应从 Slice 1 开始，不跨过最小纵向切片直接构建完整适配器或知识事务。
