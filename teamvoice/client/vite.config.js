import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0", // 이미 이렇게 돼 있으면 그대로 두면 됨
    port: 5173,
    allowedHosts: true, // 여기에 ngrok 도메인 추가
  },
});
