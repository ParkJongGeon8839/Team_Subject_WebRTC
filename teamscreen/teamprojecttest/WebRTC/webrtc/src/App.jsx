import { useState, useRef } from "react";
import { io } from "socket.io-client";
import MainPage from "./components/MainPage";
import RoomPage from "./components/RoomPage";
import "./App.css";

function App() {
  // 상태 관리
  const [socket, setSocket] = useState(null); // Socket.io 연결 객체
  const [inRoom, setInRoom] = useState(false); // 방 입장 여부
  const [roomId, setRoomId] = useState(""); // 현재 방 ID
  const [nickname, setNickname] = useState(""); // 사용자 닉네임
  const initialUsersRef = useRef([]); // 방 입장 시 받은 기존 유저 목록 (즉시 저장용)

  // 방 생성 핸들러
  const handleCreateRoom = (nick, room) => {
    // Socket.io 서버에 연결
    const newSocket = io.connect("http://localhost:9090");

    // 서버 연결 성공 시
    newSocket.on("connect", () => {
      console.log("Connected to server");
      // 방 생성 요청
      newSocket.emit("create_room", { roomId: room, nickname: nick });
    });

    // 방 생성 완료 응답 받음
    newSocket.on("room_created", (data) => {
      console.log("Room created:", data.roomId);
      initialUsersRef.current = []; // 방 생성자는 기존 유저 없음
      setSocket(newSocket); // 소켓 저장
      setRoomId(data.roomId); // 방 ID 저장
      setNickname(nick); // 닉네임 저장
      setInRoom(true); // 방 입장 상태로 변경
    });

    // 방이 가득 찬 경우 (최대 인원 초과)
    newSocket.on("room_full", () => {
      alert("방이 가득 찼습니다!");
      newSocket.disconnect(); // 연결 종료
    });
  };

  // 방 입장 핸들러
  const handleJoinRoom = (nick, room) => {
    // Socket.io 서버에 연결
    const newSocket = io.connect("http://localhost:9090");

    // 서버 연결 성공 시
    newSocket.on("connect", () => {
      console.log("Connected to server");
      // 방 입장 요청
      newSocket.emit("join_room", { roomId: room, nickname: nick });
    });

    // 방을 찾을 수 없는 경우
    newSocket.on("room_not_found", () => {
      alert("존재하지 않는 방입니다!");
      newSocket.disconnect(); // 연결 종료
    });

    // 방이 가득 찬 경우 (최대 5명 초과)
    newSocket.on("room_full", () => {
      alert("방이 가득 찼습니다! (최대 5명)");
      newSocket.disconnect(); // 연결 종료
    });

    // 방에 있는 기존 유저 목록 받음
    newSocket.on("all_users", (users) => {
      console.log("📢 ALL_USERS event received in App.jsx:", users);
      // useRef로 즉시 저장 (React 상태 업데이트는 비동기라 useRef 사용)
      initialUsersRef.current = users;
      console.log("💾 Stored in ref:", initialUsersRef.current);
      setSocket(newSocket); // 소켓 저장
      setRoomId(room); // 방 ID 저장
      setNickname(nick); // 닉네임 저장
      setInRoom(true); // 방 입장 상태로 변경
    });
  };

  return (
    <div className="App">
      {/* 방에 입장하지 않은 경우: 메인 페이지 표시 */}
      {!inRoom ? (
        <MainPage onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
      ) : (
        /* 방에 입장한 경우: 화상 채팅 페이지 표시 */
        <RoomPage
          socket={socket} // Socket.io 연결 객체
          roomId={roomId} // 방 ID
          nickname={nickname} // 사용자 닉네임
          initialUsersRef={initialUsersRef} // 기존 유저 목록 (ref)
        />
      )}
    </div>
  );
}

export default App;
