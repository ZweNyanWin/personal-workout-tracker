import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { QrPhoneApproval } from "@/components/auth/qr-phone-approval";

export const metadata = { title: "Approve desktop sign-in" };
export const dynamic = "force-dynamic";

export default async function ScanLoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg">
        <h1 className="text-xl font-bold">Approve desktop sign-in</h1>
        {!user ? (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>Sign in to PowerBuild on this phone, then scan the desktop QR code again.</p>
            <Link href="/login" className="text-primary hover:underline">Go to sign in</Link>
          </div>
        ) : (
          <QrPhoneApproval email={user.email ?? "your account"} />
        )}
      </div>
    </main>
  );
}
