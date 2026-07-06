# VowUp Profile

本目录是 `project-manager` 插件内部使用的 VowUp profile，不属于任何目标业务项目。

它提供：

- `vowup-change` schema。
- 中文 change 工件模板。
- 面向 VowUp-style 项目的 profile context 和规则。

目标项目的当前项目真相仍保存在目标项目自己的 `knowledge-base/project/`；active changes 仍保存在目标项目自己的 `changes/active/`。

## 推荐用法

通过共享运行时命令管理目标项目 change：

```bash
changeplan --profile vowup --project <target-project> new <change-id>
changeplan --profile vowup --project <target-project> status <change-id> --json
changeplan --profile vowup --project <target-project> instructions <artifact-id> --change <change-id> --json
changeplan --profile vowup --project <target-project> instructions apply --change <change-id> --json
changeplan --profile vowup --project <target-project> archive <change-id>
```

`artifact-id` 使用：

```text
proposal
context
spec
design
acceptance
knowledge-delta
tasks
```

推荐顺序：

```text
new
-> instructions proposal
-> instructions context
-> instructions spec
-> instructions design
-> instructions acceptance
-> instructions knowledge-delta
-> instructions tasks
-> instructions apply
-> archive
```

## 工件规则

`vowup-change` schema 要求 apply 前具备完整 planning artifacts：

```text
proposal.md
context.md
spec.md
design.md
acceptance.md
knowledge-delta.md
tasks.md
```

`context.md` 用于记录本 change 已消费的当前真相、外部参考、继承约束、声明的基线变化和冲突缺口。它不是当前项目真相。

工程实现主要依据已确认的 `design.md` 和 `tasks.md` 执行。`spec.md` 和 `acceptance.md` 用于约束目标行为和验收结果。

## Schema 校验

```bash
npm run schema:validate
```

raw OpenSpec change 命令不用于管理目标项目 change。
