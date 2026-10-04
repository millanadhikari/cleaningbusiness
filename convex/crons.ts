import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "renew Gmail inbox watch",
  { hourUTC: 15, minuteUTC: 0 },
  internal.gmailActions.renewWatch,
  {},
);

export default crons;
