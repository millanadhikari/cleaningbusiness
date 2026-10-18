import type { Metadata } from "next";
import { CommercialCalculator } from "./commercial-calculator";

export const metadata: Metadata = {
  title: "Commercial Cleaning Cost Calculator Sydney | WeDo",
  description: "Estimate commercial cleaning costs by premises type, floor area, schedule and optional extras, then request a tailored written proposal.",
};

export default function CleaningCostCalculatorPage() {
  return <CommercialCalculator />;
}
