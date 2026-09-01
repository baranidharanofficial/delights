import { getPosUser } from "@/lib/auth/session";
import { getBucket, isImageKey } from "@/lib/firebase/storage";

/**
 * Serves an image out of the Storage bucket.
 *
 * Objects are private, so this route is the only way in. Material photographs
 * stay behind the POS session like every other read; menu photographs do not,
 * because the public menu at `/menu` exists to show them to people who will
 * never have a session. The prefix is the whole distinction — see `isPublic`.
 *
 * `next/image` is deliberately not used against this route. For the gated keys
 * the optimizer would refetch the URL server-side without the browser's cookies
 * and land on the login redirect; for the public ones there is simply nothing to
 * gain, since the objects are already sized for the web on upload. Callers use a
 * plain `<img>`.
 */

/**
 * Whether an image may be served to an anonymous visitor.
 *
 * Only menu photographs qualify. `isImageKey` has already established the key is
 * one of the two known folders and has no traversal in it, so a prefix test here
 * is a complete answer rather than a guess at the shape of the string.
 */
function isPublic(key: string): boolean {
  return key.startsWith("menu/");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: segments } = await params;
  const key = segments.join("/");
  if (!isImageKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  const open = isPublic(key);
  if (!open && !(await getPosUser())) {
    return new Response("Unauthorized", { status: 401 });
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
        // cached one. Menu photos may additionally rest in shared caches; the
        // gated ones must stay in the one browser that was allowed to see them.
        "Cache-Control": `${open ? "public" : "private"}, max-age=31536000, immutable`,
      },
    });
  } catch (cause) {
    // A key pointing at a deleted object is the common case here, and a broken
    // thumbnail should not take the screen down with it.
    console.error("image fetch failed", key, cause);
    return new Response("Not found", { status: 404 });
  }
}
