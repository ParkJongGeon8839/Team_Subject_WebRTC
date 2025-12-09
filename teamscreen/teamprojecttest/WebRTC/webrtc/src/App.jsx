import { useState, useRef } from "react";
import { io } from "socket.io-client";
import MainPage from "./components/MainPage";
import RoomPage from "./components/RoomPage";
import "./App.css";

function App() {
  // Socket.io 연결 객체 저장
  const [socket, setSocket] = useState(null);
  // 방 입장 여부 (true: RoomPage 표시, false: MainPage 표시)
  const [inRoom, setInRoom] = useState(false);
  // 현재 입장한 방 ID
  const [roomId, setRoomId] = useState("");
  // 사용자 닉네임
  const [nickname, setNickname] = useState("");
  // 방 입장 시 서버에서 받은 기존 유저 목록 (React 상태 업데이트 전에 즉시 저장용)
  const initialUsersRef = useRef([]);

  // 방 생성 핸들러
  const handleCreateRoom = (nick, room) => {
    // Socket.io 서버에 연결
    const newSocket = io.connect("http://localhost:9090");

    // 서버 연결 성공 시
    newSocket.on("connect", () => {
      // 방 생성 요청 전송
      newSocket.emit("create_room", { roomId: room, nickname: nick });
    });

    // 방 생성 완료 응답 받음
    newSocket.on("room_created", (data) => {
      // 방 생성자는 기존 유저 없음 (빈 배열)
      initialUsersRef.current = [];
      setSocket(newSocket);
      setRoomId(data.roomId);
      setNickname(nick);
      // 방 입장 상태로 변경 (RoomPage로 이동)
      setInRoom(true);
    });

    // 방이 가득 찬 경우 (최대 5명 초과)
    newSocket.on("room_full", () => {
      alert("방이 가득 찼습니다!");
      newSocket.disconnect();
    });
  };

  // 방 입장 핸들러
  const handleJoinRoom = (nick, room) => {
    // Socket.io 서버에 연결
    const newSocket = io.connect("http://localhost:9090");

    // 서버 연결 성공 시
    newSocket.on("connect", () => {
      // 방 입장 요청 전송
      newSocket.emit("join_room", { roomId: room, nickname: nick });
    });

    // 방을 찾을 수 없는 경우
    newSocket.on("room_not_found", () => {
      alert("존재하지 않는 방입니다!");
      newSocket.disconnect();
    });

    // 방이 가득 찬 경우 (최대 5명 초과)
    newSocket.on("room_full", () => {
      alert("방이 가득 찼습니다! (최대 5명)");
      newSocket.disconnect();
    });

    // 방에 있는 기존 유저 목록 받음 (화면 공유 상태 포함)
    newSocket.on("all_users", (users) => {
      // useRef로 즉시 저장 (React 상태 업데이트는 비동기라 RoomPage에서 바로 사용하기 위함)
      initialUsersRef.current = users;
      setSocket(newSocket);
      setRoomId(room);
      setNickname(nick);
      // 방 입장 상태로 변경 (RoomPage로 이동)
      setInRoom(true);
    });
  };

  return (
    <div className="App">
      {/* 방에 입장하지 않은 경우: 메인 페이지 표시 (방 생성/입장 선택) */}
      {!inRoom ? (
        <MainPage onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />
      ) : (
        /* 방에 입장한 경우: 화면 공유 및 채팅 페이지 표시 */
        <RoomPage
          socket={socket} // Socket.io 연결 객체
          roomId={roomId} // 방 ID
          nickname={nickname} // 사용자 닉네임
          initialUsersRef={initialUsersRef} // 기존 유저 목록 (ref로 전달)
        />
      )}
    </div>
  );
}

export default App;
