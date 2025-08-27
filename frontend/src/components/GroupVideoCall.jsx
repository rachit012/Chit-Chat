import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../utils/socket';
import { useCallContext } from '../contexts/CallContext';

const GroupVideoCall = ({ currentUser, room, onClose, callType = 'video', isIncomingCallProp = false }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isCallActive, setIsCallActive] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(isIncomingCallProp);
  const [caller, setCaller] = useState(isIncomingCallProp ? null : null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isInitiator, setIsInitiator] = useState(false);
  const [connectionStates, setConnectionStates] = useState(new Map());
  const [callRequestTimeout, setCallRequestTimeout] = useState(null);
  const [signalingTimeout, setSignalingTimeout] = useState(null);

  const localVideoRef = useRef();
  const peerConnectionsRef = useRef(new Map());
  const socketRef = useRef();
  const pendingCandidatesRef = useRef(new Map());
  const { endCall } = useCallContext();

  // Enhanced ICE servers configuration
  const getIceServers = () => {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' }
    ];
  };

  useEffect(() => {
    const initializeCall = async () => {
      try {
        console.log('GroupVideoCall: Initializing call...');
        
        // Get user media
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true
        });
        setLocalStream(stream);

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Connect to socket
        console.log('GroupVideoCall: Connecting to socket...');
        const socket = await getSocket();
        socketRef.current = socket;
        console.log('GroupVideoCall: Socket connected successfully');

        // Socket event listeners
        const setupEventListeners = () => {
          socket.on('groupCallRequest', handleIncomingGroupCall);
          socket.on('groupCallAccepted', handleGroupCallAccepted);
          socket.on('groupCallRejected', handleGroupCallRejected);
          socket.on('groupCallEnded', handleGroupCallEnded);
          socket.on('groupCallSignal', handleGroupCallSignal);
          socket.on('userJoinedGroupCall', handleUserJoinedGroupCall);
          socket.on('userLeftGroupCall', handleUserLeftGroupCall);
        };

        setupEventListeners();
        console.log('GroupVideoCall: Event listeners set up successfully');

        return () => {
          console.log('GroupVideoCall: Cleaning up event listeners');
          if (socket) {
            socket.off('groupCallRequest', handleIncomingGroupCall);
            socket.off('groupCallAccepted', handleGroupCallAccepted);
            socket.off('groupCallRejected', handleGroupCallRejected);
            socket.off('groupCallEnded', handleGroupCallEnded);
            socket.off('groupCallSignal', handleGroupCallSignal);
            socket.off('userJoinedGroupCall', handleUserJoinedGroupCall);
            socket.off('userLeftGroupCall', handleUserLeftGroupCall);
          }
        };
      } catch (err) {
        console.error('GroupVideoCall: Initialization error:', err);
        setError('Failed to initialize group call. Please check your connection and try again.');
      }
    };

    initializeCall();

    return () => {
      cleanup();
    };
  }, [callType]);

  const cleanup = () => {
    console.log('GroupVideoCall: Cleaning up...');
    
    // Clear timeouts
    if (callRequestTimeout) {
      clearTimeout(callRequestTimeout);
      setCallRequestTimeout(null);
    }
    if (signalingTimeout) {
      clearTimeout(signalingTimeout);
      setSignalingTimeout(null);
    }
    
    // Stop local stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    // Close all peer connections
    peerConnectionsRef.current.forEach(connection => connection.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    
    console.log('GroupVideoCall: Cleanup completed');
  };

  const createPeerConnection = (targetUserId) => {
    console.log('Creating new peer connection for:', targetUserId);
    
    // Clean up existing connection if any
    const existingConnection = peerConnectionsRef.current.get(targetUserId);
    if (existingConnection) {
      console.log('Cleaning up existing peer connection for:', targetUserId);
      existingConnection.close();
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: getIceServers(),
      iceCandidatePoolSize: 10
    });
    
    // Add local stream tracks to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        console.log('Adding track to peer connection for:', targetUserId, 'track:', track.kind);
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle incoming streams
    peerConnection.ontrack = (event) => {
      console.log('Received remote track from:', targetUserId, 'track:', event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStreams(prev => {
          const newMap = new Map(prev);
          newMap.set(targetUserId, event.streams[0]);
          return newMap;
        });
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Sending ICE candidate to:', targetUserId);
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('groupCallSignal', {
            signal: { type: 'candidate', candidate: event.candidate },
            to: targetUserId,
            roomId: room._id
          });
        } else {
          console.error('GroupVideoCall: Cannot send ICE candidate - socket not available');
        }
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state for', targetUserId, ':', peerConnection.connectionState);
      setConnectionStates(prev => {
        const newMap = new Map(prev);
        newMap.set(targetUserId, peerConnection.connectionState);
        return newMap;
      });
      
      if (peerConnection.connectionState === 'connected') {
        console.log('WebRTC connection established with:', targetUserId);
        setIsCallActive(true);
        setIsConnecting(false);
      } else if (peerConnection.connectionState === 'failed') {
        console.log('WebRTC connection failed with:', targetUserId);
        setError('Connection failed with ' + targetUserId);
        setIsConnecting(false);
      }
    };

    // Handle signaling state changes
    peerConnection.onsignalingstatechange = () => {
      console.log('Signaling state for', targetUserId, ':', peerConnection.signalingState);
      if (peerConnection.signalingState === 'stable') {
        console.log('Signaling state is stable for', targetUserId, ', processing pending candidates');
        // Process any pending candidates when we reach stable state
        setTimeout(() => {
          const pendingCandidates = pendingCandidatesRef.current.get(targetUserId) || [];
          while (pendingCandidates.length > 0) {
            const pending = pendingCandidates.shift();
            if (pending.type === 'offer' && peerConnection.signalingState === 'stable') {
              console.log('Processing pending offer for', targetUserId);
              handleGroupCallSignal({ signal: pending.signal, from: targetUserId });
            } else if (pending.type === 'answer' && peerConnection.signalingState === 'have-local-offer') {
              console.log('Processing pending answer for', targetUserId);
              handleGroupCallSignal({ signal: pending.signal, from: targetUserId });
            } else if (pending.type === 'candidate' && peerConnection.remoteDescription) {
              console.log('Processing pending candidate for', targetUserId);
              peerConnection.addIceCandidate(new RTCIceCandidate(pending.candidate))
                .then(() => console.log('Added pending candidate for', targetUserId))
                .catch(err => console.error('Error adding pending candidate for', targetUserId, ':', err));
            }
          }
          pendingCandidatesRef.current.set(targetUserId, pendingCandidates);
        }, 100);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE connection state for', targetUserId, ':', peerConnection.iceConnectionState);
    };

    peerConnectionsRef.current.set(targetUserId, peerConnection);
    console.log('Peer connection created successfully for:', targetUserId);
    return peerConnection;
  };

  const handleIncomingGroupCall = (data) => {
    console.log('Incoming group call from:', data.caller);
    setCaller(data.caller);
    setIsIncomingCall(true);
    setIsInitiator(false);
  };

  const handleGroupCallAccepted = async (data) => {
    console.log('Group call accepted by:', data.from);
    
    // Only the caller should handle this event
    if (isIncomingCall) {
      console.log('Ignoring groupCallAccepted event - we are the callee');
      return;
    }
    
    // Clear the timeout since we got a response
    if (callRequestTimeout) {
      clearTimeout(callRequestTimeout);
      setCallRequestTimeout(null);
    }
    
    setIsConnecting(true);
    setIsInitiator(true);
    
    // Only create peer connection if it doesn't exist
    if (!peerConnectionsRef.current.get(data.from)) { // Use get(data.from) to check if connection exists
      createPeerConnection(data.from);
    }
    
    // Set a timeout for signaling
    const timeout = setTimeout(() => {
      console.log('Signaling timeout - connection taking too long');
      setError('Connection is taking too long. Please try again.');
      setIsConnecting(false);
    }, 15000); // 15 seconds timeout for signaling
    setSignalingTimeout(timeout);
    
    try {
      console.log('Creating offer for accepted group call');
      const offer = await peerConnectionsRef.current.get(data.from).createOffer({ // Use get(data.from) to get the peer connection
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video'
      });
      
      await peerConnectionsRef.current.get(data.from).setLocalDescription(offer); // Use get(data.from) to get the peer connection
      console.log('Local description set to offer');
      
      // Wait a bit before sending the offer to ensure proper state
      setTimeout(() => {
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('groupCallSignal', {
            signal: { type: 'offer', sdp: offer.sdp },
            to: data.from,
            roomId: room._id
          });
          console.log('Offer sent to:', data.from);
        } else {
          console.error('GroupVideoCall: Cannot send offer - socket not available');
        }
      }, 100);
      
    } catch (err) {
      console.error('Error creating offer:', err);
      setError('Failed to create call offer: ' + err.message);
      if (signalingTimeout) {
        clearTimeout(signalingTimeout);
        setSignalingTimeout(null);
      }
    }
  };

  const handleGroupCallRejected = () => {
    setError('Call was rejected');
    onClose();
  };

  const handleGroupCallEnded = () => {
    console.log('Group call ended');
    endCall();
  };

  const handleGroupCallSignal = async (data) => {
    let peerConnection = peerConnectionsRef.current.get(data.from);
    if (!peerConnection) {
      console.log('No peer connection available for:', data.from, 'creating one');
      peerConnection = createPeerConnection(data.from);
    }

    try {
      const { signal } = data;
      console.log('Received signal from', data.from, ':', signal.type, 'Current state:', peerConnection.signalingState, 'Is incoming call:', isIncomingCall);
      
      if (signal.type === 'offer') {
        // Handle offer - this should only happen for the callee
        if (isIncomingCall && peerConnection.signalingState === 'stable') {
          console.log('Setting remote description (offer) for', data.from, 'as callee');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          console.log('Remote description set to offer for', data.from);
          
          console.log('Creating answer for', data.from, 'as callee');
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          console.log('Local description set to answer for', data.from);
          
          // Add any pending candidates
          const pendingCandidates = pendingCandidatesRef.current.get(data.from) || [];
          while (pendingCandidates.length > 0) {
            const candidate = pendingCandidates.shift();
            if (candidate.type === 'candidate') {
              try {
                await peerConnection.addIceCandidate(candidate);
                console.log('Added pending candidate for', data.from);
              } catch (err) {
                console.error('Error adding pending candidate:', err);
              }
            }
          }
          pendingCandidatesRef.current.set(data.from, pendingCandidates);
          
          console.log('Sending answer to', data.from, 'as callee');
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('groupCallSignal', {
              signal: { type: 'answer', sdp: answer.sdp },
              to: data.from,
              roomId: room._id
            });
            console.log('Answer sent to', data.from);
          } else {
            console.error('GroupVideoCall: Cannot send answer - socket not available');
          }
        } else if (!isIncomingCall) {
          console.warn('Received offer but we are the caller - ignoring for', data.from);
        } else {
          console.warn('Ignoring offer: not in stable state for', data.from, 'current state:', peerConnection.signalingState);
          // Store the offer for later if we're not in stable state
          const pendingCandidates = pendingCandidatesRef.current.get(data.from) || [];
          pendingCandidates.push({ type: 'offer', signal });
          pendingCandidatesRef.current.set(data.from, pendingCandidates);
        }
      } else if (signal.type === 'answer') {
        // Handle answer - this should only happen for the caller
        if (!isIncomingCall && peerConnection.signalingState === 'have-local-offer') {
          console.log('Setting remote description (answer) for', data.from, 'as caller');
          await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
          console.log('Remote description set to answer for', data.from);
          
          // Add any pending candidates
          const pendingCandidates = pendingCandidatesRef.current.get(data.from) || [];
          while (pendingCandidates.length > 0) {
            const candidate = pendingCandidates.shift();
            if (candidate.type === 'candidate') {
              try {
                await peerConnection.addIceCandidate(candidate);
                console.log('Added pending candidate for', data.from);
              } catch (err) {
                console.error('Error adding pending candidate:', err);
              }
            }
          }
          pendingCandidatesRef.current.set(data.from, pendingCandidates);
        } else if (isIncomingCall) {
          console.warn('Received answer but we are the callee - ignoring for', data.from);
        } else {
          console.warn('Skipping setRemoteDescription(answer): wrong signaling state', peerConnection.signalingState, 'for', data.from);
          // Store the answer for later if we're not in the right state
          const pendingCandidates = pendingCandidatesRef.current.get(data.from) || [];
          pendingCandidates.push({ type: 'answer', signal });
          pendingCandidatesRef.current.set(data.from, pendingCandidates);
        }
      } else if (signal.type === 'candidate') {
        // Handle ICE candidate
        console.log('Adding ICE candidate for', data.from);
        if (peerConnection.remoteDescription) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
            console.log('ICE candidate added successfully for', data.from);
          } catch (err) {
            console.error('Error adding ICE candidate:', err);
          }
        } else {
          console.log('Storing candidate for later - no remote description yet for', data.from);
          const pendingCandidates = pendingCandidatesRef.current.get(data.from) || [];
          pendingCandidates.push({ type: 'candidate', candidate: signal.candidate });
          pendingCandidatesRef.current.set(data.from, pendingCandidates);
        }
      }
    } catch (err) {
      console.error('Error handling signal:', err);
      setError('Connection error occurred: ' + err.message);
    }
  };

  const handleUserJoinedGroupCall = (data) => {
    console.log('User joined group call:', data.userId);
    // Create peer connection for new user
    createPeerConnection(data.userId);
  };

  const handleUserLeftGroupCall = (data) => {
    console.log('User left group call:', data.userId);
    // Clean up peer connection
    const peerConnection = peerConnectionsRef.current.get(data.userId);
    if (peerConnection) {
      peerConnection.close();
      peerConnectionsRef.current.delete(data.userId);
    }
    
    // Remove remote stream
    setRemoteStreams(prev => {
      const newMap = new Map(prev);
      newMap.delete(data.userId);
      return newMap;
    });
    
    // Remove connection state
    setConnectionStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(data.userId);
      return newMap;
    });
  };

  const initiateGroupCall = async () => {
    try {
      console.log('Initiating group call in room:', room._id);
      setIsConnecting(true);
      setIsInitiator(true);
      
      // Ensure socket is available
      if (!socketRef.current) {
        console.log('GroupVideoCall: Socket not available, attempting to connect...');
        try {
          const socket = await getSocket();
          socketRef.current = socket;
        } catch (socketErr) {
          console.error('GroupVideoCall: Failed to connect socket:', socketErr);
          setError('Failed to connect to server. Please check your connection and try again.');
          setIsConnecting(false);
          return;
        }
      }
      
      if (socketRef.current && socketRef.current.connected) {
        console.log('GroupVideoCall: Socket is connected, emitting groupCallRequest');
        socketRef.current.emit('groupCallRequest', {
          roomId: room._id,
          from: currentUser._id,
          type: callType
        });
        console.log('GroupVideoCall: groupCallRequest event emitted successfully');
      } else {
        console.error('GroupVideoCall: Socket is not connected');
        setError('Socket connection not available. Please refresh the page and try again.');
        setIsConnecting(false);
      }
      
    } catch (err) {
      console.error('Group call initiation error:', err);
      setError('Failed to initiate group call. Please try again.');
      setIsConnecting(false);
    }
  };

  const acceptGroupCall = () => {
    console.log('GroupVideoCall: Accept group call function called (this should not happen)');
    // This function should not be called directly from GroupVideoCall
    // CallManager handles the acceptance
  };

  const rejectGroupCall = () => {
    console.log('GroupVideoCall: Reject group call function called (this should not happen)');
    // This function should not be called directly from GroupVideoCall
    // CallManager handles the rejection
  };

  const endGroupCall = () => {
    console.log('Ending group call');
    cleanup();
    setIsCallActive(false);
    setIsConnecting(false);
    setRemoteStreams(new Map());
    
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('groupCallEnded', {
        roomId: room._id,
        from: currentUser._id
      });
    } else {
      console.error('GroupVideoCall: Cannot end call - socket not available');
    }
    
    endCall();
    onClose();
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // Auto-initiate call if not incoming
  useEffect(() => {
    if (!isIncomingCall && !isCallActive && !isConnecting) {
      console.log('GroupVideoCall: Auto-initiating group call (outgoing)');
      initiateGroupCall();
    } else if (isIncomingCall) {
      console.log('GroupVideoCall: Incoming call detected, setting up for incoming call');
      // For incoming calls, we need to ensure the peer connections are ready
      // but we don't initiate the call ourselves
    }
  }, [isIncomingCall]);

  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4">Call Error</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Don't show incoming call dialog here - CallManager handles that
  // Just show the video call interface
  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      {/* Remote Videos Grid */}
      <div className="flex-1 p-4">
        {remoteStreams.size > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 h-full">
            {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
              <div key={userId} className="relative bg-gray-800 rounded-lg overflow-hidden">
                <video
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                  ref={(el) => {
                    if (el) el.srcObject = stream;
                  }}
                />
                <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm">
                  User {userId.slice(-4)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-900">
            <div className="text-center text-white">
              <div className="text-4xl mb-4">📞</div>
              <p className="text-lg">
                {isConnecting ? 'Connecting...' : 'Waiting for participants...'}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                {Array.from(connectionStates.values()).some(state => state === 'connecting') && 'Establishing connections...'}
                {Array.from(connectionStates.values()).some(state => state === 'connected') && 'Connected!'}
                {Array.from(connectionStates.values()).some(state => state === 'failed') && 'Some connections failed'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Local Video */}
      <div className="absolute top-4 right-4 w-32 h-24 bg-gray-800 rounded-lg overflow-hidden">
        {localStream && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Controls */}
      <div className="bg-black bg-opacity-50 p-4">
        <div className="flex justify-center items-center gap-4">
          <button
            onClick={toggleMute}
            className={`p-3 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-600'} text-white hover:opacity-80`}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>
          
          {callType === 'video' && (
            <button
              onClick={toggleVideo}
              className={`p-3 rounded-full ${isVideoOff ? 'bg-red-600' : 'bg-gray-600'} text-white hover:opacity-80`}
            >
              {isVideoOff ? '📷' : '📹'}
            </button>
          )}
          
          <button
            onClick={endGroupCall}
            className="p-3 rounded-full bg-red-600 text-white hover:bg-red-700"
          >
            📞
          </button>
        </div>
      </div>
    </div>
  );
};

export default GroupVideoCall; 