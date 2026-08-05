import type { Metadata } from "next";
import { OwnerUsageDashboard } from "@/components/OwnerUsageDashboard";

export const metadata: Metadata = {
  title: "Owner usage · Workbench",
  description: "Private Workbench generation usage dashboard.",
};

export default function OwnerUsagePage() {
  return <OwnerUsageDashboard />;
}
