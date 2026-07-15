/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Доступ к dev-серверу по IP в локальной сети
  allowedDevOrigins: ["192.168.0.42", "localhost", "127.0.0.1"],
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "192.168.**",
        pathname: "/uploads/**",
      },
      {
        protocol: "http",
        hostname: "10.**",
        pathname: "/uploads/**",
      },
    ],
  },
};

export default nextConfig;
