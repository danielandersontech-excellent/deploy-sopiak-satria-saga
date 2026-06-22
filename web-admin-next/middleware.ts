import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require authentication
const PUBLIC_PATHS = ["/login", "/download", "/api", "/_next", "/favicon.ico", "/manifest.json", "/icons", "/logo-ptsss.png", "/sw.js", "/workbox"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for httpOnly auth cookies. The access token (ptsss_token, ~30m) is
  // short-lived; the refresh token (ptsss_refresh, ~7d) outlives it.
  const token = request.cookies.get("ptsss_token")?.value;
  const refresh = request.cookies.get("ptsss_refresh")?.value;

  // [1-8] Only redirect to /login when there is NO session at all (neither
  // cookie). Previously the middleware redirected as soon as the 30-minute
  // access cookie expired, logging the user out even though a valid refresh
  // cookie was still present. When only the access cookie is missing we let
  // the request through so apiFetch (lib/api.ts) can transparently refresh on
  // the first 401. Route protection is preserved: with no cookies at all the
  // user is still sent to login.
  if (!token && !refresh) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|logo-ptsss.png|sw.js|workbox).*)"],
};
