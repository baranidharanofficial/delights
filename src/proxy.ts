import { NextResponse, type NextRequest } from "next/server";

import { canReachPath } from "@/lib/auth/access";
import { LOGIN_PATH, POS_PATH, SESSION_COOKIE } from "@/lib/auth/config";
import { readSession } from "@/lib/auth/tokens";

/**
 * Optimistic gate for /pos — cookie only, no I/O. The real authorization check
 * lives in `requireSection()`, which every /pos route and Server Action calls.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const user = await readSession(request.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = pathname === LOGIN_PATH;

  if (!user && !isLogin) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.nextUrl));
  }

  if (user && isLogin) {
    return NextResponse.redirect(new URL(POS_PATH, request.nextUrl));
  }

  if (user && !isLogin && !canReachPath(user.role, pathname)) {
    // Only a page view is sent somewhere useful. A redirect answering a Server
    // Action would re-issue the POST — body, action header and all — against
    // whichever route it landed on, so those are simply refused.
    return request.method === "GET"
      ? NextResponse.redirect(new URL(POS_PATH, request.nextUrl))
      : new NextResponse("Forbidden", { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/pos", "/pos/:path*"],
};
