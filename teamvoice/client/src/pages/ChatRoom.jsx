import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useWebRTC from "../hooks/useWebRTC";
import useScreenShare from "../hooks/useScreenShare";
import socket from "../utils/socket";

function ChatRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  // 음성채팅 훅
  const {
    users,
    isMuted,
    volume,
    speakingUsers,
    toggleMute,
    changeVolume,
    mySocketId,
  } = useWebRTC(roomId);

  // 화면공유 훅
  const {
    isSharing,
    sharingUsers,
    localScreen,
    remoteScreens,
    startScreenShare,
    stopScreenShare,
  } = useScreenShare(roomId, users);

  // 텍스트 채팅 상태
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef(null);

  // 화면공유 비디오 Ref
  const localVideoRef = useRef(null);
  const remoteVideoRefs = useRef({});

  // 내 화면공유 스트림 연결
  useEffect(() => {
    if (localVideoRef.current && localScreen) {
      localVideoRef.current.srcObject = localScreen;
    }
  }, [localScreen]);

  // 원격 화면공유 스트림 연결
  useEffect(() => {
    Object.entries(remoteScreens).forEach(([oderId, stream]) => {
      if (remoteVideoRefs.current[oderId]) {
        remoteVideoRefs.current[oderId].srcObject = stream;
      }
    });
  }, [remoteScreens]);

  // 채팅 메시지 수신
  useEffect(() => {
    socket.off("chat-message");

    socket.on("chat-message", ({ senderId, nickname, message, timestamp }) => {
      setMessages((prev) => [
        ...prev,
        { senderId, nickname, message, timestamp },
      ]);
    });

    return () => {
      socket.off("chat-message");
    };
  }, []);

  // 채팅 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 메시지 전송
  const sendMessage = () => {
    if (!inputMessage.trim()) return;
    socket.emit("chat-message", { message: inputMessage });
    setInputMessage("");
  };

  // 방 나가기
  const handleLeaveRoom = () => {
    if (isSharing) {
      stopScreenShare();
    }
    navigate("/lobby");
  };

  // 전체화면 토글
  const toggleFullScreen = (videoElement) => {
    if (!videoElement) return;

    if (!document.fullscreenElement) {
      videoElement.requestFullscreen().catch((err) => {
        console.error("전체화면 오류:", err);
      });
    } else {
      document.exitFullscreen();
    }
  };

  // 화면공유 중인 유저 찾기
  const getUserNickname = (oderId) => {
    const user = users.find((u) => u.socketId === oderId);
    return user?.nickname || "알 수 없음";
  };

  // 화면공유 영역에 표시할 스트림들
  const hasAnyScreenShare = isSharing || Object.keys(remoteScreens).length > 0;

  return (
    <div className="chat-room">
      {/* 왼쪽: 참여자 목록 */}
      <div className="participants-panel">
        <h3>참여자 ({users.length})</h3>
        <ul className="user-list">
          {users.map((user) => (
            <li
              key={user.socketId}
              className={`user-item ${
                speakingUsers.has(user.socketId) ? "speaking" : ""
              }`}
            >
              <div className="user-avatar">
                {user.nickname.charAt(0).toUpperCase()}
              </div>
              <span className="user-name">
                {user.nickname}
                {user.socketId === mySocketId && " (나)"}
              </span>
              {speakingUsers.has(user.socketId) && (
                <span className="speaking-indicator">🎙️</span>
              )}
              {(user.socketId === mySocketId
                ? isSharing
                : sharingUsers.has(user.socketId)) && (
                <span className="screen-indicator">🖥️</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* 가운데: 화면공유 + 음성 제어 */}
      <div className="main-panel">
        {/* 화면공유 영역 */}
        <div
          className={`screen-share-area ${hasAnyScreenShare ? "active" : ""}`}
        >
          {!hasAnyScreenShare ? (
            <div className="no-screen-share">
              <div className="no-share-icon">🖥️</div>
              <p>화면 공유가 없습니다</p>
              <p className="sub-text">아래 버튼을 눌러 화면을 공유해보세요</p>
            </div>
          ) : (
            <div className="screen-grid">
              {/* 내 화면공유 */}
              {isSharing && (
                <div className="screen-box my-screen">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    onClick={(e) => toggleFullScreen(e.target)}
                  />
                  <div className="screen-label">내 화면 (공유 중)</div>
                </div>
              )}

              {/* 다른 유저 화면공유 */}
              {Object.entries(remoteScreens).map(([oderId, stream]) => (
                <div key={oderId} className="screen-box">
                  <video
                    ref={(el) => {
                      if (el) {
                        remoteVideoRefs.current[oderId] = el;
                        el.srcObject = stream;
                      }
                    }}
                    autoPlay
                    playsInline
                    onClick={(e) => toggleFullScreen(e.target)}
                  />
                  <div className="screen-label">
                    {getUserNickname(oderId)}의 화면
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 컨트롤 영역 */}
        <div className="controls-area">
          {/* 음성 제어 */}
          <div className="audio-controls">
            <button
              className={`control-btn mute-btn ${isMuted ? "muted" : ""}`}
              onClick={toggleMute}
            >
              {isMuted ? "🔇" : "🎤"}
            </button>
            <div
              className="volume-control"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <span>🔊</span>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
              />
              <span>{volume}%</span>
            </div>
          </div>

          {/* 화면공유 버튼 */}
          <button
            className={`control-btn screen-btn ${isSharing ? "sharing" : ""}`}
            onClick={isSharing ? stopScreenShare : startScreenShare}
          >
            {isSharing ? "🛑 공유 중지" : "🖥️ 화면 공유"}
          </button>

          {/* 나가기 버튼 */}
          <button className="control-btn leave-btn" onClick={handleLeaveRoom}>
            나가기
          </button>
        </div>
      </div>

      {/* 오른쪽: 텍스트 채팅 */}
      <div className="text-chat">
        <h3>채팅</h3>
        <div className="messages">
          {messages.map((msg, index) => {
            const isMyMessage = msg.senderId === mySocketId;
            return (
              <div
                key={index}
                className={`message ${
                  isMyMessage ? "my-message" : "other-message"
                }`}
              >
                {!isMyMessage && (
                  <span className="msg-nickname">{msg.nickname}</span>
                )}
                <p className="msg-content">{msg.message}</p>
                <span className="msg-time">
                  {new Date(msg.timestamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
        <div className="chat-input">
          <input
            type="text"
            placeholder="메시지 입력..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          />
          <button onClick={sendMessage}>전송</button>
        </div>
      </div>
    </div>
  );
}

export default ChatRoom;
