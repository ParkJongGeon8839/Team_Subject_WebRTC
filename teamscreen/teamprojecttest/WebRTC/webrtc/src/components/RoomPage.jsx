import { useState, useEffect, useRef } from "react";
import "./RoomPage.css";

function RoomPage({ socket, roomId, nickname, initialUsersRef }) {
  const [isSharing, setIsSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [users, setUsers] = useState([{ id: "me", nickname: nickname }]);

  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const localStreamRef = useRef(null);
  const pcsRef = useRef({});

  const pc_config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  const retryAction = (action) => {
    setTimeout(action, 1000);
    setTimeout(action, 2000);
    setTimeout(action, 3000);
  };

  useEffect(() => {
    if (!socket) return;

    const initialUsers = initialUsersRef?.current || [];
    if (initialUsers.length > 0) {
      setUsers((prev) => {
        const existingIds = new Set(prev.map((u) => u.id));
        const newUsers = initialUsers.filter((u) => !existingIds.has(u.id));
        if (newUsers.length === 0) return prev;
        return [...prev, ...newUsers];
      });

      retryAction(() => {
        initialUsers.forEach((user) => {
          if (user.isSharing) {
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          }
        });
      });

      initialUsersRef.current = [];
    }

    socket.on("all_users", (allUsers) => {
      setUsers((prev) => {
        const existingIds = new Set(prev.map((u) => u.id));
        const newUsers = allUsers.filter((u) => !existingIds.has(u.id));
        if (newUsers.length === 0) return prev;
        return [...prev, ...newUsers];
      });

      retryAction(() => {
        allUsers.forEach((user) => {
          if (user.isSharing) {
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          }
        });
      });
    });

    socket.on("user_joined", (user) => {
      setUsers((prev) => {
        if (prev.some((u) => u.id === user.id)) return prev;
        return [...prev, user];
      });

      if (localStreamRef.current && isSharing) {
        retryAction(() => {
          if (localStreamRef.current && isSharing) {
            createOffer(user.id);
          }
        });
      }
    });

    socket.on("getOffer", async (data) => {
      const { sdp, offerSendId } = data;
      await createAnswer(sdp, offerSendId);
    });

    socket.on("getAnswer", async (data) => {
      const { sdp, answerSendId } = data;
      const pc = pcsRef.current[answerSendId];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    socket.on("getCandidate", async (data) => {
      const { candidate, candidateSendId } = data;
      const pc = pcsRef.current[candidateSendId];
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on("user_exit", (data) => {
      setUsers((prev) => prev.filter((user) => user.id !== data.id));
      if (pcsRef.current[data.id]) {
        pcsRef.current[data.id].close();
        delete pcsRef.current[data.id];
      }
      if (remoteVideosRef.current[data.id]) {
        delete remoteVideosRef.current[data.id];
      }
    });

    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    socket.on("user_screen_share_status", (data) => {
      setUsers((prev) =>
        prev.map((user) =>
          user.id === data.userId
            ? { ...user, isSharing: data.isSharing }
            : user
        )
      );

      if (data.isSharing) {
        retryAction(() => {
          socket.emit("request_offer", {
            targetId: data.userId,
            requesterNickname: nickname,
          });
        });
      } else {
        if (pcsRef.current[data.userId]) {
          pcsRef.current[data.userId].close();
          delete pcsRef.current[data.userId];
        }
        if (remoteVideosRef.current[data.userId]) {
          remoteVideosRef.current[data.userId].srcObject = null;
        }
      }
    });

    socket.on("request_offer", (data) => {
      if (localStreamRef.current && isSharing) {
        retryAction(() => {
          if (localStreamRef.current && isSharing) {
            createOffer(data.requesterId);
          }
        });
      }
    });

    return () => {
      socket.off("all_users");
      socket.off("user_joined");
      socket.off("getOffer");
      socket.off("getAnswer");
      socket.off("getCandidate");
      socket.off("user_exit");
      socket.off("receive_message");
      socket.off("user_screen_share_status");
      socket.off("request_offer");
    };
  }, [socket, nickname, isSharing, roomId, initialUsersRef]);

  const createPeerConnection = (userId) => {
    const pc = new RTCPeerConnection(pc_config);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit("candidate", {
          candidate: e.candidate,
          candidateReceiveId: userId,
        });
      }
    };

    pc.ontrack = (e) => {
      if (remoteVideosRef.current[userId]) {
        remoteVideosRef.current[userId].srcObject = e.streams[0];
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    pcsRef.current[userId] = pc;
    return pc;
  };

  const createOffer = async (userId) => {
    if (pcsRef.current[userId]) {
      pcsRef.current[userId].close();
      delete pcsRef.current[userId];
    }

    if (!localStreamRef.current) return;

    const pc = createPeerConnection(userId);
    if (!pc) return;

    const sdp = await pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false,
    });

    await pc.setLocalDescription(sdp);

    socket.emit("offer", {
      sdp: sdp,
      offerReceiveId: userId,
      offerSendNickname: nickname,
    });
  };

  const createAnswer = async (sdp, userId) => {
    if (pcsRef.current[userId]) {
      pcsRef.current[userId].close();
      delete pcsRef.current[userId];
    }

    const pc = createPeerConnection(userId);
    if (!pc) return;

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answerSdp = await pc.createAnswer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: false,
    });

    await pc.setLocalDescription(answerSdp);

    socket.emit("answer", {
      sdp: answerSdp,
      answerReceiveId: userId,
    });
  };

  const toggleScreenShare = async () => {
    if (!isSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false,
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };

        setIsSharing(true);
        socket.emit("screen_share_status", { isSharing: true });

        setTimeout(() => {
          users.forEach((user) => {
            if (user.id !== "me") {
              createOffer(user.id);
            }
          });
        }, 500);
      } catch (error) {
        console.error("Screen share error:", error);
        alert("화면 공유를 시작할 수 없습니다.");
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    Object.keys(pcsRef.current).forEach((userId) => {
      if (pcsRef.current[userId]) {
        pcsRef.current[userId].close();
        delete pcsRef.current[userId];
      }
    });

    setIsSharing(false);
    socket.emit("screen_share_status", { isSharing: false });

    setTimeout(() => {
      users.forEach((user) => {
        if (user.id !== "me" && user.isSharing) {
          retryAction(() => {
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          });
        }
      });
    }, 500);
  };

  const sendMessage = () => {
    if (!inputMessage.trim()) return;
    socket.emit("send_message", { message: inputMessage });
    setInputMessage("");
  };

  const leaveRoom = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    socket.disconnect();
    window.location.reload();
  };

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

  return (
    <div className="room-container">
      <div className="room-header">
        <div className="room-info">
          <h2>Room: {roomId}</h2>
          <span>닉네임: {nickname}</span>
        </div>
        <button onClick={leaveRoom} className="btn-leave">
          방 나가기
        </button>
      </div>

      <div className="room-content">
        <div className="video-section">
          <div className="video-grid">
            <div className="video-box">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="video-element"
                onClick={(e) => toggleFullScreen(e.target)}
              />
              <div className="video-label">
                나 ({nickname}) {isSharing && "- 공유 중"}
              </div>
            </div>

            {users
              .filter((user) => user.id !== "me")
              .map((user) => (
                <div key={user.id} className="video-box">
                  <video
                    ref={(el) => {
                      if (el) remoteVideosRef.current[user.id] = el;
                    }}
                    autoPlay
                    playsInline
                    className="video-element"
                    onClick={(e) => toggleFullScreen(e.target)}
                  />
                  <div className="video-label">
                    {user.nickname} {user.isSharing && "- 공유 중"}
                  </div>
                </div>
              ))}
          </div>

          <div className="controls">
            <button
              onClick={toggleScreenShare}
              className={`btn-control ${isSharing ? "sharing" : ""}`}
            >
              {isSharing ? "화면 공유 중지" : "화면 공유 시작"}
            </button>
          </div>
        </div>

        <div className="chat-section">
          <div className="chat-header">
            <h3>채팅</h3>
          </div>
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className="chat-message">
                <strong>{msg.nickname}</strong>
                <span className="chat-time">{msg.timestamp}</span>
                <p>{msg.message}</p>
              </div>
            ))}
          </div>
          <div className="chat-input">
            <input
              type="text"
              placeholder="메시지를 입력하세요..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={sendMessage}>전송</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomPage;import { useState, useEffect, useRef } from "react";
