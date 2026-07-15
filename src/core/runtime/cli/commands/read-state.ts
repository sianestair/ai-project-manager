import { resolveCanonicalState } from "../../state/resolver.js";
import { readProjectCommandOptions } from "../options.js";

export async function resolveReadCommand(
  changeId: string | undefined,
  rawOptions: unknown,
  allowArchived = false,
) {
  const options = readProjectCommandOptions(rawOptions);
  const state = await resolveCanonicalState({
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(changeId === undefined ? {} : { changeId }),
    ...(allowArchived ? { allowArchived: true } : {}),
  });

  return {
    state,
    json: options.json,
  };
}
