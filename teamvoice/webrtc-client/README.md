# WebRTC 기반 음성 채팅 서비스 (React + Node.js)

## 1. 프로젝트 개요

이 프로젝트는 WebRTC(Web Real-Time Communication) 기술을 활용하여, 브라우저 간 실시간 음성 통신을 제공하는 서비스입니다.  
프론트엔드는 React + Vite 기반으로 구성하였고, 시그널링(Signaling) 서버는 Node.js + Express + Socket.IO로 구현했습니다.

## 2. 주요 기능

1. 실시간 음성 채팅

   - `getUserMedia()`를 이용해 브라우저 내 마이크 입력을 스트림으로 확보
   - `RTCPeerConnection`을 통해 브라우저 간 P2P 음성 데이터 전송

2. WebRTC 시그널링 구조

   - Socket.IO를 이용해 Offer, Answer, ICE Candidate를 교환
   - 동일한 Room ID 기준으로 사용자를 매칭하여 1:1 음성 채팅 연결

3. 개발 편의 기능
   - 서버: `nodemon`을 활용한 자동 재시작
   - 루트 스크립트: `concurrently`를 이용해 서버와 클라이언트를 동시에 실행

## 3. 기술 스택

### Frontend (webrtc-client)

- React
- Vite
- Socket.IO Client
- WebRTC
  - MediaDevices.getUserMedia
  - RTCPeerConnection
  - ICE Candidate 처리

### Backend (server)

- Node.js
- Express
- Socket.IO

### 개발 유틸

- nodemon
- concurrently

## 4. 폴더 구조

```text
WebRTC/
│
├─ server/                 # 시그널링 서버 (Node.js + Socket.IO)
│   ├─ index.js
│   ├─ package.json
│   └─ ...
│
├─ webrtc-client/          # 프론트엔드 (React + Vite)
│   ├─ src/
│   │   ├─ App.jsx
│   │   ├─ main.jsx
│   │   ├─ webrtc.js
│   │   ├─ VoiceChatRoom.jsx
│   │   └─ App.css
│   ├─ index.html
│   ├─ package.json
│   └─ ...
│
└─ package.json            # 루트 스크립트 (동시 실행용)


# 루트로 이동
cd WebRTC

# 서버 의존성 설치
cd server
npm install

# 클라이언트 의존성 설치
cd ../webrtc-client
npm install

# 루트(dev 스크립트용) 의존성 설치
cd ..
npm install

# 루트에서 서버와 클라이언트를 동시에 실행:
cd WebRTC
npm run dev

실행 후 접속 주소:

프론트엔드: http://localhost:5173

시그널링 서버: http://localhost:5000
 (Socket.IO)

 서버만 단독으로 실행하려면:

cd server
npm run dev

클라이언트만 단독으로 실행하려면:

cd webrtc-client
npm run dev

6. 사용 방법 (테스트 시나리오)

크롬 브라우저 창을 두 개 실행한다.

두 브라우저 모두 http://localhost:5173에 접속한다.

동일한 Room ID(예: 1235)를 입력한 뒤, 입장 버튼을 눌러 같은 방에 접속한다.

각 화면에서 마이크 연결 버튼을 클릭하고, 브라우저의 마이크 사용 권한을 허용한다.

한쪽에서 말하면 다른 창에서 음성이 재생되는지 확인한다.

서버 터미널에서는 다음과 같은 로그로 방 입장 여부를 확인할 수 있다.
시그널링 서버가 5000 포트에서 실행 중
클라이언트 접속: ...
소켓 ...가 방 1235에 입장

7. 주요 코드 설명
7-1. server/index.js

Express와 HTTP 서버를 생성하고 Socket.IO 서버를 붙여 시그널링 서버 역할 수행

클라이언트가 특정 Room ID로 join_room 이벤트를 보내면 해당 방에 참가시킴

WebRTC 연결에 필요한 Offer, Answer, ICE Candidate를 동일 방의 상대 클라이언트에게 전달

핵심 이벤트:

join_room: 방 참가 처리, 다른 참가자에게 user_joined 알림

offer: WebRTC Offer를 상대방에게 중계

answer: WebRTC Answer를 상대방에게 중계

ice_candidate: ICE 후보를 상대방에게 중계

7-2. webrtc-client/src/webrtc.js

RTCPeerConnection 생성 유틸 함수 정의

STUN 서버 설정 및 ontrack, onicecandidate 이벤트 핸들러를 인자로 받도록 구성

WebRTC 공통 로직을 분리하여 음성 채팅 컴포넌트에서 재사용 가능하게 구현

7-3. webrtc-client/src/VoiceChatRoom.jsx

음성 채팅 전용 React 컴포넌트

Socket.IO 클라이언트를 통해 시그널링 서버와 연결

navigator.mediaDevices.getUserMedia({ audio: true })로 마이크 스트림 확보

스트림의 오디오 트랙을 RTCPeerConnection에 추가하여 P2P 전송

상대방의 오디오 스트림을 수신하면 <audio> 요소에 연결하여 재생

주요 동작 순서:

컴포넌트 마운트 시 Socket.IO로 시그널링 서버 연결 및 방 입장

새 사용자가 방에 들어오면 Offer 생성 및 전송

Offer/Answer/ICE Candidate를 주고받으며 RTCPeerConnection 연결

상대방 음성 스트림 수신 후 <audio> 요소에 연결

7-4. webrtc-client/src/App.jsx

화면 상단에서 Room ID를 입력받고, 방에 입장한 후 VoiceChatRoom 컴포넌트를 렌더링

사용자가 선택한 Room ID를 상태로 관리하며, 동일 방에 입장한 사용자끼리 음성 채팅 가능

8. 향후 확장 가능 항목

화면 공유 기능 추가 (getDisplayMedia)

1:N 또는 다자간 음성 회의 구조 확장

사용자 목록, 음소거 기능, 접속 상태 표시 UI 추가

TURN 서버 도입을 통한 NAT 환경에서의 통신 안정성 강화
```
