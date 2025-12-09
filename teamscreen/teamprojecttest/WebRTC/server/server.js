// === 필요한 모듈 import ===
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

// === Express 앱 및 HTTP 서버 생성 ===
const app = express();
const server = http.createServer(app);

// CORS 미들웨어 설정 (다른 도메인에서의 HTTP 요청 허용)
app.use(cors());

// === Socket.io 서버 설정 ===
const io = socketIo(server, {
  cors: {
    // WebSocket 연결을 허용할 도메인 (Vite 개발 서버 포트)
    origin: ["http://localhost:5173", "http://localhost:5174"],
    // 허용할 HTTP 메서드
    methods: ["GET", "POST"],
  },
});

// === 전역 데이터 저장소 ===
// 방 정보: { roomId: [{ id: socketId, nickname: 'name', isSharing: false }] }
let rooms = {};
// 소켓ID로 방ID 찾기: { socketId: roomId }
let socketToRoom = {};
// 한 방의 최대 인원 수
const MAXIMUM = 5;

// === Socket.io 연결 처리 ===
io.on("connection", (socket) => {
  // === 1. 방 생성 이벤트 ===
  socket.on("create_room", (data) => {
    const { roomId, nickname } = data;

    // 방이 없으면 새로 생성
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // 방에 사용자 추가
    rooms[roomId].push({ id: socket.id, nickname, isSharing: false });
    // 소켓ID와 방ID 매핑
    socketToRoom[socket.id] = roomId;
    // Socket.io 방에 참가 (방별 메시지 전송용)
    socket.join(roomId);

    // 방 생성 완료 알림
    socket.emit("room_created", { roomId });
  });

  // === 2. 방 입장 이벤트 ===
  socket.on("join_room", (data) => {
    const { roomId, nickname } = data;

    // 방이 존재하는지 확인
    if (!rooms[roomId]) {
      socket.emit("room_not_found");
      return;
    }

    const room = rooms[roomId];

    // 방이 꽉 찼는지 확인
    if (room.length >= MAXIMUM) {
      socket.emit("room_full");
      return;
    }

    // 기존 유저 목록 (입장 전에 미리 저장)
    const usersInRoom = room.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      isSharing: user.isSharing, // 화면 공유 상태 포함
    }));

    // 방에 사용자 추가
    room.push({ id: socket.id, nickname, isSharing: false });
    socketToRoom[socket.id] = roomId;
    socket.join(roomId);

    // 새 유저에게 기존 유저 목록 전송
    socket.emit("all_users", usersInRoom);

    // 기존 유저들에게 새 유저 입장 알림 (본인 제외)
    socket.to(roomId).emit("user_joined", {
      id: socket.id,
      nickname,
      isSharing: false,
    });
  });

  // === 3. WebRTC Offer 전달 ===
  // 클라이언트가 화면 공유를 시작하면 상대방에게 연결 제안 전송
  socket.on("offer", (data) => {
    // 특정 사용자에게만 Offer 전달
    socket.to(data.offerReceiveId).emit("getOffer", {
      sdp: data.sdp, // Session Description Protocol (연결 정보)
      offerSendId: socket.id, // 보낸 사람 ID
      offerSendNickname: data.offerSendNickname || "Unknown",
    });
  });

  // === 4. WebRTC Answer 전달 ===
  // Offer를 받은 클라이언트가 응답을 보냄
  socket.on("answer", (data) => {
    // 특정 사용자에게만 Answer 전달
    socket.to(data.answerReceiveId).emit("getAnswer", {
      sdp: data.sdp, // Session Description Protocol (연결 정보)
      answerSendId: socket.id, // 보낸 사람 ID
    });
  });

  // === 5. ICE Candidate 전달 ===
  // P2P 연결을 위한 네트워크 경로 정보 교환
  socket.on("candidate", (data) => {
    // 특정 사용자에게만 ICE Candidate 전달
    socket.to(data.candidateReceiveId).emit("getCandidate", {
      candidate: data.candidate, // ICE Candidate (네트워크 경로 정보)
      candidateSendId: socket.id, // 보낸 사람 ID
    });
  });

  // === 6. 채팅 메시지 전달 ===
  socket.on("send_message", (data) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      // 메시지 보낸 사용자 찾기
      const sender = rooms[roomId].find((user) => user.id === socket.id);
      // 같은 방의 모든 사용자에게 메시지 전송 (본인 포함)
      io.to(roomId).emit("receive_message", {
        nickname: sender ? sender.nickname : "Unknown",
        message: data.message,
        timestamp: new Date().toLocaleTimeString(), // 현재 시간
      });
    }
  });

  // === 7. 화면 공유 상태 변경 알림 ===
  socket.on("screen_share_status", (data) => {
    const roomId = socketToRoom[socket.id];
    if (roomId && rooms[roomId]) {
      // 해당 유저의 화면 공유 상태 업데이트
      const user = rooms[roomId].find((u) => u.id === socket.id);
      if (user) {
        user.isSharing = data.isSharing;
      }

      // 방의 다른 유저들에게 화면 공유 상태 변경 알림 (본인 제외)
      socket.to(roomId).emit("user_screen_share_status", {
        userId: socket.id,
        isSharing: data.isSharing,
      });
    }
  });

  // === 8. Offer 요청 중계 ===
  // 화면 공유 중인 사용자에게 연결 요청
  socket.on("request_offer", (data) => {
    // 특정 사용자에게 Offer 요청 전달
    socket.to(data.targetId).emit("request_offer", {
      requesterId: socket.id, // 요청한 사람 ID
      requesterNickname: data.requesterNickname || "Unknown",
    });
  });

  // === 9. 연결 해제 처리 ===
  socket.on("disconnect", () => {
    const roomId = socketToRoom[socket.id];
    let room = rooms[roomId];

    if (room) {
      // 방에서 해당 사용자 제거
      room = room.filter((user) => user.id !== socket.id);
      rooms[roomId] = room;

      // 방이 비었으면 방 삭제
      if (room.length === 0) {
        delete rooms[roomId];
      } else {
        // 다른 유저들에게 퇴장 알림
        socket.to(roomId).emit("user_exit", { id: socket.id });
      }
    }

    // 소켓-방 매핑 정보 삭제
    delete socketToRoom[socket.id];
  });
});

// === 서버 시작 ===
const PORT = 9090;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
