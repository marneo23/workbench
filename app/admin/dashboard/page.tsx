import type { Metadata } from "next";
import { OwnerUsageDashboard } from "@/components/OwnerUsageDashboard";

export const metadata: Metadata = {
  title: "Admin dashboard · Workbench",
  description: "Private Workbench administration and usage dashboard.",
};

export default function OwnerUsagePage() {
  return <OwnerUsageDashboard />;
}
