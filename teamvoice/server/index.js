// server/index.js

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("클라이언트 접속:", socket.id);

  socket.on("user_joined", async (newUserId) => {
    console.log("음성 방 새 유저 입장:", newUserId);

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.close();
      } catch (e) {
        console.warn("기존 pc 종료 중 오류:", e);
      }
      pcRef.current = null;
    }

    await createOffer();
  });

  socket.on("offer", ({ roomId, offer, from }) => {
    console.log(`방 ${roomId}에 offer 전달 from ${from}`);
    socket.to(roomId).emit("offer", { offer, from });
  });

  socket.on("answer", ({ roomId, answer, from }) => {
    console.log(`방 ${roomId}에 answer 전달 from ${from}`);
    socket.to(roomId).emit("answer", { answer, from });
  });

  socket.on("ice_candidate", ({ roomId, candidate, from }) => {
    socket.to(roomId).emit("ice_candidate", { candidate, from });
  });

  socket.on("disconnect", () => {
    console.log("클라이언트 연결 해제:", socket.id);
  });
});

const PORT = 5000;

server.listen(PORT, () => {
  console.log(`시그널링 서버가 ${PORT} 포트에서 실행 중`);
});
