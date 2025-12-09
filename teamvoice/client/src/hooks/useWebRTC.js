import { useRef, useEffect, useState, useCallback } from "react";
import socket from "../utils/socket";

const ICE_SERVERS = {
  iceServers: [
    // STUN
    { urls: "stun:stun.l.google.com:19302" },

    // TURN (예시: 직접 운영하는 coturn 서버)
    {
      urls: [
        "turn:your-turn.example.com:3478?transport=udp",
        "turn:your-turn.example.com:3478?transport=tcp",
        // 필요하면 "turns:your-turn.example.com:5349" 같은 TLS 포트도
      ],
      username: "turn-user",
      credential: "turn-pass",
    },
  ],
};

function useWebRTC(roomId) {
  const [users, setUsers] = useState([]); // 방의 유저 목록
  const [isMuted, setIsMuted] = useState(false); // 내 음소거 상태
  const [volume, setVolume] = useState(1); // 전체 볼륨 (UI 렌더링용)
  const [speakingUsers, setSpeakingUsers] = useState(new Set()); // 말하는 중인 유저들

  const localStreamRef = useRef(null); // 내 오디오 스트림
  const peerConnectionsRef = useRef({}); // { visitorId: RTCPeerConnection }
  const remoteAudiosRef = useRef({}); // { visitorId: HTMLAudioElement }
  const audioContextRef = useRef(null); // 음성 레벨 감지용
  const analyserRef = useRef(null);
  const volumeRef = useRef(1); // 볼륨 ref (dependency 방지용)
  const isMutedRef = useRef(false); // 음소거 ref (dependency 방지용)

  // 음성 레벨 감지 설정
  const setupAudioAnalyser = (stream) => {
    audioContextRef.current = new (window.AudioContext ||
      window.webkitAudioContext)();
    analyserRef.current = audioContextRef.current.createAnalyser();
    const source = audioContextRef.current.createMediaStreamSource(stream);
    source.connect(analyserRef.current);
    analyserRef.current.fftSize = 256;

    // 주기적으로 음성 레벨 체크
    const checkAudioLevel = () => {
      if (!analyserRef.current) return;

      // 음성 데이터 가져오기
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

      // 음성 레벨이 일정 이상이면 말하는 중 (ref 사용)
      if (average > 30 && !isMutedRef.current) {
        setSpeakingUsers((prev) => new Set([...prev, socket.id]));
      } else {
        setSpeakingUsers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(socket.id);
          return newSet;
        });
      }

      requestAnimationFrame(checkAudioLevel);
    };
    checkAudioLevel();
  };

  // 오디오 스트림 가져오기
  const getLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;

      // 음성 레벨 감지 설정
      setupAudioAnalyser(stream);

      return stream;
    } catch (error) {
      console.error("마이크 접근 실패:", error);
      alert("마이크 접근 권한이 필요합니다.");
      return null;
    }
  }, []);

  // Peer Connection 생성 (dependency 없음!)
  const createPeerConnection = useCallback((targetId, targetNickname) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // 내 오디오 트랙 추가
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // ICE Candidate 이벤트
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          targetId,
          candidate: event.candidate,
        });
      }
    };

    // 원격 사용자 음성 레벨 감지
    const setupRemoteAudioAnalyser = (stream, visitorId) => {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;

      // 주기적으로 음성 레벨 체크
      const checkLevel = () => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

        if (average > 30) {
          setSpeakingUsers((prev) => new Set([...prev, visitorId]));
        } else {
          setSpeakingUsers((prev) => {
            const newSet = new Set(prev);
            newSet.delete(visitorId);
            return newSet;
          });
        }

        if (peerConnectionsRef.current[visitorId]) {
          requestAnimationFrame(checkLevel);
        }
      };
      checkLevel();
    };

    // 상대방 오디오 스트림 수신
    pc.ontrack = (event) => {
      console.log(`${targetNickname}의 오디오 스트림 수신`);

      // Audio 엘리먼트 생성
      let audio = remoteAudiosRef.current[targetId];
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        remoteAudiosRef.current[targetId] = audio;
      }
      audio.srcObject = event.streams[0];
      audio.volume = volumeRef.current; // ref 사용!

      // 원격 사용자 음성 레벨 감지
      setupRemoteAudioAnalyser(event.streams[0], targetId);
    };

    pc.onconnectionstatechange = () => {
      console.log(`${targetNickname} 연결 상태:`, pc.connectionState);
    };

    peerConnectionsRef.current[targetId] = pc;
    return pc;
  }, []); // dependency 비움!

  // Offer 생성 및 전송
  const createOffer = useCallback(
    async (targetId, targetNickname) => {
      const pc = createPeerConnection(targetId, targetNickname);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("offer", {
          targetId,
          sdp: offer,
        });
      } catch (error) {
        console.error("Offer 생성 실패:", error);
      }
    },
    [createPeerConnection]
  );

  // Answer 생성 및 전송
  const createAnswer = useCallback(
    async (senderId, senderNickname, offer) => {
      const pc = createPeerConnection(senderId, senderNickname);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          targetId: senderId,
          sdp: answer,
        });
      } catch (error) {
        console.error("Answer 생성 실패:", error);
      }
    },
    [createPeerConnection]
  );

  // Peer Connection 정리
  const closePeerConnection = useCallback((visitorId) => {
    if (peerConnectionsRef.current[visitorId]) {
      peerConnectionsRef.current[visitorId].close();
      delete peerConnectionsRef.current[visitorId];
    }
    if (remoteAudiosRef.current[visitorId]) {
      remoteAudiosRef.current[visitorId].srcObject = null;
      delete remoteAudiosRef.current[visitorId];
    }
  }, []);

  // 음소거 토글
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const newMuted = !isMutedRef.current;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !newMuted;
      });
      isMutedRef.current = newMuted;
      setIsMuted(newMuted);
    }
  }, []);

  // 볼륨 조절
  const changeVolume = useCallback((newVolume) => {
    volumeRef.current = newVolume; // ref 업데이트
    setVolume(newVolume); // state 업데이트 (UI용)
    Object.values(remoteAudiosRef.current).forEach((audio) => {
      audio.volume = newVolume;
    });
  }, []);

  // 방 입장 및 이벤트 핸들러 설정
  useEffect(() => {
    // roomId가 없으면 종료
    if (!roomId) return;

    // 기존 이벤트 리스너 제거 (중복 등록 방지)
    socket.off("join-success");
    socket.off("user-joined");
    socket.off("user-left");
    socket.off("offer");
    socket.off("answer");
    socket.off("ice-candidate");

    const init = async () => {
      await getLocalStream();
      socket.emit("join-room", { roomId });
    };

    init();

    // 입장 성공
    socket.on("join-success", ({ users: existingUsers }) => {
      setUsers(existingUsers);

      // 기존 유저들에게 Offer 전송
      existingUsers.forEach((user) => {
        if (user.socketId !== socket.id) {
          createOffer(user.socketId, user.nickname);
        }
      });
    });

    // 새 유저 입장 (중복 체크 추가)
    socket.on("user-joined", ({ socketId, nickname }) => {
      console.log(`${nickname} 입장`);
      setUsers((prev) => {
        // 이미 존재하는 유저인지 확인
        if (prev.some((u) => u.socketId === socketId)) {
          return prev;
        }
        return [...prev, { socketId, nickname }];
      });
    });

    // 유저 퇴장
    socket.on("user-left", ({ socketId, nickname }) => {
      console.log(`${nickname} 퇴장`);
      setUsers((prev) => prev.filter((u) => u.socketId !== socketId));
      closePeerConnection(socketId);
    });

    // Offer 수신 (이미 연결된 경우 무시)
    socket.on("offer", ({ senderId, senderNickname, sdp }) => {
      console.log(`Offer 수신 from ${senderNickname}`);
      // 이미 PeerConnection이 있으면 무시
      if (peerConnectionsRef.current[senderId]) {
        console.log(`이미 ${senderNickname}와 연결됨, offer 무시`);
        return;
      }
      createAnswer(senderId, senderNickname, sdp);
    });

    // Answer 수신
    socket.on("answer", async ({ senderId, sdp }) => {
      console.log(`Answer 수신 from ${senderId}`);
      const pc = peerConnectionsRef.current[senderId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    // ICE Candidate 수신
    socket.on("ice-candidate", async ({ senderId, candidate }) => {
      const pc = peerConnectionsRef.current[senderId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("ICE Candidate 추가 실패:", error);
        }
      }
    });

    // 정리
    return () => {
      // 방 나가기
      socket.emit("leave-room");

      // 모든 Peer Connection 종료
      Object.keys(peerConnectionsRef.current).forEach(closePeerConnection);

      // 로컬 스트림 종료
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      // AudioContext 종료
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      // 이벤트 리스너 정리
      socket.off("join-success");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("offer");
      socket.off("answer");
      socket.off("ice-candidate");
    };
  }, [roomId, getLocalStream, createOffer, createAnswer, closePeerConnection]);

  return {
    users,
    isMuted,
    volume,
    speakingUsers,
    toggleMute,
    changeVolume,
    mySocketId: socket.id,
  };
}

export default useWebRTC;
