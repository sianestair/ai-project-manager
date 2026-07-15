import type { CAC } from "cac";

import { registerArchiveApplyCommand } from "./archive/apply/index.js";
import { registerArchiveCheckCommand } from "./archive/check/index.js";
import { registerChangeStartCommand } from "./change/start/index.js";
import { registerConfirmCommand } from "./confirm/index.js";
import { registerInitCommand } from "./init/index.js";
import { registerInvalidateCommand } from "./invalidate/index.js";
import { registerKnowledgePreviewCommand } from "./knowledge/preview/index.js";
import { registerKnowledgeApplyCommand } from "./knowledge/apply/index.js";
import { registerKnowledgeRecoverCommand } from "./knowledge/recover/index.js";
import { registerStatusCommand } from "./status/index.js";
import { registerValidateCommand } from "./validate/index.js";

export function registerCommands(cli: CAC): void {
  registerArchiveCheckCommand(cli);
  registerArchiveApplyCommand(cli);
  registerInitCommand(cli);
  registerChangeStartCommand(cli);
  registerStatusCommand(cli);
  registerValidateCommand(cli);
  registerConfirmCommand(cli);
  registerInvalidateCommand(cli);
  registerKnowledgePreviewCommand(cli);
  registerKnowledgeApplyCommand(cli);
  registerKnowledgeRecoverCommand(cli);
}
