import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'uxczbwtfcsjsrmrikwoh.supabase.co',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist']
};

export default nextConfig;
