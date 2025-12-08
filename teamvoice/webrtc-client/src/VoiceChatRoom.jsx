// webrtc-client/src/VoiceChatRoom.jsx

import React, { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import { createPeerConnection } from "./webrtc";

// 시그널링 서버 주소
const SOCKET_URL = "http://localhost:5000"; // 서버 포트가 5000이 맞는지 확인

export default function VoiceChatRoom({ roomId }) {
  // socket.io 클라이언트를 ref 로 관리 (state 로 관리하면 클로저 문제 발생 가능)
  const socketRef = useRef(null);

  // RTCPeerConnection 도 ref 로 관리
  const pcRef = useRef(null);

  // 내 마이크 스트림
  const localStreamRef = useRef(null);

  // 상대방 음성을 재생할 audio 태그
  const remoteAudioRef = useRef(null);

  // UI 표시용 상태
  const [isJoined, setIsJoined] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);

  // 1. 컴포넌트 마운트 시 소켓 연결
  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("시그널링 서버 연결 성공(음성):", socket.id);
      socket.emit("join_room", roomId);
      setIsJoined(true);
    });

    // 새 유저가 들어왔을 때 내가 먼저 Offer 전송
    socket.on("user_joined", async (newUserId) => {
      console.log("음성 방 새 유저 입장:", newUserId);
      await createOffer();
    });

    // Offer 수신
    socket.on("offer", async ({ offer, from }) => {
      console.log("음성 Offer 수신 from:", from);
      await handleOffer(offer);
    });

    // Answer 수신
    socket.on("answer", async ({ answer, from }) => {
      9;
      console.log("음성 Answer 수신 from:", from);
      await handleAnswer(answer);
    });

    // ICE 후보 수신
    socket.on("ice_candidate", async ({ candidate, from }) => {
      console.log("음성 ICE 후보 수신 from:", from);
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(candidate);
      } catch (err) {
        console.error("음성 ICE 후보 추가 오류:", err);
      }
    });

    // 언마운트 시 소켓 연결 종료
    return () => {
      socket.disconnect();
    };
  }, [roomId]);

  // 2. 공통 RTCPeerConnection 생성 로직
  const initPeerConnection = () => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn("socket 이 아직 준비되지 않았습니다.");
      return null;
    }

    const pc = createPeerConnection(
      // onTrack: 상대방 음성 스트림 수신 시
      (remoteStream) => {
        console.log("상대방 음성 스트림 수신");
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
      },
      // onIceCandidate: ICE 후보 생성 시 서버로 전송
      (candidate) => {
        console.log("음성 ICE 후보 생성, 서버로 전송");
        socket.emit("ice_candidate", {
          roomId,
          candidate,
          from: socket.id,
        });
      }
    );

    pcRef.current = pc;
    return pc;
  };

  // 3. 마이크 연결 버튼
  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      console.log("마이크 스트림 시작 완료");
      localStreamRef.current = stream;

      let pc = pcRef.current;
      if (!pc) {
        pc = initPeerConnection();
      }
      if (!pc) return;

      // 내 음성 트랙을 peerConnection 에 추가
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      setIsMicOn(true);
    } catch (err) {
      console.error("음성 스트림 시작 오류:", err);
    }
  };

  // 4. Offer 생성 및 전송
  const createOffer = async () => {
    const socket = socketRef.current;
    if (!socket) {
      console.warn("socket 이 아직 없습니다. Offer 생성 불가");
      return;
    }

    let pc = pcRef.current;
    if (!pc) {
      pc = initPeerConnection();
    }
    if (!pc) return;

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("offer", {
        roomId,
        offer,
        from: socket.id,
      });

      console.log("음성 Offer 전송 완료");
    } catch (err) {
      console.error("음성 Offer 생성 오류:", err);
    }
  };

  // 5. Offer 처리 + Answer 생성
  const handleOffer = async (offer) => {
    const socket = socketRef.current;
    if (!socket) return;

    let pc = pcRef.current;
    if (!pc) {
      pc = initPeerConnection();
    }
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("answer", {
        roomId,
        answer,
        from: socket.id,
      });

      console.log("음성 Answer 생성 및 전송 완료");
    } catch (err) {
      console.error("음성 Offer 처리 오류:", err);
    }
  };

  // 6. Answer 처리
  const handleAnswer = async (answer) => {
    let pc = pcRef.current;
    if (!pc) {
      console.warn("pc 가 아직 없어 Answer 를 설정할 수 없습니다.");
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("음성 Answer 설정 완료");
    } catch (err) {
      console.error("음성 Answer 처리 오류:", err);
    }
  };

  return (
    <div>
      <h2>음성 채팅 방: {roomId}</h2>
      <p>방 접속 상태: {isJoined ? "접속 완료" : "접속 중..."}</p>

      <button onClick={startVoice} disabled={isMicOn === true}>
        {isMicOn ? "마이크 연결됨" : "마이크 연결"}
      </button>

      <p style={{ marginTop: "16px" }}>상대방 음성</p>
      <audio ref={remoteAudioRef} autoPlay />
    </div>
  );
}
