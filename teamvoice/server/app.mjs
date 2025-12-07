import express from "express";
import { Server } from "socket.io";

const app = express();

const server_port = 8080;
const server = app.listen(server_port, () => {
  console.log("Started on : " + server_port);
});

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const maxClientsPerRoom = 2;
const roomCounts = {};

io.on("connection", (socket) => {
  console.log(`✅ New client connected: ${socket.id}`);

  /**
   * 클라이언트가 방에 입장 요청
   */
  socket.on("join", (roomId) => {
    console.log("roomId", roomId);

    // 현재 방의 인원 수 확인
    const currentClients = roomCounts[roomId] || 0;

    console.log("currentClients", currentClients);

    if (currentClients < maxClientsPerRoom) {
      // 방에 입장
      socket.join(roomId);
      roomCounts[roomId] = currentClients + 1;

      console.log(
        `🚪 User ${socket.id} joined room ${roomId}. Count: ${roomCounts[roomId]}`
      );

      // 방에 두 번째 사용자가 들어왔다면, 시그널링 시작을 알림
      if (roomCounts[roomId] === maxClientsPerRoom) {
        // 방장(첫 번째 사용자)에게 연결을 시작하라는 알림을 보냄
        // "ready" 이벤트는 WebRTC 연결 프로세스를 시작하라고 알림
        socket.broadcast.to(roomId).emit("ready");
      }
    } else {
      // 1:1 음성 채팅방에 2명까지만 접속할 수 있도록 제한
      socket.emit("room-full", roomId);
      console.log(`⚠️ Room ${roomId} is full. Max: ${maxClientsPerRoom}`);
      return;
    }

    // 소켓에 현재 방 ID를 저장하여 disconnect 시 사용
    socket.roomId = roomId;
  });

  // WebRTC 시그널링 메시지 중계 (Offer, Answer, ICE Candidate)
  socket.on("rtc-message", (message) => {
    const roomId = socket.roomId;

    if (roomId) {
      socket.broadcast.to(roomId).emit("rtc-message", message);
      console.log(`✉️ Message relayed in room ${roomId} from ${socket.id}`);
    }
  });

  /**
   * 클라이언트가 연결을 끊었을 때
   */
  socket.on("disconnect", () => {
    const roomId = socket.roomId;

    if (roomId && roomCounts[roomId] > 0) {
      roomCounts[roomId]--;
      console.log(
        `❌ Client ${socket.id} disconnected from room ${roomId}. New Count: ${roomCounts[roomId]}`
      );

      // 만약 인원이 0이 되면 방 카운트를 정리
      if (roomCounts[roomId] === 0) {
        delete roomCounts[roomId];
      }

      // 방을 나간 후 남아있는 사용자에게 'bye' 메시지를 보내 연결 종료를 알립니다.
      socket.broadcast.to(roomId).emit("bye");
    }
  });
});
