import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  // These endpoints authenticate with an opaque desktop secret, not a user cookie.
  // Skipping a redundant Auth network call also lets them report setup errors cleanly.
  if (["/api/qr-login/start", "/api/qr-login/poll"].includes(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — do not add logic between createServerClient and getUser
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Recovery routes must remain reachable while Supabase establishes a session.
  const publicRoutes = [
    "/login",
    "/signup",
    "/forgot-password",
    "/update-password",
    "/auth/callback",
    "/scan-login",
    "/api/qr-login",
  ];
  const guestOnlyRoutes = ["/login", "/signup", "/forgot-password"];
  const matchesRoute = (route: string) =>
    pathname === route || pathname.startsWith(`${route}/`);
  const isPublicRoute = publicRoutes.some(matchesRoute);
  const isGuestOnlyRoute = guestOnlyRoutes.some(matchesRoute);

  // Redirect unauthenticated users to login
  if (!user && !isPublicRoute) {
    const returnTo = `${pathname}${request.nextUrl.search}`;
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", returnTo);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  if (user && isGuestOnlyRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
