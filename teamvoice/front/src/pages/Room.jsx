import React, { useState } from "react";
import "../App.css";
import AudioChat from "./AudioChat";

function Room() {
  const [selectedRoom, setSelectedRoom] = useState("");
  const [isEntered, setIsEntered] = useState("");

  const handleSelectChange = (event) => {
    setIsEntered("");
    setSelectedRoom(event.target.value);
  };

  const handleEntryClick = () => {
    if (selectedRoom === "voice") setIsEntered("voice");
    else if (selectedRoom === "screen") setIsEntered("screen");
    else {
      alert("방을 먼저 선택해주세요");
      setIsEntered("");
    }
  };

  const handleExitRoom = () => setIsEntered("");

  return (
    <>
      {!isEntered && (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignContent: "center",
            }}
          >
            <select
              name="room"
              id="room"
              value={selectedRoom}
              onChange={handleSelectChange}
              style={{ marginRight: "10px" }}
            >
              <option value="">-- 방 선택 --</option>
              <option value="screen">화면 공유</option>
              <option value="voice">음성 채팅</option>
            </select>
            <button onClick={handleEntryClick}>입장</button>
          </div>
        </>
      )}
      {selectedRoom === "voice" && isEntered === "voice" && (
        <AudioChat onExit={handleExitRoom} />
      )}
    </>
  );
}

export default Room;
