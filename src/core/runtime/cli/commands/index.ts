import type { CAC } from "cac";

import { registerChangeStartCommand } from "./change/start/index.js";
import { registerConfirmCommand } from "./confirm/index.js";
import { registerInitCommand } from "./init/index.js";
import { registerInvalidateCommand } from "./invalidate/index.js";
import { registerStatusCommand } from "./status/index.js";
import { registerValidateCommand } from "./validate/index.js";

export function registerCommands(cli: CAC): void {
  registerInitCommand(cli);
  registerChangeStartCommand(cli);
  registerStatusCommand(cli);
  registerValidateCommand(cli);
  registerConfirmCommand(cli);
  registerInvalidateCommand(cli);
}
