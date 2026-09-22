import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Texto pegado largo en Extraer. Los archivos no pasan por aquí: van
    // directo del navegador a Supabase Storage. Vercel corta en 4,5 MB igual.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
