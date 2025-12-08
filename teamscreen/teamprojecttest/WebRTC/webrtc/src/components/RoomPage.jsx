import { useState, useEffect, useRef } from "react";
import "./RoomPage.css";

function RoomPage({ socket, roomId, nickname, initialUsersRef }) {
  const [pcs, setPcs] = useState({});
  const [isSharing, setIsSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [users, setUsers] = useState([{ id: "me", nickname: nickname }]);

  const localVideoRef = useRef(null);
  const remoteVideosRef = useRef({});
  const localStreamRef = useRef(null);
  const pcsRef = useRef({});

  const pc_config = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  };

  useEffect(() => {
    if (!socket) {
      console.log("⚠️ Socket is null, returning...");
      return;
    }

    console.log("✅ Setting up socket listeners for room:", roomId);

    // initialUsersRef에서 유저 목록 가져오기
    const initialUsers = initialUsersRef?.current || [];
    console.log("📥 Initial users from ref:", initialUsers);

    // initialUsers가 있으면 즉시 처리 (한 번만)
    if (initialUsers && initialUsers.length > 0) {
      console.log("=== PROCESSING INITIAL USERS ===");
      console.log("📋 Number of users:", initialUsers.length);
      console.log("📋 Users list:", initialUsers);

      setUsers((prev) => {
        console.log("Current users before adding:", prev);

        // 중복 체크: 이미 있는 유저는 추가하지 않음
        const existingIds = new Set(prev.map((u) => u.id));
        const newUsersToAdd = initialUsers.filter(
          (u) => !existingIds.has(u.id)
        );

        if (newUsersToAdd.length === 0) {
          console.log("ℹ️ All users already added, skipping");
          return prev;
        }

        const newUsers = [...prev, ...newUsersToAdd];
        console.log("Current users after adding:", newUsers);
        return newUsers;
      });

      // 화면 공유 중인 유저들에게 offer 요청
      const requestOffers = () => {
        initialUsers.forEach((user) => {
          if (user.isSharing) {
            console.log(
              `🎯 User ${user.id} (${user.nickname}) is sharing, requesting offer`
            );
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          } else {
            console.log(`ℹ️ User ${user.id} (${user.nickname}) is NOT sharing`);
          }
        });
      };

      // 1초, 2초, 3초 후 3번 요청
      setTimeout(requestOffers, 1000);
      setTimeout(requestOffers, 2000);
      setTimeout(requestOffers, 3000);

      // initialUsersRef 초기화하여 중복 실행 방지
      initialUsersRef.current = [];
    }

    // 기존 유저들 정보 받기 (혹시 모를 경우를 위해 리스너 유지)
    socket.on("all_users", (allUsers) => {
      console.log("=== ALL USERS RECEIVED (from socket event) ===");
      console.log("📋 Number of users:", allUsers.length);
      console.log("📋 Users list:", allUsers);

      setUsers((prev) => {
        console.log("Current users before adding:", prev);

        // 중복 체크
        const existingIds = new Set(prev.map((u) => u.id));
        const newUsersToAdd = allUsers.filter((u) => !existingIds.has(u.id));

        if (newUsersToAdd.length === 0) {
          console.log("ℹ️ All users already added, skipping");
          return prev;
        }

        const newUsers = [...prev, ...newUsersToAdd];
        console.log("Current users after adding:", newUsers);
        return newUsers;
      });

      // 화면 공유 중인 유저들에게 offer 요청 - 여러 번 시도
      const requestOffers = () => {
        allUsers.forEach((user) => {
          if (user.isSharing) {
            console.log(
              `🎯 User ${user.id} (${user.nickname}) is sharing, requesting offer`
            );
            socket.emit("request_offer", {
              targetId: user.id,
              requesterNickname: nickname,
            });
          } else {
            console.log(`ℹ️ User ${user.id} (${user.nickname}) is NOT sharing`);
          }
        });
      };

      // 1초, 2초, 3초 후 3번 요청
      setTimeout(requestOffers, 1000);
      setTimeout(requestOffers, 2000);
      setTimeout(requestOffers, 3000);
    });

    // 새 유저 입장
    socket.on("user_joined", (user) => {
      console.log("=== USER JOINED ===");
      console.log("New user:", user);

      setUsers((prev) => {
        // 중복 체크
        if (prev.some((u) => u.id === user.id)) {
          console.log("ℹ️ User already exists, skipping");
          return prev;
        }
        return [...prev, user];
      });

      // 내가 화면 공유 중이면 새 유저에게 offer 전송 - 여러 번 시도
      if (localStreamRef.current && isSharing) {
        console.log(
          `🎯 I'm sharing, sending offer to new user: ${user.id} (${user.nickname})`
        );

        const sendOffer = () => {
          if (localStreamRef.current && isSharing) {
            createOffer(user.id);
          }
        };

        // 1초, 2초, 3초 후 3번 시도
        setTimeout(sendOffer, 1000);
        setTimeout(sendOffer, 2000);
        setTimeout(sendOffer, 3000);
      }
    });

    // Offer 받기
    socket.on("getOffer", async (data) => {
      console.log("=== GET OFFER ===");
      console.log("Offer from:", data.offerSendId, data.offerSendNickname);
      const { sdp, offerSendId } = data;
      await createAnswer(sdp, offerSendId);
    });

    // Answer 받기
    socket.on("getAnswer", async (data) => {
      console.log("Get answer from:", data.answerSendId);
      const { sdp, answerSendId } = data;
      const pc = pcsRef.current[answerSendId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          console.log("Remote description set successfully for:", answerSendId);
        } catch (error) {
          console.error("Error setting remote description:", error);
        }
      }
    });

    // ICE Candidate 받기
    socket.on("getCandidate", async (data) => {
      console.log("Get candidate from:", data.candidateSendId);
      const { candidate, candidateSendId } = data;
      const pc = pcsRef.current[candidateSendId];
      if (pc && candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log("ICE candidate added for:", candidateSendId);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    });

    // 유저 퇴장
    socket.on("user_exit", (data) => {
      console.log("User exit:", data.id);
      setUsers((prev) => prev.filter((user) => user.id !== data.id));
      if (pcsRef.current[data.id]) {
        pcsRef.current[data.id].close();
        delete pcsRef.current[data.id];
      }
      if (remoteVideosRef.current[data.id]) {
        delete remoteVideosRef.current[data.id];
      }
    });

    // 채팅 메시지 받기
    socket.on("receive_message", (data) => {
      setMessages((prev) => [...prev, data]);
    });

    // 화면 공유 상태 변경
    socket.on("user_screen_share_status", (data) => {
      console.log("=== SCREEN SHARE STATUS CHANGED ===");
      console.log("User:", data.userId, "IsSharing:", data.isSharing);

      setUsers((prev) =>
        prev.map((user) =>
          user.id === data.userId
            ? { ...user, isSharing: data.isSharing }
            : user
        )
      );

      // 상대방이 화면 공유를 시작하면 offer 요청 - 여러 번 시도
      if (data.isSharing) {
        console.log(`🎯 User ${data.userId} started sharing, requesting offer`);

        const requestOffer = () => {
          socket.emit("request_offer", {
            targetId: data.userId,
            requesterNickname: nickname,
          });
        };

        // 1초, 2초, 3초 후 3번 요청
        setTimeout(requestOffer, 1000);
        setTimeout(requestOffer, 2000);
        setTimeout(requestOffer, 3000);
      } else {
        // 화면 공유 중지 시 해당 연결 종료
        console.log(`User ${data.userId} stopped sharing, closing connection`);
        if (pcsRef.current[data.userId]) {
          pcsRef.current[data.userId].close();
          delete pcsRef.current[data.userId];
        }
        if (remoteVideosRef.current[data.userId]) {
          remoteVideosRef.current[data.userId].srcObject = null;
        }
      }
    });

    // offer 요청 받기
    socket.on("request_offer", (data) => {
      console.log("=== OFFER REQUESTED ===");
      console.log("Requested by:", data.requesterId, data.requesterNickname);
      console.log("Am I sharing?:", isSharing);
      console.log("Local stream exists?:", !!localStreamRef.current);

      if (localStreamRef.current && isSharing) {
        console.log("✅ Sending offer to requester");
        // 여러 번 시도
        const sendOffer = () => {
          if (localStreamRef.current && isSharing) {
            createOffer(data.requesterId);
          }
        };

        setTimeout(sendOffer, 500);
        setTimeout(sendOffer, 1500);
        setTimeout(sendOffer, 2500);
      } else {
        console.log("❌ Cannot send offer - not sharing or no stream");
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

  // Peer Connection 생성
  const createPeerConnection = (userId) => {
    try {
      const pc = new RTCPeerConnection(pc_config);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          console.log("Sending ICE candidate to:", userId);
          socket.emit("candidate", {
            candidate: e.candidate,
            candidateReceiveId: userId,
          });
        }
      };

      pc.ontrack = (e) => {
        console.log("Received remote track from:", userId);
        if (remoteVideosRef.current[userId]) {
          remoteVideosRef.current[userId].srcObject = e.streams[0];
          console.log("Stream assigned to video element for:", userId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `ICE connection state with ${userId}:`,
          pc.iceConnectionState
        );
        if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
          console.log(
            `Connection failed/disconnected with ${userId}, attempting to reconnect...`
          );
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`Connection state with ${userId}:`, pc.connectionState);
      };

      // 로컬 스트림이 있으면 추가
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log("Adding track to peer connection:", track.kind);
          pc.addTrack(track, localStreamRef.current);
        });
      }

      pcsRef.current[userId] = pc;
      setPcs((prev) => ({ ...prev, [userId]: pc }));

      return pc;
    } catch (error) {
      console.error("Error creating peer connection:", error);
      return null;
    }
  };

  // Offer 생성
  const createOffer = async (userId) => {
    try {
      console.log("=== CREATING OFFER ===");
      console.log("Target user:", userId);

      // 기존 연결이 있으면 닫기
      if (pcsRef.current[userId]) {
        console.log("Closing existing connection for:", userId);
        pcsRef.current[userId].close();
        delete pcsRef.current[userId];
      }

      // 스트림 확인
      if (!localStreamRef.current) {
        console.error("❌ No local stream available");
        return;
      }

      console.log(
        "✅ Local stream tracks:",
        localStreamRef.current.getTracks().length
      );

      const pc = createPeerConnection(userId);
      if (!pc) {
        console.error("❌ Failed to create peer connection");
        return;
      }

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

      console.log("✅ Offer sent to:", userId);
    } catch (error) {
      console.error("❌ Create offer error:", error);
    }
  };

  // Answer 생성
  const createAnswer = async (sdp, userId) => {
    try {
      console.log("=== CREATING ANSWER ===");
      console.log("For user:", userId);

      // 기존 연결이 있으면 닫기
      if (pcsRef.current[userId]) {
        console.log("Closing existing connection for:", userId);
        pcsRef.current[userId].close();
        delete pcsRef.current[userId];
      }

      const pc = createPeerConnection(userId);
      if (!pc) {
        console.error("❌ Failed to create peer connection");
        return;
      }

      console.log("Setting remote description...");
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      console.log("Creating answer...");
      const answerSdp = await pc.createAnswer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: false,
      });

      console.log("Setting local description...");
      await pc.setLocalDescription(answerSdp);

      socket.emit("answer", {
        sdp: answerSdp,
        answerReceiveId: userId,
      });

      console.log("✅ Answer sent to:", userId);
    } catch (error) {
      console.error("❌ Create answer error:", error);
    }
  };

  // 화면 공유 시작/중지
  const toggleScreenShare = async () => {
    if (!isSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            cursor: "always",
          },
          audio: false,
        });

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 스트림이 종료되면 (사용자가 공유 중지 버튼 클릭)
        stream.getVideoTracks()[0].onended = () => {
          stopScreenShare();
        };

        setIsSharing(true);
        socket.emit("screen_share_status", { isSharing: true });

        // 기존 유저들에게 새로운 offer 전송
        setTimeout(() => {
          users.forEach((user) => {
            if (user.id !== "me") {
              createOffer(user.id);
            }
          });
        }, 500);

        console.log("Screen sharing started");
      } catch (error) {
        console.error("Screen share error:", error);
        alert("화면 공유를 시작할 수 없습니다.");
      }
    } else {
      stopScreenShare();
    }
  };

  // 화면 공유 중지
  const stopScreenShare = () => {
    console.log("Stopping screen share");

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    // 모든 PeerConnection 닫기
    Object.keys(pcsRef.current).forEach((userId) => {
      if (pcsRef.current[userId]) {
        pcsRef.current[userId].close();
        delete pcsRef.current[userId];
      }
    });

    setPcs({});
    setIsSharing(false);
    socket.emit("screen_share_status", { isSharing: false });
  };

  // 채팅 전송
  const sendMessage = () => {
    if (!inputMessage.trim()) return;

    socket.emit("send_message", { message: inputMessage });
    setInputMessage("");
  };

  // 방 나가기
  const leaveRoom = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    Object.values(pcsRef.current).forEach((pc) => pc.close());
    socket.disconnect();
    window.location.reload();
  };

  // 전체화면 토글
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
            {/* 내 화면 */}
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

            {/* 다른 사용자들 화면 */}
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

export default RoomPage;
