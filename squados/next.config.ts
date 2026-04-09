import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Public vars baked at build time — not secrets (anon/publishable keys)
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://lzzdmrlaizfhwqiolmsx.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_Zmh4czz-OWM4kTfYPyE5Cw_z83wrcRc",
  },
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
