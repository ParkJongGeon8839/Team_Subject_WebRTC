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

function useScreenShare(roomId, users) {
  const [isSharing, setIsSharing] = useState(false); // 내가 화면공유 중인지
  const [sharingUsers, setSharingUsers] = useState(new Set()); // 화면공유 중인 유저들

  const localScreenRef = useRef(null); // 내 화면공유 스트림
  const screenPcsRef = useRef({}); // 화면공유용 PeerConnection { visitorId: pc }
  const remoteScreensRef = useRef({}); // 원격 화면공유 스트림 { visitorId: MediaStream }
  const isSharingRef = useRef(false); // 콜백에서 사용할 ref

  const [remoteScreens, setRemoteScreens] = useState({}); // UI 업데이트용

  // isSharing 상태를 ref에 동기화
  useEffect(() => {
    isSharingRef.current = isSharing;
  }, [isSharing]);

  // PeerConnection 생성 (화면공유용)
  const createScreenPeerConnection = useCallback(
    (userId, isOfferer = false) => {
      // 기존 연결이 있으면 닫기
      if (screenPcsRef.current[userId]) {
        screenPcsRef.current[userId].close();
        delete screenPcsRef.current[userId];
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);

      // ICE Candidate 이벤트
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("screen-ice-candidate", {
            targetId: userId,
            candidate: event.candidate,
          });
        }
      };

      // 상대방 화면 스트림 수신
      pc.ontrack = (event) => {
        console.log(`화면공유 스트림 수신: ${userId}`);
        remoteScreensRef.current[userId] = event.streams[0];
        setRemoteScreens((prev) => ({
          ...prev,
          [userId]: event.streams[0],
        }));
      };

      // 내가 공유 중이고 offerer라면 트랙 추가
      if (isOfferer && localScreenRef.current) {
        localScreenRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localScreenRef.current);
        });
      }

      pc.onconnectionstatechange = () => {
        console.log(`화면공유 연결 상태 (${userId}):`, pc.connectionState);
      };

      screenPcsRef.current[userId] = pc;
      return pc;
    },
    []
  );

  // Offer 생성 (내가 화면공유 시작할 때)
  const createScreenOffer = useCallback(
    async (userId) => {
      if (!localScreenRef.current) return;

      const pc = createScreenPeerConnection(userId, true);

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.emit("screen-offer", {
          targetId: userId,
          sdp: offer,
        });
      } catch (error) {
        console.error("화면공유 Offer 생성 실패:", error);
      }
    },
    [createScreenPeerConnection]
  );

  // Answer 생성 (상대방 화면공유 수신할 때)
  const createScreenAnswer = useCallback(
    async (senderId, sdp) => {
      const pc = createScreenPeerConnection(senderId, false);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("screen-answer", {
          targetId: senderId,
          sdp: answer,
        });
      } catch (error) {
        console.error("화면공유 Answer 생성 실패:", error);
      }
    },
    [createScreenPeerConnection]
  );

  // 화면공유 시작
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false,
      });

      localScreenRef.current = stream;
      console.log(stream);
      setIsSharing(true);

      // 사용자가 브라우저에서 공유 중지 시
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      // 서버에 화면공유 상태 알림
      socket.emit("screen-share-status", { isSharing: true });

      // 방의 다른 유저들에게 Offer 전송
      setTimeout(() => {
        users.forEach((user) => {
          if (user.socketId !== socket.id) {
            createScreenOffer(user.socketId);
          }
        });
      }, 500);
    } catch (error) {
      console.error("화면공유 시작 실패:", error);
    }
  }, [users, createScreenOffer]);

  // 화면공유 중지
  const stopScreenShare = useCallback(() => {
    if (localScreenRef.current) {
      localScreenRef.current.getTracks().forEach((track) => track.stop());
      localScreenRef.current = null;
    }

    // 모든 화면공유 PeerConnection 닫기
    Object.keys(screenPcsRef.current).forEach((userId) => {
      if (screenPcsRef.current[userId]) {
        screenPcsRef.current[userId].close();
        delete screenPcsRef.current[userId];
      }
    });

    setIsSharing(false);
    socket.emit("screen-share-status", { isSharing: false });
  }, []);

  // 특정 유저와의 화면공유 연결 종료
  const closeScreenConnection = useCallback((userId) => {
    if (screenPcsRef.current[userId]) {
      screenPcsRef.current[userId].close();
      delete screenPcsRef.current[userId];
    }
    if (remoteScreensRef.current[userId]) {
      delete remoteScreensRef.current[userId];
      setRemoteScreens((prev) => {
        const newScreens = { ...prev };
        delete newScreens[userId];
        return newScreens;
      });
    }
    setSharingUsers((prev) => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });
  }, []);

  // Socket 이벤트 리스너
  useEffect(() => {
    if (!roomId) return;

    // 기존 리스너 제거
    socket.off("screen-offer");
    socket.off("screen-answer");
    socket.off("screen-ice-candidate");
    socket.off("screen-share-status-changed");
    socket.off("request-screen-offer");

    // 화면공유 Offer 수신
    socket.on("screen-offer", async ({ senderId, senderNickname, sdp }) => {
      console.log(`화면공유 Offer 수신: ${senderNickname}`);
      setSharingUsers((prev) => new Set([...prev, senderId]));
      await createScreenAnswer(senderId, sdp);
    });

    // 화면공유 Answer 수신
    socket.on("screen-answer", async ({ senderId, sdp }) => {
      console.log(`화면공유 Answer 수신: ${senderId}`);
      const pc = screenPcsRef.current[senderId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    // 화면공유 ICE Candidate 수신
    socket.on("screen-ice-candidate", async ({ senderId, candidate }) => {
      const pc = screenPcsRef.current[senderId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error("화면공유 ICE Candidate 추가 실패:", error);
        }
      }
    });

    // 다른 유저의 화면공유 상태 변경
    socket.on(
      "screen-share-status-changed",
      ({ visitorId, isSharing: sharing }) => {
        console.log(`화면공유 상태 변경: ${visitorId} -> ${sharing}`);

        if (sharing) {
          setSharingUsers((prev) => new Set([...prev, visitorId]));
          // 화면공유 시작한 유저에게 Offer 요청
          socket.emit("request-screen-offer", { targetId: visitorId });
        } else {
          closeScreenConnection(visitorId);
        }
      }
    );

    // Offer 요청 수신 (내가 공유 중일 때 새 유저가 입장)
    socket.on("request-screen-offer", ({ requesterId }) => {
      console.log(
        `화면공유 Offer 요청 수신: ${requesterId}, 내 공유상태: ${isSharingRef.current}`
      );
      if (localScreenRef.current && isSharingRef.current) {
        createScreenOffer(requesterId);
      }
    });

    return () => {
      socket.off("screen-offer");
      socket.off("screen-answer");
      socket.off("screen-ice-candidate");
      socket.off("screen-share-status-changed");
      socket.off("request-screen-offer");
    };
  }, [roomId, createScreenAnswer, createScreenOffer, closeScreenConnection]);

  // 유저 퇴장 시 해당 화면공유 연결 정리
  useEffect(() => {
    const currentUserIds = new Set(users.map((u) => u.socketId));

    // 퇴장한 유저의 화면공유 연결 정리
    Object.keys(screenPcsRef.current).forEach((userId) => {
      if (!currentUserIds.has(userId)) {
        closeScreenConnection(userId);
      }
    });
  }, [users, closeScreenConnection]);

  // 입장 시 화면공유 중인 유저 감지 및 요청
  useEffect(() => {
    users.forEach((user) => {
      // 내가 아니고, 화면공유 중이고, 아직 연결 안 된 유저
      if (
        user.socketId !== socket.id &&
        user.isScreenSharing &&
        !screenPcsRef.current[user.socketId]
      ) {
        console.log(`화면공유 중인 유저 발견: ${user.nickname}, 요청 전송`);
        setSharingUsers((prev) => new Set([...prev, user.socketId]));
        socket.emit("request-screen-offer", { targetId: user.socketId });
      }
    });
  }, [users]);

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (localScreenRef.current) {
        localScreenRef.current.getTracks().forEach((track) => track.stop());
      }
      Object.values(screenPcsRef.current).forEach((pc) => pc.close());
    };
  }, []);

  return {
    isSharing,
    sharingUsers,
    localScreen: localScreenRef.current,
    remoteScreens,
    startScreenShare,
    stopScreenShare,
  };
}

export default useScreenShare;
