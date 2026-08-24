import type { MetadataRoute } from "next";

// Manifest PWA: permite anclar el gestor con nombre e icono propios en Android
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestor personal",
    short_name: "Gestor",
    start_url: "/",
    display: "standalone",
    background_color: "#faeef3",
    theme_color: "#6d1f38",
    icons: [
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
