/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Avoid Turbopack task-restore failures masquerading as missing modules.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
