/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  // Next 16 writes AGENTS.md / CLAUDE.md into web/ on `next dev`; the case folder has its own.
  agentRules: false,
  // Old paths keep working after the move to Spanish routes.
  async redirects() {
    return [
      { source: "/team", destination: "/equipo", permanent: false },
      { source: "/cost", destination: "/costo", permanent: false },
      { source: "/overview", destination: "/resumen", permanent: false },
    ]
  },
}

export default nextConfig
