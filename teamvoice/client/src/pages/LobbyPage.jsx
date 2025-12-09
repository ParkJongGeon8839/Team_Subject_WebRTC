import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import socket from "../utils/socket";

function LobbyPage({ nickname, onLogout }) {
  const [rooms, setRooms] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    // 방 목록 요청
    socket.emit("get-rooms");

    // 방 목록 수신
    socket.on("rooms-list", (roomsList) => {
      setRooms(roomsList);
    });

    // 방 생성 완료
    socket.on("room-created", ({ roomId }) => {
      // 생성 후 바로 입장
      navigate(`/room/${roomId}`);
    });

    // 방 삭제 알림
    socket.on("room-deleted", ({ roomId }) => {
      setRooms((prev) => prev.filter((room) => room.id !== roomId));
    });

    return () => {
      socket.off("rooms-list");
      socket.off("room-created");
      socket.off("room-deleted");
    };
  }, [navigate]);

  // 방 생성 핸들러
  const handleCreateRoom = () => {
    if (newRoomName.trim()) {
      socket.emit("create-room", { roomName: newRoomName.trim() });
      setShowModal(false);
      setNewRoomName("");
    }
  };

  // 방 입장 핸들러
  const handleJoinRoom = (room) => {
    if (room.userCount >= room.maxUsers) {
      alert("방이 가득 찼습니다.");
      return;
    }
    navigate(`/room/${room.id}`);
  };

  // 로그아웃 핸들러
  const handleLogout = () => {
    onLogout();
    navigate("/");
  };

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <div>
          <h1>🎤 Voice Chat & Screen Share Rooms</h1>
          <span className="user-info">안녕하세요, {nickname}님!</span>
        </div>
        <div className="header-buttons">
          <button
            className="create-room-btn"
            onClick={() => setShowModal(true)}
          >
            + 새 방 만들기
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            로그아웃
          </button>
        </div>
      </div>

      <div className="room-list">
        {rooms.length === 0 ? (
          <div className="no-rooms">
            <p>아직 생성된 방이 없습니다.</p>
            <p>새로운 방을 만들어보세요!</p>
          </div>
        ) : (
          rooms.map((room) => (
            <div
              key={room.id}
              className={`room-item ${
                room.userCount >= room.maxUsers ? "full" : ""
              }`}
              onClick={() => handleJoinRoom(room)}
            >
              <div className="room-info">
                <h3>🔊 {room.name}</h3>
                <span>
                  생성: {new Date(room.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div
                className={`room-users ${
                  room.userCount >= room.maxUsers ? "full" : ""
                }`}
              >
                <span>👥</span>
                <span>
                  {room.userCount}/{room.maxUsers}
                </span>
                {room.userCount >= room.maxUsers && <span>🔒</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* 방 생성 모달 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>새 방 만들기</h2>
            <input
              type="text"
              placeholder="방 이름을 입력하세요"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              maxLength={30}
              autoFocus
              onKeyPress={(e) => e.key === "Enter" && handleCreateRoom()}
            />
            <div className="modal-buttons">
              <button className="cancel" onClick={() => setShowModal(false)}>
                취소
              </button>
              <button
                className="confirm"
                onClick={handleCreateRoom}
                disabled={!newRoomName.trim()}
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default LobbyPage;
