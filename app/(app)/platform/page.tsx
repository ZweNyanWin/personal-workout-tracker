import type { Metadata } from "next";
import { getCoachBusinessMetrics } from "@/lib/actions/business";
import { PlatformOverview } from "@/components/business/platform-overview";

export const metadata: Metadata = { title: "Coach businesses" };
export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  return <PlatformOverview businesses={await getCoachBusinessMetrics()} />;
}
