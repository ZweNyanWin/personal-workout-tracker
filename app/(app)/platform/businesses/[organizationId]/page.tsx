import { notFound } from "next/navigation";
import { getCoachBusinessMetrics } from "@/lib/actions/business";
import { BusinessOverview } from "@/components/business/business-overview";

export const dynamic = "force-dynamic";

export default async function CoachBusinessPage({ params }: { params: Promise<{ organizationId: string }> }) {
  const { organizationId } = await params;
  const business = (await getCoachBusinessMetrics()).find((b) => b.id === organizationId);
  if (!business) notFound();
  return <BusinessOverview business={business} />;
}
