import { useState } from "react";
import "./MainPage.css";

function MainPage({ onCreateRoom, onJoinRoom }) {
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

  // 방 생성
  const handleCreateRoom = () => {
    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요!");
      return;
    }

    // 6자리 랜덤 방 코드 생성
    const newRoomCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    onCreateRoom(nickname, newRoomCode);
  };

  // 방 입장
  const handleJoinRoom = () => {
    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요!");
      return;
    }

    if (!roomCode.trim()) {
      alert("방 코드를 입력해주세요!");
      return;
    }

    onJoinRoom(nickname, roomCode);
  };

  return (
    <div className="main-container">
      <div className="main-box">
        <h1>화면 공유 WebRTC</h1>

        <div className="input-section">
          <input
            type="text"
            placeholder="닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="input-field"
          />
        </div>

        <div className="button-section">
          <button onClick={handleCreateRoom} className="btn btn-create">
            방 만들기
          </button>
        </div>

        <div className="divider">
          <span>또는</span>
        </div>

        <div className="input-section">
          <input
            type="text"
            placeholder="방 코드를 입력하세요"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="input-field"
          />
        </div>

        <div className="button-section">
          <button onClick={handleJoinRoom} className="btn btn-join">
            방 입장하기
          </button>
        </div>
      </div>
    </div>
  )import { useState } from "react";
import "./MainPage.css";

// 메인 페이지 컴포넌트 - 방 생성/입장 선택 화면
function MainPage({ onCreateRoom, onJoinRoom }) {
  // 사용자 닉네임 상태
  const [nickname, setNickname] = useState("");
  // 입장할 방 코드 상태
  const [roomCode, setRoomCode] = useState("");

  // 방 생성 핸들러
  const handleCreateRoom = () => {
    // 닉네임 입력 확인
    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요!");
      return;
    }

    // 6자리 랜덤 방 코드 생성 (영문+숫자 대문자)
    // Math.random().toString(36): 0-9, a-z 조합의 랜덤 문자열 생성
    // substring(2, 8): 앞 2자리('0.') 제거, 6자리만 추출
    // toUpperCase(): 대문자로 변환
    const newRoomCode = Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase();

    // 부모 컴포넌트(App.jsx)의 방 생성 함수 호출
    onCreateRoom(nickname, newRoomCode);
  };

  // 방 입장 핸들러
  const handleJoinRoom = () => {
    // 닉네임 입력 확인
    if (!nickname.trim()) {
      alert("닉네임을 입력해주세요!");
      return;
    }

    // 방 코드 입력 확인
    if (!roomCode.trim()) {
      alert("방 코드를 입력해주세요!");
      return;
    }

    // 부모 컴포넌트(App.jsx)의 방 입장 함수 호출
    onJoinRoom(nickname, roomCode);
  };

  return (
    <div className="main-container">
      <div className="main-box">
        {/* 제목 */}
        <h1>화면 공유 WebRTC</h1>

        {/* 닉네임 입력 섹션 */}
        <div className="input-section">
          <input
            type="text"
            placeholder="닉네임을 입력하세요"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)} // 입력값 상태에 저장
            className="input-field"
          />
        </div>

        {/* 방 만들기 버튼 */}
        <div className="button-section">
          <button onClick={handleCreateRoom} className="btn btn-create">
            방 만들기
          </button>
        </div>

        {/* 구분선 */}
        <div className="divider">
          <span>또는</span>
        </div>

        {/* 방 코드 입력 섹션 */}
        <div className="input-section">
          <input
            type="text"
            placeholder="방 코드를 입력하세요"
            value={roomCode}
            // 입력값을 대문자로 변환하여 저장 (방 코드 통일성)
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            className="input-field"
          />
        </div>

        {/* 방 입장하기 버튼 */}
        <div className="button-section">
          <button onClick={handleJoinRoom} className="btn btn-join">
            방 입장하기
          </button>
        </div>
      </div>
    </div>
  );
}

export default MainPage;
}

export default MainPage;
