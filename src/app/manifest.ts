import type { MetadataRoute } from "next";

/**
 * Makes the storefront installable — "Add to Home Screen" on mobile and the
 * install-app affordance in desktop browser address bars. Next.js picks this
 * file up automatically and wires the `<link rel="manifest">` tag itself, the
 * same way it does for `icon`/`apple-icon`.
 *
 * Colors mirror the root layout's `viewport` export (the cream the page is
 * painted in) so the OS splash screen and window chrome continue the page
 * instead of flashing a mismatched color while the app boots.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Delights",
    short_name: "Delights",
    description: "Milkshakes, snacks and fresh-baked everything.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#feebbf",
    theme_color: "#feebbf",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
