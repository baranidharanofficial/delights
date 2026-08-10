import { NextResponse, type NextRequest } from "next/server";

import { LOGIN_PATH, POS_PATH, SESSION_COOKIE } from "@/lib/auth/config";
import { readSession } from "@/lib/auth/tokens";

/**
 * Optimistic gate for /pos — cookie only, no I/O. The real authorization check
 * lives in `requirePosUser()`, which every /pos route calls.
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/pos", "/pos/:path*"],
};
