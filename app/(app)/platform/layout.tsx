import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_platform_operator");
  if (error || data !== true) redirect("/dashboard");
  return children;
}
