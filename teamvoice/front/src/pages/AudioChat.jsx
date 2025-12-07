import React, { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { GoArrowLeft } from "react-icons/go";

const SOCKET_SERVER_URL = "http://127.0.0.1:8080";

// STUN/TURN 서버 정보 (P2P 연결 중계 서버)
const iceServers = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

function AudioChat({ roomId = "audioRoom", onExit }) {
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioContextRef = useRef(null);
  const localAnalyserRef = useRef(null);
  const remoteAnalyserRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [isConnected, setIsConnected] = useState(false);
  const [roomStatus, setRoomStatus] = useState("연결 대기 중...");
  const [isSpeaking, setIsSpeaking] = useState(false); // 내가 말하는지
  const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false); // 상대방이 말하는지

  /**
   * 오디오 레벨 분석 설정
   */
  const setupAudioAnalyser = useCallback((stream, isLocal = true) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext(); // Web Audio API 인터페이스
    }

    const audioContext = audioContextRef.current;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    if (isLocal) {
      localAnalyserRef.current = analyser;
    } else {
      remoteAnalyserRef.current = analyser;
    }

    return analyser;
  }, []);

  /**
   * 음성 감지 함수
   */
  const detectVoice = useCallback(() => {
    const checkVolume = (analyser, setterFunction) => {
      if (!analyser) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      // 평균 볼륨 계산
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      // 임계값 (20 이상이면 말하는 것으로 판단)
      const threshold = 20;
      setterFunction(average > threshold);
    };

    const animate = () => {
      checkVolume(localAnalyserRef.current, setIsSpeaking);
      checkVolume(remoteAnalyserRef.current, setIsRemoteSpeaking);
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();
  }, []);

  /**
   * 미디어 스트림 가져오기
   */
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });

      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      localStreamRef.current = stream;

      // 로컬 스트림 분석 시작
      setupAudioAnalyser(stream, true);
      detectVoice();

      return stream;
    } catch (error) {
      console.error("마이크 접근 오류:", error);
      setRoomStatus("마이크 접근 권한이 필요합니다. 🎤🚫");
      return null;
    }
  }, [setupAudioAnalyser, detectVoice]);

  /**
   * RTCPeerConnection 생성
   */
  const createPeerConnection = useCallback(
    (stream) => {
      // 이전에 남아있던 연결 관리자 닫고 초기화
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }

      const pc = new RTCPeerConnection(iceServers); // WebRTC API 인터페이스
      pcRef.current = pc;

      // 음성데이터를 가져와서 RTCPeerConnection에 추가하고, 연결 성공 시 상대방에게 전송될 준비
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      // 상대방 미디어 수신
      pc.ontrack = (event) => {
        console.log("🎵 원격 스트림 수신!");
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];

          // 오디오 재생 시도
          remoteAudioRef.current
            .play()
            .then(() => {
              console.log("✅ 원격 오디오 재생 시작!");
              // 원격 스트림 분석 시작
              setupAudioAnalyser(event.streams[0], false);
            })
            .catch((err) => {
              console.error("❌ 오디오 재생 실패:", err);
              console.log("👉 화면을 클릭하면 재생됩니다!");
            });
        }
      };

      // 연결 정보 교환 준비
      // RTCPeerConnection이 네트워크 주소 정보를 새롭게 발견할 때마다 이벤트 발생
      // 발견된 주소 정보(event.candidate)를 시그널링 서버를 통해 상대방에게 즉시 전달
      // 주소 정보를 교환해야만 두 피어가 서로를 찾고 직접 연결할 수 있음
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          const candidateData = JSON.stringify({
            type: "candidate",
            candidate: event.candidate,
          });
          // ICE Candidate 메시지를 시그널링 서버로 전송
          socketRef.current.emit("rtc-message", candidateData);
        }
      };

      // 연결 상태 체크 후 상태 업데이트
      pc.oniceconnectionstatechange = () => {
        console.log("ICE Connection State:", pc.iceConnectionState);
        if (
          pc.iceConnectionState === "connected" ||
          pc.iceConnectionState === "completed"
        ) {
          setIsConnected(true);
          setRoomStatus("P2P 음성 연결 성공! 🟢");
        } else if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
          setIsConnected(false);
          setRoomStatus("P2P 연결 끊김/실패 🔴");
        }
      };

      return pc;
    },
    [setupAudioAnalyser]
  );

  /**
   * 상대방에게 통신 메시지를 생성하고 상대방에게 전송
   */
  const createOffer = useCallback(async (pc) => {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const offerData = JSON.stringify({
        type: "offer",
        sdp: pc.localDescription,
      });
      socketRef.current.emit("rtc-message", offerData);
      setRoomStatus("Offer 전송됨. Answer 대기 중...");
    } catch (error) {
      console.error("Offer 생성 오류:", error);
    }
  }, []);

  /**
   * 상대방(Offer를 보낸 사람)의 통신 제안을 받고 승낙 메시지를 만들어보냄
   */
  const createAnswer = useCallback(async (pc, offer) => {
    try {
      // 상대방이 보낸 통신 조건을 연결 관리자에게 알려줌
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      const answerData = JSON.stringify({
        type: "answer",
        sdp: pc.localDescription,
      });
      // 시그널링 서버를 통해 상대방에게 전달하여 통신 협상을 완료
      socketRef.current.emit("rtc-message", answerData);
      setRoomStatus("Answer 전송됨.");
    } catch (error) {
      console.error("Answer 생성 오류:", error);
    }
  }, []);

  const handleExitClick = () => {
    if (onExit) onExit();
  };

  useEffect(() => {
    console.log("🔄 useEffect 시작 - roomId:", roomId);

    // SOCKET_SERVER_URL에 서버 연결
    socketRef.current = io(SOCKET_SERVER_URL, {
      transports: ["websocket"],
    });

    console.log("✅ Socket 생성됨");

    const socket = socketRef.current;

    // Socket.IO 연결 시작
    socket.on("connect", () => {
      console.log("🔌 Socket 연결됨:", socketRef.current.id);
      setRoomStatus("서버 연결 성공! 미디어 준비 중...");
    });

    // 마이크 확보후 서버에 roomId로 입장 알림
    const initMedia = async () => {
      const stream = await getLocalStream();

      if (stream) {
        console.log("🎤 미디어 스트림 획득 완료");
        console.log("📤 join 이벤트 emit - roomId:", roomId);
        socket.emit("join", roomId);
        setRoomStatus("방 입장 요청 중...");
      }
    };

    initMedia();

    socket.on("room-full", (fullRoomId) => {
      console.log("⚠️ 방이 가득 찼음:", fullRoomId);
      setRoomStatus(`방 ${fullRoomId}이 가득 찼습니다. 🚫`);
    });

    // 상대방이 들어왔을 경우 통신 시작
    socket.on("ready", () => {
      console.log("🎯 ready 이벤트 수신 - Offer 생성 시작");
      const stream = localStreamRef.current;
      if (stream) {
        const pc = createPeerConnection(stream);
        createOffer(pc);
        setRoomStatus("상대방 입장, Offer 생성 중...");
      }
    });

    // 서버 메세지 처리
    socket.on("rtc-message", async (data) => {
      const message = JSON.parse(data);

      const stream = localStreamRef.current;
      if (!stream) {
        console.error("❌ 로컬 스트림이 없습니다");
        return;
      }

      if (!pcRef.current) {
        console.log("🔧 PeerConnection 생성");
        createPeerConnection(stream);
      }
      const pc = pcRef.current;

      switch (message.type) {
        case "offer":
          console.log("📥 Offer 수신 - Answer 생성");
          await createAnswer(pc, message.sdp);
          break;
        case "answer":
          console.log("📥 Answer 수신");
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          break;
        case "candidate":
          await pc.addIceCandidate(new RTCIceCandidate(message.candidate));
          break;
        default:
          break;
      }
    });

    // 연결 종료
    socket.on("bye", () => {
      console.log("👋 상대방 연결 종료");
      setRoomStatus("상대방이 연결을 종료했습니다. 💔");
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      setIsConnected(false);
    });

    // 컴포넌트가 화면에서 사라지거나 roomId가 바뀔 때, 모든 연결과 자원을 종료 (메모리 누수 방지)
    return () => {
      console.log("🧹 클린업 시작");
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (socket) {
        socket.disconnect();
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [roomId, getLocalStream, createPeerConnection, createOffer, createAnswer]);

  return (
    <>
      <GoArrowLeft
        size={30}
        style={{ cursor: "pointer" }}
        onClick={handleExitClick}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "20px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h2>🎤 WebRTC Audio Chat - Room: {roomId}</h2>
        <p>
          상태: <strong>{roomStatus}</strong>
        </p>

        <div
          style={{
            marginTop: "20px",
            padding: "15px",
            border: "1px solid #ccc",
            borderRadius: "8px",
            textAlign: "center",
            minWidth: "300px",
          }}
        >
          <h3>오디오 상태</h3>
          {isConnected ? (
            <span style={{ color: "green", fontSize: "24px" }}>
              연결 완료! 대화 가능 🟢
            </span>
          ) : (
            <span style={{ color: "red", fontSize: "24px" }}>
              연결 대기 중... 🔴
            </span>
          )}
          <p style={{ marginTop: "10px", color: "#666" }}>
            마이크 접근 허용을 확인하세요.
          </p>
        </div>

        {/* 음성 시각화 */}
        <div
          style={{
            marginTop: "30px",
            display: "flex",
            gap: "40px",
            alignItems: "center",
          }}
        >
          {/* 내 음성 */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                backgroundColor: isSpeaking ? "#4CAF50" : "#e0e0e0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
                transition: "all 0.2s ease",
                transform: isSpeaking ? "scale(1.1)" : "scale(1)",
                boxShadow: isSpeaking
                  ? "0 0 30px rgba(76, 175, 80, 0.6)"
                  : "none",
              }}
            >
              🎤
            </div>
            <p style={{ marginTop: "10px", fontWeight: "bold" }}>
              나 {isSpeaking ? "(말하는 중 🔊)" : ""}
            </p>
          </div>

          {/* 화살표 */}
          <div style={{ fontSize: "32px", color: "#999" }}>⇄</div>

          {/* 상대방 음성 */}
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: "120px",
                height: "120px",
                borderRadius: "50%",
                backgroundColor: isRemoteSpeaking ? "#2196F3" : "#e0e0e0",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "48px",
                transition: "all 0.2s ease",
                transform: isRemoteSpeaking ? "scale(1.1)" : "scale(1)",
                boxShadow: isRemoteSpeaking
                  ? "0 0 30px rgba(33, 150, 243, 0.6)"
                  : "none",
              }}
            >
              👤
            </div>
            <p style={{ marginTop: "10px", fontWeight: "bold" }}>
              상대방 {isRemoteSpeaking ? "(말하는 중 🔊)" : ""}
            </p>
          </div>
        </div>

        {/* 내 목소리 모니터링하여 내가 말하고 있는지 상태 감지 */}
        <audio ref={localAudioRef} autoPlay muted style={{ display: "none" }} />
        {/* 상대방 목소리 재생 (없을 경우 사용자에게 출력되지 않음) */}
        <audio ref={remoteAudioRef} autoPlay style={{ display: "none" }} />
      </div>
    </>
  );
}

export default AudioChat;
