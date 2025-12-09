const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);

// Socket.io 설정 (CORS 허용)
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());

// ============================================
// 데이터 저장소
// ============================================
const rooms = {}; // { roomId: { id, name, users: {}, maxUsers, createdAt } }
const socketToRoom = {}; // { socketId: roomId }
const socketToNickname = {}; // { socketId: nickname }
const socketScreenShare = {}; // { socketId: boolean } - 화면공유 상태

const MAX_USERS_PER_ROOM = 5;

// ============================================
// 헬퍼 함수
// ============================================

// 방 목록 정보 (로비용)
function getRoomsList() {
  return Object.values(rooms).map((room) => ({
    id: room.id,
    name: room.name,
    userCount: Object.keys(room.users).length,
    maxUsers: room.maxUsers,
    createdAt: room.createdAt,
  }));
}

// 방 정보 브로드캐스트 (로비에 있는 모든 유저에게)
function broadcastRoomsUpdate() {
  io.emit("rooms-list", getRoomsList());
}

// 방이 비었으면 삭제
function deleteRoomIfEmpty(roomId) {
  const room = rooms[roomId];
  if (room && Object.keys(room.users).length === 0) {
    delete rooms[roomId];
    io.emit("room-deleted", { roomId });
    console.log(`방 삭제됨: ${roomId}`);
    return true;
  }
  return false;
}

