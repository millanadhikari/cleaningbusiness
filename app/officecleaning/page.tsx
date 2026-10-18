import type { Metadata } from "next";
import { OfficeCleaningLanding } from "./office-cleaning-landing";

export const metadata: Metadata = {
  title: "Office Cleaning Sydney | WeDo Cleaning Services",
  description: "Flexible office and commercial cleaning across Sydney. Tailored workplace checklists, after-hours options and clear ongoing cleaning plans.",
};

export default function OfficeCleaningPage() {
  return <OfficeCleaningLanding />;
}
