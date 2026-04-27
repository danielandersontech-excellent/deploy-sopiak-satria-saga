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

  // Check for httpOnly cookie OR localStorage-based auth
  const token = request.cookies.get("ptsss_token")?.value;
  if (!token) {
    // Redirect to login if no cookie found
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|logo-ptsss.png|sw.js|workbox).*)"],
};
