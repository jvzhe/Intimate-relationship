import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    allowedDevOrigins: [
      "localhost:3000", 
      "*.serveo.net", 
      "*.loca.lt", 
      "*.serveousercontent.com"
    ]
  }
};

export default nextConfig;