// ============================================
// Socket.io 이벤트 핸들러
// ============================================
io.on("connection", (socket) => {
  console.log(`유저 연결: ${socket.id}`);

  // ------------------------------------------
  // 로비 이벤트
  // ------------------------------------------

  // 방 목록 요청
  socket.on("get-rooms", () => {
    socket.emit("rooms-list", getRoomsList());
  });

  // 닉네임 저장
  socket.on("set-nickname", (nickname) => {
    socketToNickname[socket.id] = nickname;
    console.log(`닉네임 설정: ${socket.id} -> ${nickname}`);
  });

  // 방 생성
  socket.on("create-room", ({ roomName }) => {
    const roomId = uuidv4();
    rooms[roomId] = {
      id: roomId,
      name: roomName,
      users: {},
      maxUsers: MAX_USERS_PER_ROOM,
      createdAt: new Date().toISOString(),
    };

    console.log(`방 생성: ${roomName} (${roomId})`);

    // 생성한 사람에게 방 ID 전달
    socket.emit("room-created", { roomId, roomName });

    // 모든 유저에게 방 목록 갱신
    broadcastRoomsUpdate();
  });

  // ------------------------------------------
  // 방 입장/퇴장 이벤트
  // ------------------------------------------

  // 방 입장
  socket.on("join-room", ({ roomId }) => {
    const room = rooms[roomId];
    const nickname = socketToNickname[socket.id] || "익명";

    // 방이 없는 경우
    if (!room) {
      socket.emit("join-failed", { reason: "존재하지 않는 방입니다." });
      return;
    }

    // 인원 초과
    if (Object.keys(room.users).length >= room.maxUsers) {
      socket.emit("join-failed", { reason: "방이 가득 찼습니다." });
      return;
    }

    // 방 입장 처리
    room.users[socket.id] = {
      socketId: socket.id,
      nickname: nickname,
      isScreenSharing: false, // 화면공유 상태 추가
    };
    socketToRoom[socket.id] = roomId;
    socketScreenShare[socket.id] = false;

    // Socket.io room에 참가
    socket.join(roomId);

    // 입장한 유저에게 성공 응답 + 현재 방 유저 목록
    const usersInRoom = Object.values(room.users);
    socket.emit("join-success", {
      roomId: room.id,
      roomName: room.name,
      users: usersInRoom,
    });

    // 방의 다른 유저들에게 새 유저 알림
    socket.to(roomId).emit("user-joined", {
      socketId: socket.id,
      nickname: nickname,
      isScreenSharing: false,
    });

    console.log(
      `${nickname}(${socket.id})이 방 ${room.name}에 입장. 현재 인원: ${usersInRoom.length}`
    );

    // 로비에 방 정보 갱신
    broadcastRoomsUpdate();
  });

  // 방 나가기
  socket.on("leave-room", () => {
    leaveCurrentRoom(socket);
  });

  // ------------------------------------------
  // WebRTC 시그널링 이벤트 (음성채팅)
  // ------------------------------------------

  // Offer 전달
  socket.on("offer", ({ targetId, sdp }) => {
    const nickname = socketToNickname[socket.id] || "익명";
    console.log(`Offer: ${socket.id} -> ${targetId}`);

    io.to(targetId).emit("offer", {
      senderId: socket.id,
      senderNickname: nickname,
      sdp: sdp,
    });
  });

  // Answer 전달
  socket.on("answer", ({ targetId, sdp }) => {
    console.log(`Answer: ${socket.id} -> ${targetId}`);

    io.to(targetId).emit("answer", {
      senderId: socket.id,
      sdp: sdp,
    });
  });

  // ICE Candidate 전달
  socket.on("ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("ice-candidate", {
      senderId: socket.id,
      candidate: candidate,
    });
  });

  // ------------------------------------------
  // 화면공유 시그널링 이벤트
  // ------------------------------------------

  // 화면공유 Offer
  socket.on("screen-offer", ({ targetId, sdp }) => {
    const nickname = socketToNickname[socket.id] || "익명";
    console.log(`Screen Offer: ${socket.id} -> ${targetId}`);

    io.to(targetId).emit("screen-offer", {
      senderId: socket.id,
      senderNickname: nickname,
      sdp: sdp,
    });
  });

  // 화면공유 Answer
  socket.on("screen-answer", ({ targetId, sdp }) => {
    console.log(`Screen Answer: ${socket.id} -> ${targetId}`);

    io.to(targetId).emit("screen-answer", {
      senderId: socket.id,
      sdp: sdp,
    });
  });

  // 화면공유 ICE Candidate
  socket.on("screen-ice-candidate", ({ targetId, candidate }) => {
    io.to(targetId).emit("screen-ice-candidate", {
      senderId: socket.id,
      candidate: candidate,
    });
  });

  // 화면공유 상태 변경
  socket.on("screen-share-status", ({ isSharing }) => {
    const roomId = socketToRoom[socket.id];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const user = room.users[socket.id];
    if (user) {
      user.isScreenSharing = isSharing;
    }
    socketScreenShare[socket.id] = isSharing;

    console.log(`화면공유 상태 변경: ${socket.id} -> ${isSharing}`);

    // 방의 다른 유저들에게 알림
    socket.to(roomId).emit("screen-share-status-changed", {
      visitorId: socket.id,
      isSharing: isSharing,
    });
  });

  // 화면공유 Offer 요청 (새로 입장한 유저가 공유중인 유저에게 요청)
  socket.on("request-screen-offer", ({ targetId }) => {
    const nickname = socketToNickname[socket.id] || "익명";
    console.log(`Screen Offer 요청: ${socket.id} -> ${targetId}`);

    io.to(targetId).emit("request-screen-offer", {
      requesterId: socket.id,
      requesterNickname: nickname,
    });
  });

  // ------------------------------------------
  // 텍스트 채팅 이벤트
  // ------------------------------------------

  socket.on("chat-message", ({ message }) => {
    const roomId = socketToRoom[socket.id];
    const nickname = socketToNickname[socket.id] || "익명";

    if (roomId && rooms[roomId]) {
      // 방의 모든 유저에게 메시지 전달 (본인 포함)
      io.to(roomId).emit("chat-message", {
        senderId: socket.id,
        nickname: nickname,
        message: message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ------------------------------------------
  // 연결 종료
  // ------------------------------------------

  socket.on("disconnect", () => {
    console.log(`유저 연결 해제: ${socket.id}`);
    leaveCurrentRoom(socket);
    delete socketToNickname[socket.id];
    delete socketScreenShare[socket.id];
  });

  // ------------------------------------------
  // 방 나가기 공통 함수
  // ------------------------------------------
  function leaveCurrentRoom(socket) {
    const roomId = socketToRoom[socket.id];
    if (!roomId || !rooms[roomId]) return;

    const room = rooms[roomId];
    const nickname = room.users[socket.id]?.nickname || "익명";

    // 방에서 유저 제거
    delete room.users[socket.id];
    delete socketToRoom[socket.id];

    // Socket.io room에서 나가기
    socket.leave(roomId);

    // 방의 다른 유저들에게 알림
    socket.to(roomId).emit("user-left", {
      socketId: socket.id,
      nickname: nickname,
    });

    console.log(
      `${nickname}(${socket.id})이 방 ${room.name}에서 퇴장. 남은 인원: ${
        Object.keys(room.users).length
      }`
    );

    // 빈 방이면 삭제
    if (!deleteRoomIfEmpty(roomId)) {
      // 방이 삭제되지 않았으면 로비 갱신
      broadcastRoomsUpdate();
    } else {
      broadcastRoomsUpdate();
    }
  }
});

// ============================================
// 서버 시작
// ============================================
const PORT = 3001;

server.listen(PORT, () => {
  console.log(`✅ 시그널링 서버 실행 중: http://localhost:${PORT}`);
});
