import { io } from 'socket.io-client';

const SOCKET_SERVER_URL = 'http://localhost:3001';

export const socket = io(SOCKET_SERVER_URL, {
  autoConnect: false, // 수동으로 연결 관리
});

export default socket;
