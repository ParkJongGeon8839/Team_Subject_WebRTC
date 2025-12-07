import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import socket from './utils/socket';
import NicknamePage from './pages/NicknamePage';
import LobbyPage from './pages/LobbyPage';
import ChatRoom from './pages/ChatRoom';
import './App.css';

function App() {
  const [nickname, setNickname] = useState('');
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // 소켓 연결 이벤트
    socket.on('connect', () => {
      console.log('서버에 연결됨:', socket.id);
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('서버 연결 해제');
      setIsConnected(false);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
    };
  }, []);

  // 닉네임 설정 시 소켓 연결
  const handleSetNickname = (name) => {
    setNickname(name);

    if (!socket.connected) {
      socket.connect();
    }

    // 연결 후 닉네임 전송
    socket.on('connect', () => {
      socket.emit('set-nickname', name);
    });

    // 이미 연결되어 있으면 바로 전송
    if (socket.connected) {
      socket.emit('set-nickname', name);
    }
  };

  // 로그아웃 (닉네임 초기화)
  const handleLogout = () => {
    setNickname('');
    if (socket.connected) {
      socket.disconnect();
    }
  };

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route
            path="/"
            element={
              nickname ? (
                <Navigate to="/lobby" replace />
              ) : (
                <NicknamePage onSetNickname={handleSetNickname} />
              )
            }
          />
          <Route
            path="/lobby"
            element={
              nickname ? (
                <LobbyPage nickname={nickname} onLogout={handleLogout} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/room/:roomId"
            element={
              nickname ? (
                <ChatRoom nickname={nickname} onLogout={handleLogout} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
