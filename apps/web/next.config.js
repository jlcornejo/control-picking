/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@picking/shared'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

module.exports = nextConfig;
