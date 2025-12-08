const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

// CORS 설정 - 다른 도메인에서의 요청 허용
app.use(cors());

// Socket.io 서버 설정 및 CORS 허용 도메인 지정
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"], // Vite 개발 서버 포트
    methods: ["GET", "POST"],
  },
});

// 방 정보 저장 객체
let rooms = {}; // { roomId: [{ id: socketId, nickname: 'name', isSharing: false }] }
let socketToRoom = {}; // { socketId: roomId } - 소켓ID로 방ID 찾기
const MAXIMUM = 5; // 한 방의 최대 인원 수

// 클라이언트 연결 시 실행
io.on("connection", (socket) => {
  console.log(`[CONNECTION] ${socket.id}`);

  // 방 생성 이벤트 처리
  socket.on("create_room", (data) => {
    const { roomId, nickname } = data;

    // 방이 없으면 새로 생성
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // 방에 사용자 추가
    rooms[roomId].push({ id: socket.id, nickname: nickname, isSharing: false });
    socketToRoom[socket.id] = roomId; // 소켓ID와 방ID 매핑
    socket.join(roomId); // Socket.io 방에 참가

    console.log(`[CREATE ROOM] ${nickname} created room ${roomId}`);
    socket.emit("room_created", { roomId }); // 방 생성 완료 알림
  });

  // 방 입장 이벤트 처리
  socket.on("join_room", (data) => {
    const { roomId, nickname } = data;

    // 방이 존재하는지 확인
    if (!rooms[roomId]) {
      console.log(`[JOIN ROOM] Room ${roomId} not found`);
      socket.emit("room_not_found"); // 방을 찾을 수 없음 알림
      return;
    }

    const room = rooms[roomId];

    // 방이 꽉 찼는지 확인
    if (room.length >= MAXIMUM) {
      console.log(`[JOIN ROOM] Room ${roomId} is full`);
      socket.emit("room_full"); // 방이 가득 참 알림
      return;
    }

    // 본인을 제외한 같은 방의 유저들 정보 저장 (입장 전에 미리 저장)
    const usersInRoom = room.map((user) => ({
      id: user.id,
      nickname: user.nickname,
      isSharing: user.isSharing,
    }));

    // 방에 입장 - 사용자 추가
    room.push({ id: socket.id, nickname: nickname, isSharing: false });
    socketToRoom[socket.id] = roomId; // 소켓ID와 방ID 매핑
    socket.join(roomId); // Socket.io 방에 참가

    console.log(`[JOIN ROOM] ${nickname} (${socket.id}) joined room ${roomId}`);
    console.log(
      `[JOIN ROOM] Current users in room:`,
      room.map((u) => u.nickname)
    );
    console.log(`[JOIN ROOM] Sending ${usersInRoom.length} users to new user`);

    // 본인에게 방에 있는 기존 유저 목록 전송 (화면 공유 상태 포함)
    socket.emit("all_users", usersInRoom);

    // 방의 모든 유저에게 새 유저 입장 알림 (본인 제외)
    socket.to(roomId).emit("user_joined", {
      id: socket.id,
      nickname: nickname,
      isSharing: false,
    });

    console.log(`[JOIN ROOM] User list sent to ${nickname}:`, usersInRoom);
  });

  // WebRTC Offer 전달 (연결 제안)
  socket.on("offer", (data) => {
    console.log(`[OFFER] from ${socket.id} to ${data.offerReceiveId}`);
    // 특정 사용자에게만 Offer 전달
    socket.to(data.offerReceiveId).emit("getOffer", {
      sdp: data.sdp, // Session Description Protocol
      offerSendId: socket.id,
      offerSendNickname: data.offerSendNickname || "Unknown",
    });
  });

  // WebRTC Answer 전달 (연결 응답)
  socket.on("answer", (data) => {
    console.log(`[ANSWER] from ${socket.id} to ${data.answerReceiveId}`);
    // 특정 사용자에게만 Answer 전달
    socket.to(data.answerReceiveId).emit("getAnswer", {
      sdp: data.sdp,
      answerSendId: socket.id,
    });
  });

  // ICE Candidate 전달 (네트워크 연결 정보)
  socket.on("candidate", (data) => {
    console.log(`[CANDIDATE] from ${socket.id} to ${data.candidateReceiveId}`);
    // 특정 사용자에게만 ICE Candidate 전달
    socket.to(data.candidateReceiveId).emit("getCandidate", {
      candidate: data.candidate,
      candidateSendId: socket.id,
    });
  });

  // 채팅 메시지 전달
  socket.on("send_message", (data) => {
    const roomId = socketToRoom[socket.id];
    if (roomId) {
      // 메시지 보낸 사용자 정보 찾기
      const sender = rooms[roomId].find((user) => user.id === socket.id);
      // 같은 방의 모든 사용자에게 메시지 전송 (본인 포함)
      io.to(roomId).emit("receive_message", {
        nickname: sender ? sender.nickname : "Unknown",
        message: data.message,
        timestamp: new Date().toLocaleTimeString(), // 현재 시간
      });
    }
  });

  // 화면 공유 상태 변경 알림
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

      console.log(`[SCREEN SHARE] ${socket.id} isSharing: ${data.isSharing}`);
    }
  });

  // Offer 요청 중계 (화면 공유 중인 사용자에게 연결 요청)
  socket.on("request_offer", (data) => {
    console.log(`[REQUEST OFFER] from ${socket.id} to ${data.targetId}`);
    // 특정 사용자에게 Offer 요청 전달
    socket.to(data.targetId).emit("request_offer", {
      requesterId: socket.id,
      requesterNickname: data.requesterNickname || "Unknown",
    });
  });

  // 연결 해제 처리
  socket.on("disconnect", () => {
    console.log(`[DISCONNECT] ${socket.id}`);

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

// 서버 시작
const PORT = 9090;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
