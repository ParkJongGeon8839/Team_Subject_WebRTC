// src/webrtc.js

export function createPeerConnection(onTrackCallback, onIceCandidateCallback) {
  const pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  });

  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    if (onTrackCallback) {
      onTrackCallback(remoteStream);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate && onIceCandidateCallback) {
      onIceCandidateCallback(event.candidate);
    }
  };

  return pc;
}
