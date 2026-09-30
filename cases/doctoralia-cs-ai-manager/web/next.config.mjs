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
}

export default nextConfig
