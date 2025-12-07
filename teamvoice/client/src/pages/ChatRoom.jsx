import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../utils/socket';
import useWebRTC from '../hooks/useWebRTC';

function ChatRoom({ nickname, onLogout }) {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [roomName, setRoomName] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [joinError, setJoinError] = useState('');

  const messagesEndRef = useRef(null);

  const {
    users,
    isMuted,
    volume,
    speakingUsers,
    toggleMute,
    changeVolume,
    mySocketId,
  } = useWebRTC(roomId);

  // 입장 실패 처리
  useEffect(() => {
    socket.on('join-failed', ({ reason }) => {
      setJoinError(reason);
    });

    socket.on('join-success', ({ roomName: name }) => {
      setRoomName(name);
    });

    // 채팅 메시지 수신
    socket.on('chat-message', (message) => {
      setMessages((prev) => [...prev, message]);
    });

    return () => {
      socket.off('join-failed');
      socket.off('join-success');
      socket.off('chat-message');
    };
  }, []);

  // 메시지 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 방 나가기
  const handleLeave = () => {
    socket.emit('leave-room');
    navigate('/lobby');
  };

  // 메시지 전송
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      socket.emit('chat-message', { message: newMessage.trim() });
      setNewMessage('');
    }
  };

  // 입장 실패 시
  if (joinError) {
    return (
      <div className="connection-status error">
        <h2>입장 실패</h2>
        <p>{joinError}</p>
        <button onClick={() => navigate('/lobby')}>로비로 돌아가기</button>
      </div>
    );
  }

  return (
    <div className="chat-room">
      {/* 헤더 */}
      <div className="chat-room-header">
        <h2>🔊 {roomName || '연결 중...'}</h2>
        <button className="leave-btn" onClick={handleLeave}>
          나가기
        </button>
      </div>

      {/* 참여자 목록 */}
      <div className="user-list">
        <h3>참여자 ({users.length}/5)</h3>
        {users.map((user) => (
          <div
            key={user.socketId}
            className={`user-item ${
              speakingUsers.has(user.socketId) ? 'speaking' : ''
            } ${user.socketId === mySocketId ? 'me' : ''}`}
          >
            <div className="user-avatar">
              {user.nickname.charAt(0).toUpperCase()}
            </div>
            <span className="user-name">
              {user.nickname}
              {user.socketId === mySocketId && ' (나)'}
            </span>
            {speakingUsers.has(user.socketId) && (
              <span className="speaking-indicator">🎙️</span>
            )}
          </div>
        ))}
      </div>

      {/* 오디오 컨트롤 */}
      <div className="audio-controls">
        <button
          className={`mute-btn ${isMuted ? 'muted' : ''}`}
          onClick={toggleMute}
          title={isMuted ? '음소거 해제' : '음소거'}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>

        <div className="volume-control" onClick={(e) => e.stopPropagation()}>
          <span>🔈</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={volume}
            onChange={(e) => changeVolume(parseFloat(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          />
          <span>🔊</span>
        </div>

        <p style={{ color: '#888', fontSize: '0.9rem' }}>
          {isMuted ? '마이크가 꺼져 있습니다' : '마이크가 켜져 있습니다'}
        </p>
      </div>

      {/* 텍스트 채팅 */}
      <div className="text-chat">
        <h3>💬 채팅</h3>

        <div className="messages">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`message ${msg.senderId === mySocketId ? 'mine' : ''}`}
            >
              <div className="message-header">
                <span>{msg.nickname}</span>
                <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="message-content">{msg.message}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input" onSubmit={handleSendMessage}>
          <input
            type="text"
            placeholder="메시지를 입력하세요..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            maxLength={200}
          />
          <button type="submit" disabled={!newMessage.trim()}>
            전송
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatRoom;
