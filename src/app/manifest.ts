import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Innova AI",
    short_name: "Innova",
    description: "Manage your hospitality business with Innova AI.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8faf9",
    theme_color: "#2e7d5b",
    icons: [
  {
    src: "/icon-192.png",
    sizes: "192x192",
    type: "image/png",
  },
  {
    src: "/icon-512.png",
    sizes: "512x512",
    type: "image/png",
  },
],
  };
}