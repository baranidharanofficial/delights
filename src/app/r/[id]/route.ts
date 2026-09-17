import { NextResponse, type NextRequest } from "next/server";

import { recordScan } from "@/lib/shop/qr-codes";

/**
 * Where a printed QR code actually points.
 *
 * The code itself never encodes the destination directly — it encodes this
 * route — so that scanning it can be counted at all. No session, no cookie:
 * whoever printed the flyer will never be signed in when someone scans it off
 * the counter.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const targetUrl = await recordScan(id, {
    userAgent: request.headers.get("user-agent"),
    referrer: request.headers.get("referer"),
    // Set by Vercel's edge network on incoming requests; absent elsewhere,
    // which `recordScan` already treats as "unknown" rather than an error.
    country: request.headers.get("x-vercel-ip-country"),
  });

  if (targetUrl === null) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.redirect(targetUrl);
}
