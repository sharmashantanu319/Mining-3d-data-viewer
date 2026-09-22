/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.56.1"],
  experimental: {
    // Avoid Turbopack task-restore failures masquerading as missing modules.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