import "./RoomPage.css";

// 화면 공유 및 채팅 방 페이지 컴포넌트
function RoomPage({ socket, roomId, nickname, initialUsersRef }) {
  // === 상태 관리 ===
  // 내가 화면 공유 중인지 여부
  const [isSharing, setIsSharing] = useState(false);
  // 채팅 메시지 목록
  const [messages, setMessages] = useState([]);
  // 채팅 입력 중인 메시지
  const [inputMessage, setInputMessage] = useState("");
  // 방에 있는 유저 목록 (나 포함)
  const [users, setUsers] = useState([{ id: "me", nickname: nickname }]);

  // === Ref 관리 (리렌더링 없이 값 유지) ===
  // 내 화면 공유 비디오 엘리먼트 참조
  const localVideoRef = useRef(null);
  // 다른 사용자들의 비디오 엘리먼트 참조 { userId: videoElement }
  const remoteVideosRef = useRef({});
  // 내 화면 공유 스트림 (MediaStream)
  const localStreamRef = useRef(null);
  // 각 사용자와의 WebRTC Peer Connection 객체 { userId: RTCPeerConnection }
  const pcsRef = useRef({});

  // === WebRTC 설정 ===
  // STUN 서버 설정 (NAT 통과를 위한 공인 IP 확인용)
  const pc_config = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  };

  // === 유틸 함수 ===
  // 연결이 불안정할 때를 대비해 1초, 2초, 3초 후 3번 재시도하는 함수
  const retryAction = (action) => {
    setTimeout(action, 1000);
    setTimeout(action, 2000);
    setTimeout(action, 3000);
  };

  // === Socket.io 이벤트 리스너 설정 ===
  useEffect(() => {
    if (!socket) return;

    // 1. 초기 유저 목록 처리 (방 입장 시 App.jsx에서 받은 기존 유저들)
    const initialUsers = initialUsersRef?.current || [];
    if (initialUsers.length > 0) {
      // 중복되지 않은 새 유저만 추가
      setUsers((prev) => {
        const existingIds = new Set(prev.map((u) => u.id));
        const newUsers = initialUsers.filter((u) => !existingIds.has(u.id));
        if (newUsers.length === 0) return prev;
        return [...prev, ...newUsers];
      });

      // 화면 공유 중인 유저들에게 offer 요청 (3번 재시도)
      retryAction(() => {
        initialUsers.forEach((user) => {
          if (user.isSharing) {
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          }
        });
      });

      // 중복 처리 방지를 위해 초기화
      initialUsersRef.current = [];
    }

    // 2. 기존 유저 목록 받기 (혹시 모를 중복 이벤트 처리)
    socket.on("all_users", (allUsers) => {
      // 중복되지 않은 새 유저만 추가
      setUsers((prev) => {
        const existingIds = new Set(prev.map((u) => u.id));
        const newUsers = allUsers.filter((u) => !existingIds.has(u.id));
        if (newUsers.length === 0) return prev;
        return [...prev, ...newUsers];
      });

      // 화면 공유 중인 유저들에게 offer 요청 (3번 재시도)
      retryAction(() => {
        allUsers.forEach((user) => {
          if (user.isSharing) {
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          }
        });
      });
    });

    // 3. 새 유저 입장 알림
    socket.on("user_joined", (user) => {
      // 중복 체크 후 유저 목록에 추가
      setUsers((prev) => {
        if (prev.some((u) => u.id === user.id)) return prev;
        return [...prev, user];
      });

      // 내가 화면 공유 중이면 새 유저에게 offer 전송 (3번 재시도)
      if (localStreamRef.current && isSharing) {
        retryAction(() => {
          if (localStreamRef.current && isSharing) {
            createOffer(user.id);
          }
        });
      }
    });

    // 4. WebRTC Offer 받기 (상대방이 화면 공유 시작)
    socket.on("getOffer", async (data) => {
      const { sdp, offerSendId } = data;
      // Answer 생성해서 응답
      await createAnswer(sdp, offerSendId);
    });

    // 5. WebRTC Answer 받기 (내가 보낸 Offer에 대한 응답)
    socket.on("getAnswer", async (data) => {
      const { sdp, answerSendId } = data;
      const pc = pcsRef.current[answerSendId];
      if (pc) {
        // 상대방의 SDP 정보 설정
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      }
    });

    // 6. ICE Candidate 받기 (네트워크 연결 정보)
    socket.on("getCandidate", async (data) => {
      const { candidate, candidateSendId } = data;
      const pc = pcsRef.current[candidateSendId];
      if (pc && candidate) {
        // ICE Candidate 추가 (P2P 연결 설정)
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // 7. 유저 퇴장 처리
    socket.on("user_exit", (data) => {
      // 유저 목록에서 제거
      setUsers((prev) => prev.filter((user) => user.id !== data.id));
      // 해당 유저와의 Peer Connection 종료
      if (pcsRef.current[data.id]) {
        pcsRef.current[data.id].close();
        delete pcsRef.current[data.id];
      }
      // 비디오 엘리먼트 참조 제거
      if (remoteVideosRef.current[data.id]) {
        delete remoteVideosRef.current[data.id];
      }
    });

    // 8. 채팅 메시지 받기
    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    // 9. 다른 유저의 화면 공유 상태 변경
    socket.on("user_screen_share_status", (data) => {
      // 해당 유저의 isSharing 상태 업데이트
      setUsers((prev) =>
        prev.map((user) =>
          user.id === data.userId
            ? { ...user, isSharing: data.isSharing }
            : user
        )
      );

      if (data.isSharing) {
        // 화면 공유 시작 시 offer 요청 (3번 재시도)
        retryAction(() => {
          socket.emit("request_offer", {
            targetId: data.userId,
            requesterNickname: nickname,
          });
        });
      } else {
        // 화면 공유 중지 시 해당 연결 종료
        if (pcsRef.current[data.userId]) {
          pcsRef.current[data.userId].close();
          delete pcsRef.current[data.userId];
        }
        // 비디오 스트림 제거
        if (remoteVideosRef.current[data.userId]) {
          remoteVideosRef.current[data.userId].srcObject = null;
        }
      }
    });

    // 10. Offer 요청 받기 (상대방이 내 화면을 보고 싶어함)
    socket.on("request_offer", (data) => {
      // 내가 화면 공유 중이면 offer 전송 (3번 재시도)
      if (localStreamRef.current && isSharing) {
        retryAction(() => {
          if (localStreamRef.current && isSharing) {
            createOffer(data.requesterId);
          }
        });
      }
    });

    // 컴포넌트 언마운트 시 모든 이벤트 리스너 제거
    return () => {
      socket.off("all_users");
      socket.off("user_joined");
      socket.off("getOffer");
      socket.off("getAnswer");
      socket.off("getCandidate");
      socket.off("user_exit");
      socket.off("receive_message");
      socket.off("user_screen_share_status");
      socket.off("request_offer");
    };
  }, [socket, nickname, isSharing, roomId, initialUsersRef]);

  // === WebRTC Peer Connection 생성 ===
  const createPeerConnection = (userId) => {
    // RTCPeerConnection 객체 생성 (WebRTC 연결 관리)
    const pc = new RTCPeerConnection(pc_config);

    // ICE Candidate 이벤트 (네트워크 연결 정보 생성 시)
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        // 상대방에게 ICE Candidate 전송
        socket.emit("candidate", {
          candidate: e.candidate,
          candidateReceiveId: userId,
        });
      }
    };

    // Track 이벤트 (상대방의 스트림 수신 시)
    pc.ontrack = (e) => {
      if (remoteVideosRef.current[userId]) {
        // 받은 스트림을 비디오 엘리먼트에 연결
        remoteVideosRef.current[userId].srcObject = e.streams[0];
      }
    };

    // 내 화면 공유 스트림이 있으면 Peer Connection에 추가
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Peer Connection 저장
    pcsRef.current[userId] = pc;
    return pc;
  };

  // === Offer 생성 (내가 화면 공유를 시작하거나 상대방이 요청할 때) ===
  const createOffer = async (userId) => {
    // 기존 연결이 있으면 닫기 (재연결 방지)
    if (pcsRef.current[userId]) {
      pcsRef.current[userId].close();
      delete pcsRef.current[userId];
    }

    // 로컬 스트림이 없으면 종료
    if (!localStreamRef.current) return;

    // Peer Connection 생성
    const pc = createPeerConnection(userId);
    if (!pc) return;

    // Offer SDP 생성 (연결 제안)
    const sdp = await pc.createOffer({
      offerToReceiveVideo: true, // 비디오 수신 가능
      offerToReceiveAudio: false, // 오디오 수신 불가 (화면 공유만)
    });

    // 로컬 Description 설정
    await pc.setLocalDescription(sdp);

    // 서버를 통해 상대방에게 Offer 전송
    socket.emit("offer", {
      sdp: sdp,
      offerReceiveId: userId,
      offerSendNickname: nickname,
    });
  };

  // === Answer 생성 (상대방의 Offer에 응답) ===
  const createAnswer = async (sdp, userId) => {
    // 기존 연결이 있으면 닫기
    if (pcsRef.current[userId]) {
      pcsRef.current[userId].close();
      delete pcsRef.current[userId];
    }

    // Peer Connection 생성
    const pc = createPeerConnection(userId);
    if (!pc) return;

    // 상대방의 Offer SDP 설정
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    // Answer SDP 생성 (연결 응답)
    const answerSdp = await pc.createAnswer({
      offerToReceiveVideo: true, // 비디오 수신 가능
      offerToReceiveAudio: false, // 오디오 수신 불가
    });

    // 로컬 Description 설정
    await pc.setLocalDescription(answerSdp);

    // 서버를 통해 상대방에게 Answer 전송
    socket.emit("answer", {
      sdp: answerSdp,
      answerReceiveId: userId,
    });
  };

  // === 화면 공유 시작/중지 토글 ===
  const toggleScreenShare = async () => {
    if (!isSharing) {
      try {
        // 화면 공유 스트림 요청 (브라우저 화면 선택 팝업)
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" }, // 커서도 함께 공유
          audio: false, // 오디오는 공유하지 않음
        });

        // 스트림 저장
        localStreamRef.current = stream;
        // 내 비디오 엘리먼트에 스트림 연결
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 사용자가 브라우저의 공유 중지 버튼을 누르면 자동으로 중지
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };

        // 화면 공유 상태 업데이트
        setIsSharing(true);
        // 다른 사용자들에게 화면 공유 상태 알림
        socket.emit("screen_share_status", { isSharing: true });

        // 기존 유저들에게 Offer 전송 (0.5초 후)
        setTimeout(() => {
          users.forEach((user) => {
            if (user.id !== "me") {
              createOffer(user.id);
            }
          });
        }, 500);
      } catch (error) {
        console.error("Screen share error:", error);
        alert("화면 공유를 시작할 수 없습니다.");
      }
    } else {
      // 화면 공유 중지
      stopScreenShare();
    }
  };

  // === 화면 공유 중지 ===
  const stopScreenShare = () => {
    // 로컬 스트림의 모든 트랙 중지
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // 내 비디오 엘리먼트 스트림 제거
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // 모든 Peer Connection 닫기
    Object.keys(pcsRef.current).forEach((userId) => {
      if (pcsRef.current[userId]) {
        pcsRef.current[userId].close();
        delete pcsRef.current[userId];
      }
    });

    // 화면 공유 상태 업데이트
    setIsSharing(false);
    // 다른 사용자들에게 화면 공유 중지 알림
    socket.emit("screen_share_status", { isSharing: false });

    // 다른 사람이 여전히 화면 공유 중이면 다시 연결 요청 (0.5초 후)
    setTimeout(() => {
      users.forEach((user) => {
        if (user.id !== "me" && user.isSharing) {
          // 3번 재시도
          retryAction(() => {
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          });
        }
      });
    }, 500);
  };

  // === 채팅 메시지 전송 ===
  const sendMessage = () => {
    if (!inputMessage.trim()) return; // 빈 메시지 방지
    socket.emit("send_message", { message: inputMessage });
    setInputMessage(""); // 입력창 초기화
  };

  // === 방 나가기 ===
  const leaveRoom = () => {
    // 화면 공유 중이면 스트림 중지
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    // 모든 Peer Connection 종료
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    // Socket 연결 종료
    socket.disconnect();
    // 페이지 새로고침 (메인 페이지로 돌아감)
    window.location.reload();
  };

  // === 비디오 전체화면 토글 ===
  const toggleFullScreen = (videoElement) => {
    if (!videoElement) return;

    if (!document.fullscreenElement) {
      // 전체화면 진입
      videoElement.requestFullscreen().catch((err) => {
        console.error("전체화면 오류:", err);
      });
    } else {
      // 전체화면 종료
      document.exitFullscreen();
    }
  };

  return (
    <div className="room-container">
      {/* 방 헤더 (방 정보 및 나가기 버튼) */}
      <div className="room-header">
        <div className="room-info">
          <h2>Room: {roomId}</h2>
          <span>닉네임: {nickname}</span>
        </div>
        <button onClick={leaveRoom} className="btn-leave">
          방 나가기
        </button>
      </div>

      <div className="room-content">
        {/* 비디오 섹션 */}
        <div className="video-section">
          <div className="video-grid">
            {/* 내 화면 */}
            <div className="video-box">
              <video
                ref={localVideoRef}
                autoPlay
                muted // 내 소리는 음소거
                playsInline
                className="video-element"
                onClick={(e) => toggleFullScreen(e.target)} // 클릭 시 전체화면
              />
              <div className="video-label">
                나 ({nickname}) {isSharing && "- 공유 중"}
              </div>
            </div>

            {/* 다른 사용자들 화면 */}
            {users
              .filter((user) => user.id !== "me") // 나를 제외한 유저들
              .map((user) => (
                <div key={user.id} className="video-box">
                  <video
                    ref={(el) => {
                      // 비디오 엘리먼트 참조 저장
                      if (el) remoteVideosRef.current[user.id] = el;
                    }}
                    autoPlay
                    playsInline
                    className="video-element"
                    onClick={(e) => toggleFullScreen(e.target)} // 클릭 시 전체화면
                  />
                  <div className="video-label">
                    {user.nickname} {user.isSharing && "- 공유 중"}
                  </div>
                </div>
              ))}
          </div>

          {/* 화면 공유 제어 버튼 */}
          <div className="controls">
            <button
              onClick={toggleScreenShare}
              className={`btn-control ${isSharing ? "sharing" : ""}`}
            >
              {isSharing ? "화면 공유 중지" : "화면 공유 시작"}
            </button>
          </div>
        </div>

        {/* 채팅 섹션 */}
        <div className="chat-section">
          <div className="chat-header">
            <h3>채팅</h3>
          </div>
          {/* 채팅 메시지 목록 */}
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className="chat-message">
                <strong>{msg.nickname}</strong>
                <span className="chat-time">{msg.timestamp}</span>
                <p>{msg.message}</p>
              </div>
            ))}
          </div>
          {/* 채팅 입력창 */}
          <div className="chat-input">
            <input
              type="text"
              placeholder="메시지를 입력하세요..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && sendMessage()} // 엔터 키로 전송
            />
            <button onClick={sendMessage}>전송</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RoomPage;