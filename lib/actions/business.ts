"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePlatformOwner, requireBusinessCoach } from "@/lib/business/access";
import { businessStatusSchema, coachBusinessMetricSchema, createCoachBusinessSchema } from "@/lib/business/schema";
import type { CoachBusinessMetric } from "@/lib/business/schema";
import type { ActionResult } from "@/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachInvitationRedirect, coachInvitationSchema, deliverCoachInvitation, InvitationConfigurationError, preparedInvitationSchema } from "@/lib/business/invitations";
import type { CoachInvitation, CoachOnboardingResult } from "@/lib/business/invitations";
import { withDeadline } from "@/lib/async/deadline";

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

export async function getCoachBusinessInvitations(): Promise<CoachInvitation[]> {
  const { supabase } = await requirePlatformOwner();
  const { data, error } = await supabase.from("coach_business_invitations")
    .select("id,name,email,status,failure_code,created_at,last_attempt_at,expires_at,organization_id")
    .in("status", ["sending", "email_sent", "email_failed"]).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error("Coach invitations are not available. Apply the verified invitation migration first.");
  return z.array(coachInvitationSchema).parse(data);
}

export async function onboardCoachBusiness(input: { name: string; email: string }): Promise<ActionResult<CoachOnboardingResult>> {
  try {
    const clean = createCoachBusinessSchema.parse(input);
    // Recheck live operator authority before creating a privileged Auth client.
    const { supabase } = await requirePlatformOwner();
    const { data, error } = await supabase.rpc("prepare_coach_business_invitation", { p_name: clean.name, p_email: clean.email });
    if (error) throw new Error(error.message);
    const prepared = preparedInvitationSchema.parse(data);
    if (prepared.state === "created") {
      revalidatePath("/platform");
      return { success: true, data: prepared };
    }
    const delivery = await deliverCoachInvitation(prepared, async () => {
      let redirectTo: string;
      try {
        redirectTo = coachInvitationRedirect(process.env.NEXT_PUBLIC_APP_URL, process.env.NODE_ENV === "development");
        createAdminClient();
      } catch { throw new InvitationConfigurationError(); }
      const result = await withDeadline((signal) => createAdminClient({ signal }).auth.admin.inviteUserByEmail(prepared.email, { redirectTo }), 12_000);
      return { user: result.data.user ? { id: result.data.user.id, email: result.data.user.email } : null, error: result.error };
    }, async (authUserId, failure) => {
      const recorded = await supabase.rpc("record_coach_invitation_delivery", {
        p_invitation_id: prepared.invitationId, p_attempt_id: prepared.attemptId,
        p_auth_user_id: authUserId, p_failure_code: failure,
      });
      if (recorded.error) throw new Error("Could not record invitation status");
    });
    revalidatePath("/platform");
    return { success: true, data: delivery };
  } catch (error) { return { success: false, error: message(error) }; }
}

export async function cancelCoachBusinessInvitation(id: string): Promise<ActionResult> {
  try {
    z.string().uuid().parse(id);
    const { supabase } = await requirePlatformOwner();
    const { error } = await supabase.rpc("cancel_coach_business_invitation", { p_invitation_id: id });
    if (error) throw new Error(error.message);
    revalidatePath("/platform");
    return { success: true, data: undefined };
  } catch (error) { return { success: false, error: message(error) }; }
}

export async function acceptCoachBusinessInvitation(): Promise<ActionResult<string>> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Open your coach invitation to sign in first");
    const { data, error } = await supabase.rpc("accept_coach_business_invitation");
    if (error || !data) throw new Error(error?.message ?? "Could not accept this invitation");
    revalidatePath("/platform"); revalidatePath("/", "layout");
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
