import { internalMutation } from "./_generated/server";
import { backfillWorkReferences } from "./lib/workReferences";

export const backfillMissingReferences = internalMutation({
  args: {},
  handler: backfillWorkReferences,
});
