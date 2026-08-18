import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf does not require native external packaging config on serverless
  serverExternalPackages: [],
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Security headers
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://*.supabase.co; font-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self';",
          },
          // Hide powered-by header
          { key: "X-Powered-By", value: "DocChat AI" },
        ],
      },
    ];
  },
  // Optimize for production
  compress: true,
};

export default nextConfig;
