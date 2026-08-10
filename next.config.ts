import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Images are downscaled to an 800px JPEG in the browser before upload, so
      // they land well under this. The headroom covers multipart overhead and
      // the occasional detailed photo that compresses badly.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
