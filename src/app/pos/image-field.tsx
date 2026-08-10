"use client";

import { useId, useState, useTransition } from "react";

import { dropImage, saveImage } from "./image-actions";
import type { ImageTarget } from "./form-state";

/** Longest edge, in pixels, that reaches the server. */
const MAX_EDGE = 800;
const JPEG_QUALITY = 0.82;

export function imageSrc(key: string): string {
  return `/api/images/${key}`;
}

/**
 * Redraws the picked file at thumbnail scale before it ever leaves the browser.
 *
 * A phone photo is several megabytes — past the Server Action body limit, and
 * far past what a counter screen needs to draw a tile. Resizing here keeps
 * uploads fast on shop wifi and avoids an image library on the server.
 */
async function downscale(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  // JPEG has no alpha channel, so transparency would otherwise composite onto
  // black. Painting white first matches how product photos are expected to look.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Could not read that image.");

  return new File([blob], "image.jpg", { type: "image/jpeg" });
}

export default function ImageField({
  target,
  id,
  imageKey,
  label,
  size = 44,
}: {
  target: ImageTarget;
  id: string;
  imageKey: string | null;
  /** What the picture is of, for screen readers. */
  label: string;
  size?: number;
}) {
  const inputId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function upload(file: File) {
    setError(null);
    startTransition(async () => {
      let resized: File;
      try {
        resized = await downscale(file);
      } catch {
        // Chrome cannot decode HEIC, which is what an iPhone hands over by
        // default unless the camera is set to "Most Compatible".
        setError("Could not read that image. Try a JPEG or PNG.");
        return;
      }

      const data = new FormData();
      data.set("target", target);
      data.set("id", id);
      data.set("file", resized);

      const result = await saveImage(data);
      if (!result.ok) setError(result.error);
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const data = new FormData();
      data.set("target", target);
      data.set("id", id);

      const result = await dropImage(data);
      if (!result.ok) setError(result.error);
    });
  }

  // Fixed footprint whether or not there is a picture — the remove control sits
  // on top of the thumbnail rather than beside it, so table rows stay aligned.
  return (
    <span
      className="relative block shrink-0"
      style={{ width: size, height: size }}
    >
      <label
        htmlFor={inputId}
        title={imageKey ? `Replace the picture of ${label}` : `Add a picture of ${label}`}
        className={`flex h-full w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-[0.6rem] text-muted/70 transition-colors hover:border-accent/40 ${
          pending ? "animate-pulse" : ""
        }`}
      >
        {imageKey ? (
          // Plain <img>, not next/image: the optimizer would refetch
          // /api/images without the session cookie and get a 401.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc(imageKey)}
            alt={label}
            width={size}
            height={size}
            className="h-full w-full object-cover"
          />
        ) : (
          <span aria-hidden>＋</span>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={pending}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clearing the input lets the same file be picked again after a
            // failure — without it, `change` never fires a second time.
            event.target.value = "";
            if (file) upload(file);
          }}
        />
        <span className="sr-only">
          {imageKey ? `Replace picture of ${label}` : `Add picture of ${label}`}
        </span>
      </label>

      {imageKey && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove picture of ${label}`}
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-white/20 bg-background text-[0.6rem] leading-none text-muted transition-colors hover:border-red-500/60 hover:text-red-300 disabled:opacity-40"
        >
          ✕
        </button>
      )}

      {/* Absolutely positioned so a failure never reflows the row it sits in. */}
      {error && (
        <span
          role="alert"
          className="absolute top-full left-0 z-10 mt-1 w-48 rounded-lg border border-red-500/30 bg-background px-2 py-1 text-[0.7rem] text-red-300 shadow-lg"
        >
          {error}
        </span>
      )}
    </span>
  );
}
