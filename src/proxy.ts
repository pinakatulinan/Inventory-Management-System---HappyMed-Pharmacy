import { NextResponse, type NextRequest } from "next/server";

/**
 * A cheap first gate, not the security boundary.
 *
 * The proxy runs on the Edge runtime and cannot reach the database, so all it
 * does is notice a missing session cookie and bounce to the login screen with
 * the intended destination attached. Real authentication and authorisation
 * happen in the layouts and server actions, which do validate the session
 * against the database. A forged cookie gets past this and is rejected there.
 */
const SESSION_COOKIE = "happymed_session";

const PUBLIC_PATHS = ["/login"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  if (pathname !== "/") {
    loginUrl.searchParams.set("next", `${pathname}${search}`);
  }

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the API cron endpoints (which
     * authenticate with a bearer secret instead of a cookie) and static files.
     */
    "/((?!_next/static|_next/image|api/cron|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
