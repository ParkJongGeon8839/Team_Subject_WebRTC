import { useState } from "react";
import VoiceChatRoom from "./VoiceChatRoom";
import "./App.css";

function App() {
  const [roomIdInput, setRoomIdInput] = useState("");
  const [roomId, setRoomId] = useState("");

  const handleJoin = () => {
    if (!roomIdInput.trim()) {
      alert("방 ID를 입력해 주세요");
      return;
    }
    setRoomId(roomIdInput.trim());
  };

  return (
    <div className="app-root">
      {/* 가운데 정렬 + 최대 폭을 잡아줄 래퍼 */}
      <div className="app-inner">
        <div className="app-header">
          <h1 className="app-title">WebRTC 음성 채팅 데모</h1>
          <p className="app-subtitle">
            동일한 Room ID로 접속한 두 브라우저 간에 실시간 음성 채팅을
            수행합니다.
          </p>
        </div>

        <div className="app-card">
          {!roomId && (
            <>
              <div className="room-form">
                <input
                  className="room-input"
                  type="text"
                  placeholder="방 ID를 입력하세요 (예: 1234)"
                  value={roomIdInput}
                  onChange={(e) => setRoomIdInput(e.target.value)}
                />
                <button className="button-primary" onClick={handleJoin}>
                  방 입장
                </button>
              </div>
              <p className="status-text">
                브라우저 창을 두 개 열고 동일한 방 ID로 접속하면 음성 채팅을
                테스트할 수 있습니다.
              </p>
            </>
          )}

          {roomId && (
            <>
              <p className="status-text">현재 방 ID: {roomId}</p>
              <VoiceChatRoom roomId={roomId} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
