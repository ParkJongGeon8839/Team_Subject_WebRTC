import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function NicknamePage({ onSetNickname }) {
  const [name, setName] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onSetNickname(name.trim());
      navigate('/lobby');
    }
  };

  return (
    <div className="nickname-page">
      <h1>🎤 Voice Chat</h1>
      <p className="subtitle">실시간 음성 채팅 서비스</p>

      <form className="nickname-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="닉네임을 입력하세요"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoFocus
        />
        <button type="submit" disabled={!name.trim()}>
          참여하기
        </button>
      </form>
    </div>
  );
}

export default NicknamePage;
