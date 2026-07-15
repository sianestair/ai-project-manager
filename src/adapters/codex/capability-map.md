# Codex capability map

Status: first-version adapter contract

| Core need                      | Codex mapping                                                                | Required for correctness   | Degraded behavior                                                   |
| ------------------------------ | ---------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| Durable project guidance       | Project `AGENTS.md` plus the installed `ai-project-manager` Skill            | Yes                        | Read the same files and execute the same Skill sequentially.        |
| Deterministic state and writes | Self-contained `pm` CLI installed from the same `dist/`                      | Yes                        | None; do not reimplement resolver or transaction logic in prompts.  |
| Reusable workflow discovery    | Plugin projects the one core Skill into `skills/ai-project-manager/SKILL.md` | Yes for Codex full support | The core CLI and project contract remain usable without the plugin. |
| User decisions                 | Normal Codex conversation followed by explicit `pm confirm` metadata         | Yes                        | Never infer confirmation from task continuation or tool approval.   |
| Command/file permissions       | Codex approval and sandbox controls around ordinary file and terminal tools  | Platform safety only       | A denied command becomes a blocker; no gate is bypassed.            |
| Recovery                       | New task reads project files and runs `pm status`/`pm validate`              | Yes                        | No chat history or memory is required.                              |
| Delegation                     | Optional Codex parallel or delegated work                                    | No                         | The main Agent executes the same logical responsibilities in order. |
| Hooks                          | Not used                                                                     | No                         | All gates remain enforced by project state and CLI validation.      |
| Memory                         | Convenience context only                                                     | No                         | Project and Change files remain authoritative.                      |
| MCP/apps                       | Not included in the first version                                            | No                         | File and terminal capabilities are sufficient.                      |

The adapter is fully supported only after plugin discovery, CLI execution, confirmation interaction, interruption recovery, knowledge transaction, archive, and the common end-to-end scenario have current evidence. Structural package tests alone prove installable shape, not the real business acceptance.

Official implementation basis: [Build plugins](https://developers.openai.com/codex/plugins/build), [Build skills](https://developers.openai.com/codex/skills), and [customization](https://developers.openai.com/codex/concepts/customization). The adapter follows the current `.codex-plugin/plugin.json`, `skills/`, and marketplace layout while leaving the core independent of Codex.
