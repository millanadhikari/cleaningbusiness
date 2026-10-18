import type { Metadata } from "next";
import { EndOfLeaseLanding } from "./end-of-lease-landing";

export const metadata: Metadata = {
  title: "End of Lease Cleaning Sydney | WeDo Cleaning",
  description: "Inspection-ready end of lease, bond and move-out cleaning across Sydney. View the full checklist and get an instant estimate from $299.",
};

export default function EndOfLeaseCleanPage() {
  return <EndOfLeaseLanding />;
}
