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
  // snapshot (default): the app's today is the data's extract date; real: today's date
  env: { NEXT_PUBLIC_CS_CLOCK: process.env.CS_CLOCK ?? "snapshot" },
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
