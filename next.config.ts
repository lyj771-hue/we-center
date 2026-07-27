import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 Wi-Fi의 다른 기기(아이패드 등)에서 개발 서버로 접속해 확인할 수 있도록 허용
  allowedDevOrigins: ['192.168.0.19'],
};

export default nextConfig;
