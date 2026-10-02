import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  if (
    [
      "/preview/coach",
      "/preview/coaching",
      "/preview/ollama",
      "/api/local-ollama",
    ].includes(request.nextUrl.pathname)
  ) {
    return process.env.NODE_ENV === "development"
      ? NextResponse.next()
      : new NextResponse(null, { status: 404 });
  }
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - manifest.json
     * - sw.js (service worker)
     * - public icons
     * - offline.html (public offline fallback)
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/|offline.html).*)",
  ],
};
