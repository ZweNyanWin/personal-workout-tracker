"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner, requireBusinessCoach } from "@/lib/business/access";
import { businessStatusSchema, coachBusinessMetricSchema, createCoachBusinessSchema } from "@/lib/business/schema";
import type { CoachBusinessMetric } from "@/lib/business/schema";
import type { ActionResult } from "@/types";

function message(error: unknown) {
  return error instanceof z.ZodError ? error.issues[0]?.message ?? "Invalid business details"
    : error instanceof Error ? error.message : "Could not update this business";
}

export async function getCoachBusinessMetrics(): Promise<CoachBusinessMetric[]> {
  const { supabase } = await requirePlatformOwner();
  const { data, error } = await supabase.rpc("get_coach_business_metrics");
  if (error) throw new Error("Coach business setup is not available. Apply the verified business migration first.");
  return z.array(coachBusinessMetricSchema).parse(data);
}

export async function createCoachBusiness(input: { name: string; email: string }): Promise<ActionResult<string>> {
  try {
    const clean = createCoachBusinessSchema.parse(input);
    const { supabase } = await requirePlatformOwner();
    const { data, error } = await supabase.rpc("create_coach_business", { p_name: clean.name, p_coach_email: clean.email });
    if (error || !data) throw new Error(error?.message ?? "Could not create this business");
    revalidatePath("/platform");
    return { success: true, data };
  } catch (error) { return { success: false, error: message(error) }; }
}

export async function changeCoachBusinessStatus(id: string, status: "trial" | "active" | "paused"): Promise<ActionResult> {
  try {
    z.string().uuid().parse(id);
    businessStatusSchema.parse(status);
    const { supabase } = await requirePlatformOwner();
    const { error } = await supabase.rpc("set_coach_business_status", { p_organization_id: id, p_status: status });
    if (error) throw new Error(error.message);
    revalidatePath("/platform"); revalidatePath(`/platform/businesses/${id}`); revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: message(error) }; }
}

export async function addCoachBusinessClient(email: string): Promise<ActionResult<string>> {
  try {
    const clean = z.string().trim().email().max(320).parse(email);
    const { supabase } = await requireBusinessCoach();
    const { data, error } = await supabase.rpc("add_coach_business_client", { p_email: clean });
    if (error || !data) throw new Error(error?.message ?? "Could not add this client");
    revalidatePath("/admin/business"); revalidatePath("/admin/members"); revalidatePath("/admin");
    return { success: true, data };
  } catch (error) { return { success: false, error: message(error) }; }
}
