import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBusinessAccess } from "@/lib/business/access";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  if (!(await getBusinessAccess(supabase)).isCoach) redirect("/dashboard");

  return children;
}
