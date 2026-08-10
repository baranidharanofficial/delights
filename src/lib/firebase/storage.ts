import "server-only";

import { randomUUID } from "node:crypto";

import { getStorage } from "firebase-admin/storage";
import type { Bucket } from "@google-cloud/storage";

import { getApp } from "./admin";

/**
 * Image storage in the project's Firebase Storage bucket.
 *
 * Objects are never made public. Everything is read back through
 * `/api/images/[...key]`, which checks the POS session first — the same rule the
 * rest of the app follows, and it avoids depending on whether the bucket has
 * uniform bucket-level access turned on.
 */

/**
 * Firebase's default bucket. Projects created since late 2024 get
 * `<project>.firebasestorage.app`; older ones `<project>.appspot.com`. Override
 * with `FIREBASE_STORAGE_BUCKET` when neither matches.
 */
function bucketName(): string {
  const configured = process.env.FIREBASE_STORAGE_BUCKET;
  if (configured) return configured;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    throw new Error(
      "Missing FIREBASE_PROJECT_ID, so the storage bucket cannot be derived.",
    );
  }
  return `${projectId}.firebasestorage.app`;
}

export function getBucket(): Bucket {
  return getStorage(getApp()).bucket(bucketName());
}

const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/** Hard ceiling after the browser has already downscaled. */
const MAX_BYTES = 1_500_000;

export type UploadResult =
  | { ok: true; key: string }
  | { ok: false; error: string };

/**
 * Stores one image and returns its object key.
 *
 * The key carries a random segment so every upload lands on a fresh path. That
 * is what lets the serving route mark responses immutable — a replaced picture
 * gets a new URL rather than fighting a year-long browser cache.
 */
export async function uploadImage(
  folder: "menu" | "materials",
  ownerId: string,
  file: File,
): Promise<UploadResult> {
  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return { ok: false, error: "Images must be JPEG, PNG or WebP." };
  }
  if (file.size === 0) return { ok: false, error: "That file is empty." };
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "That image is too large even after resizing." };
  }

  const key = `${folder}/${ownerId}/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await getBucket().file(key).save(buffer, {
      contentType: file.type,
      resumable: false,
    });
    return { ok: true, key };
  } catch (cause) {
    console.error("uploadImage failed", cause);
    return {
      ok: false,
      error:
        "Could not store the image. Check that Firebase Storage is enabled for this project.",
    };
  }
}

/**
 * Best-effort delete of a replaced or removed image.
 *
 * A failure here is deliberately swallowed: the document has already stopped
 * pointing at the object, so the only consequence is an orphan nobody can reach.
 * Failing the user's action over it would be the worse outcome.
 */
export async function deleteImage(key: string): Promise<void> {
  if (!key) return;

  try {
    await getBucket().file(key).delete({ ignoreNotFound: true });
  } catch (cause) {
    console.error("deleteImage failed", key, cause);
  }
}

/** Guards the serving route against path traversal and stray prefixes. */
export function isImageKey(key: string): boolean {
  return /^(menu|materials)\/[A-Za-z0-9_-]+\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key);
}
