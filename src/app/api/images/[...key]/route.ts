import { getPosUser } from "@/lib/auth/session";
import { getBucket, isImageKey } from "@/lib/firebase/storage";

/**
 * Serves an image out of the Storage bucket.
 *
 * Objects are private, so this route is the only way in — and it checks the POS
 * session first, keeping images under the same gate as every other read.
 *
 * `next/image` is deliberately not used against this route: the optimizer
 * refetches the URL server-side without the browser's cookies, which would land
 * on the login redirect. Callers use a plain `<img>` so the request carries the
 * session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (!(await getPosUser())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { key: segments } = await params;
  const key = segments.join("/");
  if (!isImageKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    // Inside the try: resolving the bucket throws when the storage env is
    // incomplete, and a missing thumbnail should not be a 500.
    const file = getBucket().file(key);
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": metadata.contentType ?? "application/octet-stream",
        // Every upload gets a fresh random key, so a stored object never
        // changes. A replaced picture arrives at a new URL instead of racing a
        // cached one.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (cause) {
    // A key pointing at a deleted object is the common case here, and a broken
    // thumbnail should not take the screen down with it.
    console.error("image fetch failed", key, cause);
    return new Response("Not found", { status: 404 });
  }
}
