import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import api from "../../utils/api";
import { getSocket } from "../../utils/socket";
import FileIcon from "./FileIcon";
import GroupVideoCall from "../GroupVideoCall";

const RoomChat = ({ currentUser }) => {
  const { roomId } = useParams();
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [socketError, setSocketError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [selectedMessages, setSelectedMessages] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showVideoCall, setShowVideoCall] = useState(false);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  const [callType, setCallType] = useState('video');
  const messagesEndRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleFileUpload = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file type
  const validTypes = ['image/jpeg', 'image/jpg', 'application/pdf'];
  if (!validTypes.includes(file.type)) {
    setSocketError('Only JPG/JPEG images and PDF files are allowed');
    e.target.value = '';
    return;
  }

  try {
    setIsUploading(true);

    // Create preview for UI
    const previewUrl = URL.createObjectURL(file);
    setPreviewFile({
      url: previewUrl,
      type: file.type.startsWith('image/') ? 'image' : 'file',
      name: file.name,
      size: file.size
    });
    
    const formData = new FormData();
    formData.append('file', file);

    // Use the correct endpoint
    const { data } = await api.post('/messages/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    // Update preview file with server response
    setPreviewFile({
      url: data.url,
      type: data.type,
      name: data.originalname,
      size: data.size
    });

  } catch (err) {
    console.error('Upload error details:', err.response?.data || err.message);
    setSocketError(err.response?.data?.error || 'Upload failed');
    setPreviewFile(null);
  } finally {
    setIsUploading(false);
    e.target.value = '';
  }
};

  const handleDownload = async (file) => {
  try {
    let blob;
    
    if (file.url.startsWith('blob:')) {
      // If it's already a blob URL
      const response = await fetch(file.url);
      blob = await response.blob();
    } else {
      // If it's a path, fetch from server
      const response = await api.get(file.url, { responseType: 'blob' });
      blob = response.data;
    }

    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', file.name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error('Download failed:', err);
    setSocketError('Failed to download file');
  }
};

  useEffect(() => {
    let isMounted = true;
    let socket;
    const cleanupFunctions = [];

    const fetchData = async () => {
      try {
        setLoading(true);
        const [roomRes, messagesRes] = await Promise.all([
          api.get(`/rooms/${roomId}`),
          api.get(`/messages/room/${roomId}`)
        ]);

        if (isMounted) {
          setRoom(roomRes.data);
          setMessages(messagesRes.data);
          setSocketError(null);
        }
      } catch (err) {
        if (isMounted) {
          setSocketError("Failed to load room data");
          console.error("Failed to fetch room:", err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const setupSocket = async () => {
      try {
        socket = await getSocket();
        if (!socket || !isMounted) return;

        socket.emit("joinRoom", roomId);
        
        const messageHandler = (message) => {
          if (isMounted && message.room === roomId) {
            setMessages(prev => {
              const existingIndex = prev.findIndex(msg => 
                (msg.tempId && msg.tempId === message.tempId) ||
                (msg._id && msg._id === message._id)
              );
              
              if (existingIndex >= 0) {
                const newMessages = [...prev];
                newMessages[existingIndex] = message;
                return newMessages;
              }
              return [...prev, message];
            });
          }
        };

        const removeFailedHandler = ({ tempId }) => {
          if (isMounted) {
            setMessages(prev => prev.filter(msg => msg.tempId !== tempId));
            setSocketError("Failed to send message - please try again");
          }
        };

        const messageDeletedHandler = (message) => {
          if (isMounted && message.room === roomId) {
            setMessages(prev => prev.map(msg => 
              msg._id === message._id ? message : msg
            ));
          }
        };

        const joinHandler = ({ userId, username, roomId: joinedRoomId }) => {
          if (isMounted && joinedRoomId === roomId && room) {
            setRoom(prev => ({
              ...prev,
              members: [...(prev.members || []), { _id: userId, username }]
            }));
          }
        };

        const leaveHandler = ({ userId, roomId: leftRoomId }) => {
          if (isMounted && leftRoomId === roomId && room) {
            setRoom(prev => ({
              ...prev,
              members: (prev.members || []).filter(member => member._id !== userId)
            }));
          }
        };

        const errorHandler = (err) => {
          if (isMounted) {
            setSocketError("Realtime connection issue - messages may be delayed");
            console.error("Socket error:", err);
          }
        };

        socket.on("newRoomMessage", messageHandler);
        socket.on("removeFailedMessage", removeFailedHandler);
        socket.on("roomMessageDeleted", messageDeletedHandler);
        socket.on("userJoinedRoom", joinHandler);
        socket.on("userLeftRoom", leaveHandler);
        socket.on("connect_error", errorHandler);

        cleanupFunctions.push(() => {
          socket.off("newRoomMessage", messageHandler);
          socket.off("removeFailedMessage", removeFailedHandler);
          socket.off("roomMessageDeleted", messageDeletedHandler);
          socket.off("userJoinedRoom", joinHandler);
          socket.off("userLeftRoom", leaveHandler);
          socket.off("connect_error", errorHandler);
        });

      } catch (err) {
        if (isMounted) {
          setSocketError("Failed to connect to realtime service");
          console.error("Socket setup error:", err);
        }
      }
    };

    fetchData();
    setupSocket();

    return () => {
      isMounted = false;
      cleanupFunctions.forEach(fn => fn());
      if (socket) {
        socket.emit("leaveRoom", roomId);
      }
    };
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !previewFile) || isUploading) return;

    try {
      const socket = await getSocket();
      if (!socket) {
        throw new Error("Socket not available");
      }

      const tempId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const tempMessage = {
        _id: tempId,
        sender: currentUser._id,
        senderName: currentUser.username,
        room: roomId,
        text: newMessage,
        attachments: previewFile ? [previewFile] : [],
        createdAt: new Date(),
        tempId
      };

      setMessages(prev => [...prev, tempMessage]);
      setNewMessage("");
      setPreviewFile(null);
      scrollToBottom();

      socket.emit("sendRoomMessage", {
        roomId,
        text: newMessage,
        attachments: previewFile ? [{
          url: previewFile.url,
          type: previewFile.type,
          name: previewFile.name,
          size: previewFile.size
        }] : [],
        tempId,
        sender: currentUser._id,
        senderName: currentUser.username
      });

    } catch (err) {
      console.error("Failed to send message:", err);
      setSocketError("Failed to send message - please try again");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    try {
      const socket = await getSocket();
      if (!socket) {
        throw new Error("Socket not available");
      }

      setMessages(prev => prev.map(msg => 
        msg._id === messageId 
          ? { ...msg, text: '[Message deleted]', isDeleted: true } 
          : msg
      ));

      socket.emit("deleteRoomMessage", { messageId });

    } catch (err) {
      console.error("Failed to delete message:", err);
      setSocketError("Failed to delete message - please try again");
    }
  };

  // Message selection functions
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      setSelectedMessages(new Set());
    }
  };

  const toggleMessageSelection = (messageId) => {
    const newSelected = new Set(selectedMessages);
    if (newSelected.has(messageId)) {
      newSelected.delete(messageId);
    } else {
      newSelected.add(messageId);
    }
    setSelectedMessages(newSelected);
  };

  const selectAllMessages = () => {
    const allMessageIds = messages
      .filter(msg => msg.sender === currentUser._id)
      .map(msg => msg._id || msg.tempId);
    setSelectedMessages(new Set(allMessageIds));
  };

  const clearSelection = () => {
    setSelectedMessages(new Set());
  };

  const deleteSelectedMessages = async (deleteType) => {
    if (selectedMessages.size === 0) return;

    try {
      const socket = await getSocket();
      if (!socket) {
        throw new Error("Socket not available");
      }

      // Delete each selected message based on deleteType
      for (const messageId of selectedMessages) {
        const message = messages.find(msg => (msg._id || msg.tempId) === messageId);
        if (message && message.sender === currentUser._id) {
          // Sender can delete for both sides or just for themselves
          socket.emit("deleteRoomMessage", { messageId, deleteType });
        } else if (message) {
          // Receiver can only delete for themselves
          socket.emit("deleteRoomMessage", { messageId, deleteType: 'receiver' });
        }
      }

      // Remove messages from local state based on deleteType
      setMessages(prev => prev.filter(msg => {
        const msgId = msg._id || msg.tempId;
        if (!selectedMessages.has(msgId)) return true;
        
        // If deleting for everyone, remove the message completely
        if (deleteType === 'both') return false;
        
        // If deleting for sender only, keep the message but mark it as deleted for sender
        if (deleteType === 'sender') {
          return msg.sender !== currentUser._id; // Keep messages from others
        }
        
        // If deleting for receiver only, keep the message but mark it as deleted for receiver
        if (deleteType === 'receiver') {
          return msg.sender === currentUser._id; // Keep own messages
        }
        
        return true;
      }));

      // Clear selection
      setSelectedMessages(new Set());
      setIsSelectionMode(false);
      setSocketError(null);
    } catch (err) {
      console.error("Failed to delete messages:", err);
      setSocketError("Failed to delete messages - please try again");
    }
  };

  // Check if selected messages include receiver's messages
  const hasReceiverMessages = () => {
    return Array.from(selectedMessages).some(messageId => {
      const message = messages.find(msg => (msg._id || msg.tempId) === messageId);
      return message && message.sender !== currentUser._id;
    });
  };

  // Check if selected messages include sender's messages
  const hasSenderMessages = () => {
    return Array.from(selectedMessages).some(messageId => {
      const message = messages.find(msg => (msg._id || msg.tempId) === messageId);
      return message && message.sender === currentUser._id;
    });
  };

  const deleteMessage = async (messageId, deleteType) => {
    try {
      const socket = await getSocket();
      if (!socket) {
        throw new Error("Socket not available");
      }

      socket.emit("deleteRoomMessage", { messageId, deleteType });
      
      // Update local state immediately
      setMessages(prev => prev.map(msg => {
        const msgId = msg._id || msg.tempId;
        if (msgId === messageId) {
          if (deleteType === 'both') {
            return { ...msg, isDeleted: true, text: '[Message deleted]', attachments: [] };
          } else {
            return { ...msg, [`deletedFor${deleteType === 'sender' ? 'Sender' : 'Receiver'}`]: true };
          }
        }
        return msg;
      }));

      setSocketError(null);
    } catch (err) {
      console.error("Failed to delete message:", err);
      setSocketError("Failed to delete message - please try again");
    }
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><p>Loading room...</p></div>;
  }

  if (!room) {
    return <div className="flex-1 flex items-center justify-center text-red-500">Failed to load room data</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{room.name}</h2>
            <p className="text-sm text-gray-500">{room.description}</p>
          </div>
          
          {/* Call and Selection mode controls */}
          <div className="flex items-center space-x-2">
            {/* Call buttons */}
            <button
              onClick={() => {
                setCallType('voice');
                setShowVoiceCall(true);
              }}
              className="p-2 text-green-600 hover:bg-green-100 rounded-full transition-colors"
              title="Voice Call"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
            </button>
            
            <button
              onClick={() => {
                setCallType('video');
                setShowVideoCall(true);
              }}
              className="p-2 text-blue-600 hover:bg-blue-100 rounded-full transition-colors"
              title="Video Call"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6l2 2h6a2 2 0 012 2v2M2 6v10a2 2 0 002 2h12a2 2 0 002-2V8a2 2 0 00-2-2H4a2 2 0 00-2-2z" />
              </svg>
            </button>

            {isSelectionMode && (
              <>
                <span className="text-sm text-gray-600">
                  {selectedMessages.size} selected
                </span>
                <button
                  onClick={selectAllMessages}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Clear
                </button>
                <button
                  onClick={() => deleteSelectedMessages('sender')}
                  disabled={selectedMessages.size === 0}
                  className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Delete for me ({selectedMessages.size})
                </button>
                {hasSenderMessages() && !hasReceiverMessages() && (
                  <button
                    onClick={() => deleteSelectedMessages('both')}
                    disabled={selectedMessages.size === 0}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Delete for everyone ({selectedMessages.size})
                  </button>
                )}
              </>
            )}
            <button
              onClick={toggleSelectionMode}
              className={`px-3 py-1 text-sm rounded ${
                isSelectionMode
                  ? 'bg-gray-600 text-white hover:bg-gray-700'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isSelectionMode ? 'Cancel' : 'Select'}
            </button>
          </div>
        </div>
        {socketError && (
          <div className="bg-yellow-100 text-yellow-800 p-2 text-sm mt-2">
            {socketError}
          </div>
        )}
        <div className="flex items-center mt-2">
          <div className="flex -space-x-2">
            {(room.members || []).slice(0, 5).map((member, index) => (
              <div
                key={member._id}
                className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium"
              >
                {member.username.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="text-sm text-gray-500 ml-2">
            {room.members?.length || 0} members
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages
          .filter(message => {
            // Filter out messages that are deleted for the current user
            if (message.isDeleted) return false;
            if (message.deletedForSender && message.sender === currentUser._id) return false;
            if (message.deletedForReceiver && message.sender !== currentUser._id) return false;
            return true;
          })
          .map((message) => {
            const isSender = message.sender._id === currentUser._id;
            const messageId = message._id || message.tempId;
            const isSelected = selectedMessages.has(messageId);
            
            return (
              <div
                key={messageId}
                className={`flex ${isSender ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl ${
                    isSender
                      ? "bg-blue-300 text-gray-800 rounded-br-none ml-auto"
                      : "bg-gray-200 text-gray-800 rounded-bl-none mr-auto"
                  } ${message.isDeleted ? "italic text-gray-500" : ""} ${
                    isSelectionMode ? "cursor-pointer" : ""
                  }`}
                  onClick={() => {
                    if (isSelectionMode) {
                      toggleMessageSelection(messageId);
                    }
                  }}
                >
                  {/* Selection checkbox */}
                  {isSelectionMode && (
                    <div className="flex items-center mb-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleMessageSelection(messageId)}
                        className="mr-2"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs opacity-75">Selected</span>
                    </div>
                  )}
                  
                  {/* Sender name for group chat */}
                  {!isSender && (
                    <div className="text-xs font-medium text-gray-600 mb-1">
                      {message.sender?.username || 'Unknown User'}
                    </div>
                  )}
                  
                  <div className="text-sm break-words">
                    {message.isDeleted ? '[Message deleted]' : message.text}
                  </div>
                  {message.attachments?.map((file, idx) => (
                    <div key={idx} className="mt-2">
                      {file.type === 'image' ? (
                        <img 
                          src={file.url} 
                          alt={file.name} 
                          className="max-w-xs max-h-64 rounded-lg"
                        />
                      ) : (
                        <div 
                          onClick={() => handleDownload(file)}
                          className="flex items-center p-2 border rounded-lg hover:bg-gray-100 cursor-pointer"
                        >
                          <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center mr-2">
                            <FileIcon type={file.type} />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  <div
                    className={`text-xs mt-1 ${
                      isSender ? "text-gray-600" : "text-gray-500"
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-gray-200">
        {previewFile && (
          <div className="mb-2 relative">
            {previewFile.type === 'image' ? (
              <img 
                src={previewFile.url} 
                alt="Preview" 
                className="max-w-xs max-h-32 rounded-lg"
              />
            ) : (
              <div className="flex items-center p-2 border rounded-lg">
                <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center mr-2">
                  <FileIcon type={previewFile.type} />
                </div>
                <div>
                  <p className="text-sm font-medium">{previewFile.name}</p>
                  <p className="text-xs text-gray-500">{formatFileSize(previewFile.size)}</p>
                </div>
              </div>
            )}
            <button 
              onClick={() => setPreviewFile(null)}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex">
          <label className="flex items-center justify-center p-2 rounded-lg hover:bg-gray-100 cursor-pointer mr-2">
            <input 
              type="file" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={isUploading}
              accept=".pdf,.jpg,.jpeg,image/jpeg,image/jpg,application/pdf"
            />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </label>
          <input
            type="text"
            placeholder={`Message #${room.name}`}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button
            onClick={handleSendMessage}
            disabled={(!newMessage.trim() && !previewFile) || isUploading}
            className={`px-4 py-2 rounded-r-lg ${
              (newMessage.trim() || previewFile) && !isUploading
                ? "bg-blue-600 hover:bg-blue-700 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isUploading ? 'Uploading...' : 'Send'}
          </button>
        </div>
      </div>

      {/* Video/Voice Call Modal */}
      {(showVideoCall || showVoiceCall) && (
        <GroupVideoCall
          currentUser={currentUser}
          room={room}
          callType={callType}
          onClose={() => {
            setShowVideoCall(false);
            setShowVoiceCall(false);
          }}
        />
      )}
    </div>
  );
};

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat(bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
}

export default RoomChat;