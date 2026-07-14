import { resolveCanonicalState } from "../../state/resolver.js";
import { readProjectCommandOptions } from "../options.js";

export async function resolveReadCommand(changeId: string | undefined, rawOptions: unknown) {
  const options = readProjectCommandOptions(rawOptions);
  const state = await resolveCanonicalState({
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(changeId === undefined ? {} : { changeId }),
  });

  return {
    state,
    json: options.json,
  };
}
