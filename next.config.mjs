/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pg", "bcryptjs"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Necesario para Docker: genera un servidor Node.js auto-contenido
  output: "standalone",
};

export default nextConfig;
