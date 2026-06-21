import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/socket.io/:path*',
        destination: 'http://127.0.0.1:4000/socket.io/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:4000/api/:path*',
      },
      {
        source: '/hls/:path*',
        destination: 'http://127.0.0.1:4000/hls/:path*',
      },
      {
        source: '/rooms/:path*',
        destination: 'http://127.0.0.1:4000/rooms/:path*',
      },
      {
        source: '/users/:path*',
        destination: 'http://127.0.0.1:4000/users/:path*',
      },
      {
        source: '/history/:path*',
        destination: 'http://127.0.0.1:4000/history/:path*',
      },
      {
        source: '/health',
        destination: 'http://127.0.0.1:4000/health',
      }
    ];
  }
};

export default nextConfig;
