import { io } from "socket.io-client";

const SOCKET_SERVER_URL = "localhost:3001"; // 서버 주소에 맞게 변경

export const socket = io(SOCKET_SERVER_URL, {
  autoConnect: true, // ← 이렇게 변경!
  transports: ["websocket", "polling"], // 폴백 옵션 추가
});

export default socket;
