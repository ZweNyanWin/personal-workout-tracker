import "server-only";

import { createClient } from "@/lib/supabase/server";

export type BusinessAccess = {
  isCoach: boolean;
  isPlatformOwner: boolean;
  aiEnabled: boolean;
  organizationId: string | null;
};

/** Check live membership and business status; profile.role is a UI compatibility field. */
export async function getBusinessAccess(supabase?: Awaited<ReturnType<typeof createClient>>): Promise<BusinessAccess> {
  const client = supabase ?? await createClient();
  const [coach, owner, ai, organization] = await Promise.all([
    client.rpc("is_admin"), client.rpc("is_platform_operator"),
    client.rpc("coach_ai_access"), client.rpc("current_coach_organization"),
  ]);
  // Missing migration or failed permission checks fail closed.
  return {
    isCoach: !coach.error && coach.data === true,
    isPlatformOwner: !owner.error && owner.data === true,
    aiEnabled: !ai.error && ai.data === true,
    organizationId: !organization.error ? organization.data : null,
  };
}

export async function requireBusinessCoach() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to manage your coaching business");
  const access = await getBusinessAccess(supabase);
  if (!access.isCoach) throw new Error("Your active coach business membership is required");
  return { supabase, user, access };
}

export async function requirePlatformOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in to manage PowerBuild");
  const { data, error } = await supabase.rpc("is_platform_operator");
  if (error || data !== true) throw new Error("Only the PowerBuild owner can manage coach businesses");
  return { supabase, user };
}
