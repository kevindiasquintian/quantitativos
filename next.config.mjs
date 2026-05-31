/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist uses a worker and optional canvas; mark canvas external on the server
  // so Next does not try to bundle the native module.
  serverExternalPackages: ["pdfjs-dist", "exceljs"],
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
