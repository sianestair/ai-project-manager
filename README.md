# AI 项目经理

`project-manager` 是一个本地 Codex 插件。它为每个项目初始化一位具名 AI 项目经理，并让项目经理持续协调调研、规划、实施、验收、知识回写和归档。

用户只需要一个入口：

```text
@project-manager
```

项目经理会在项目根目录读取 `project.yaml`，认识项目业务负责人、恢复双方称呼，并按照项目配置定位当前真相、active changes、历史归档和工程实现。

## 项目配置

每个项目只初始化一次。配置位于项目根目录：

```yaml
schema: project-manager
version: 1

project:
  name: VowUp

projectManager:
  name: 林舟

businessOwner:
  name: 张三
  preferredAddress: 张总

locations:
  currentTruth: knowledge-base/project
  activeChanges: changes/active
  archivedChanges: changes/archived
  engineering: engineering
```

`project.yaml` 只记录身份和位置，不保存业务真相、聊天内容、调研正文或 change 状态。

## 内容边界

- `locations.currentTruth`：验收后的确定性当前真相。
- 当前 active change：调研、讨论、规划、未验收未来规则、return packet 和过程状态。
- `locations.archivedChanges`：完成后的完整 change 历史。
- `locations.engineering`：工程实现。

未经验收，不得把未来事实和未来规则写入当前真相。

## 构建

```powershell
npm install
npm run validate
npm run build
```

Codex 插件产物：

```text
plugins/project-manager/
```

本仓库的 marketplace：

```text
.agents/plugins/marketplace.json
```

## 安装到本地 Codex

首次使用该仓库 marketplace：

```powershell
codex plugin marketplace add "D:\软件项目\my-workflow"
codex plugin add project-manager@personal
```

安装后重启 Codex，检查并信任插件 Hook，然后新建线程。

> 如果本机已经存在另一个名为 `personal` 的 marketplace，应先为本仓库 marketplace 使用独立名称，避免来源歧义。

## 快速上手

在目标业务项目中打开 Codex，例如：

```powershell
Set-Location "D:\软件项目\vow-up"
```

首次调用：

```text
@project-manager 初始化
```

项目经理会一次性询问：

- 项目经理姓名。
- 项目业务负责人姓名。
- 项目经理如何称呼业务负责人。
- 只有现有目录不符合默认结构时，才询问材料位置。

初始化后可以直接使用项目经理姓名：

```text
林舟，汇报当前项目状态。
```

```text
林舟，推进这个需求；只有遇到业务决策时再问我。
```

可靠备用入口始终是：

```text
@project-manager
```

修改项目经理姓名或业务负责人称呼时，明确告诉项目经理要修改的字段。项目经理会使用 `projectctl update` 更新现有 `project.yaml`，不会重新初始化或覆盖其他配置。

## 内部结构

```text
content/skills/project-manager/  唯一公开 Skill 源码
runtime/project/                 project.yaml 定位、读取与校验
runtime/cli/projectctl.mjs       初始化和状态命令
hooks/                           SessionStart 与姓名唤起
internal skills                 构建后供项目经理调用的流程能力
profiles/vowup/                  VowUp schema、模板、领域规则和角色
adapters/build-plugins.mjs       生成 Codex 插件
plugins/project-manager/         生成的本地插件产物
```

`changeplan` 和 `changeflow` 仍是项目经理内部使用的机械工具。它们只判断当前状态、缺失工件和归档门禁，不替代项目经理的业务判断。

## 开发命令

```powershell
npm run projectctl -- --project <target-project> status --json
npm run projectctl -- --project <target-project> validate --json
npm run changeplan -- --project <target-project> list --json
npm run changeflow -- --project <target-project> status <change-id> --json
npm test
npm run build
```
