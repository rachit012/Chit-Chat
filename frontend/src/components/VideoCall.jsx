import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../utils/socket';

const VideoCall = ({ currentUser, otherUser, onClose, callType = 'video', isIncomingCallProp = false }) => {
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  
  // ✅ All necessary locks for stability
  const isNegotiatingRef = useRef(false);
  const isClosedRef = useRef(false);
  const pendingCandidatesRef = useRef([]);
  const hasRemoteDescriptionRef = useRef(false);
  const hasLocalDescriptionRef = useRef(false);
  const connectionTimeoutRef = useRef(null);

  // Set up connection timeout
  useEffect(() => {
    connectionTimeoutRef.current = setTimeout(() => {
      if (isConnecting && !isClosedRef.current) {
        console.log('Connection timeout - ending call');
        setError('Connection timeout. Please try again.');
        onClose();
      }
    }, 30000); // 30 second timeout

    return () => {
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
      }
    };
  }, [isConnecting, onClose]);

  const handleCallSignal = useCallback(async ({ signal }) => {
    if (isClosedRef.current) return;
    const pc = peerConnectionRef.current;
    if (!pc) return;

    console.log(`Received signal: ${signal.type}`);

    try {
      if (signal.type === 'offer') {
        if (pc.signalingState !== 'stable' || isNegotiatingRef.current) {
          console.log('Ignoring offer - not in stable state or already negotiating');
          return;
        }
        
        console.log('Processing offer...');
        isNegotiatingRef.current = true;
        
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        hasRemoteDescriptionRef.current = true;
        console.log('Remote description set (offer)');
        
        // Process any pending candidates
        while (pendingCandidatesRef.current.length > 0) {
          const candidate = pendingCandidatesRef.current.shift();
          await pc.addIceCandidate(candidate);
          console.log('Added pending ICE candidate');
        }
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        hasLocalDescriptionRef.current = true;
        console.log('Local description set (answer)');
        
        if (socketRef.current) {
          socketRef.current.emit('callSignal', { 
            signal: { type: 'answer', sdp: answer.sdp }, 
            to: otherUser._id 
          });
          console.log('Answer sent to peer');
        }
        
      } else if (signal.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          console.log('Processing answer...');
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          hasRemoteDescriptionRef.current = true;
          console.log('Remote description set (answer)');
          
          // Process any pending candidates
          while (pendingCandidatesRef.current.length > 0) {
            const candidate = pendingCandidatesRef.current.shift();
            await pc.addIceCandidate(candidate);
            console.log('Added pending ICE candidate');
          }
        } else {
          console.log('Ignoring answer - not in have-local-offer state');
        }
        
      } else if (signal.type === 'candidate') {
        if (hasRemoteDescriptionRef.current) {
          console.log('Adding ICE candidate immediately');
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          console.log('Storing ICE candidate for later');
          pendingCandidatesRef.current.push(new RTCIceCandidate(signal.candidate));
        }
      }
    } catch (err) {
      console.error('Error handling signal:', err);
      setError(`Signal handling error: ${err.message}`);
    } finally {
      if (signal.type === 'offer') {
        isNegotiatingRef.current = false;
      }
    }
  }, [otherUser._id]);

  const handleCallEnded = useCallback(() => {
    if (!isClosedRef.current) onClose();
  }, [onClose]);

  const createPeerConnection = useCallback((stream) => {
    if (peerConnectionRef.current) return;
    
    console.log('Creating new peer connection...');
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    });
    
    // Add local stream tracks
    stream.getTracks().forEach(track => {
      console.log('Adding track to peer connection:', track.kind);
      pc.addTrack(track, stream);
    });
    
    // Handle incoming streams
    pc.ontrack = (event) => {
      console.log('Received remote track:', event.track.kind);
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        console.log('Remote video stream set');
      }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && !isClosedRef.current) {
        console.log('Sending ICE candidate');
        socketRef.current.emit('callSignal', { 
          signal: { type: 'candidate', candidate: event.candidate }, 
          to: otherUser._id 
        });
      }
    };
    
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      if (!pc || isClosedRef.current) return;
      
      console.log('Connection state changed:', pc.connectionState);
      
      if (pc.connectionState === 'connected') {
        setIsConnecting(false);
        setIsConnected(true);
        console.log('WebRTC connection established!');
        // Clear connection timeout when connected
        if (connectionTimeoutRef.current) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        console.log('WebRTC connection lost:', pc.connectionState);
        if (!isClosedRef.current) onClose();
      }
    };
    
    // Handle ICE connection state changes
    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected') {
        console.log('ICE connection established!');
      }
    };

    // Handle ICE gathering state changes
    pc.onicegatheringstatechange = () => {
      console.log('ICE gathering state:', pc.iceGatheringState);
    };
    
    peerConnectionRef.current = pc;
    return pc;
  }, [otherUser._id, onClose]);

  const initiateCallHandshake = useCallback(async (stream) => {
    if (isIncomingCallProp) return; // Callee waits for offer
    
    console.log('Initiating call handshake...');
    try {
      const pc = createPeerConnection(stream);
      if (!pc) return;
      
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video'
      });
      
      await pc.setLocalDescription(offer);
      console.log('Local description set to offer');
      
              if (socketRef.current) {
          // Send offer with retry mechanism
          const sendOffer = () => {
            socketRef.current.emit('callSignal', { 
              signal: { type: 'offer', sdp: offer.sdp }, 
              to: otherUser._id 
            });
            console.log('Offer sent to peer');
          };
          
          sendOffer();
          
          // Retry sending offer after 2 seconds if still connecting
          setTimeout(() => {
            if (isConnecting && !isClosedRef.current) {
              console.log('Retrying offer send...');
              sendOffer();
            }
          }, 2000);
        }
    } catch (err) {
      console.error('Error creating offer:', err);
      setError('Failed to initiate call');
    }
  }, [isIncomingCallProp, otherUser._id, createPeerConnection, callType, isConnecting]);

  useEffect(() => {
    let socket;

    const handleCallAccepted = () => {
        // This is now the trigger for the caller to start the WebRTC handshake
        console.log('Call accepted, starting WebRTC handshake...');
        initiateCallHandshake(localStreamRef.current);
    };

    const setup = async () => {
      try {
        console.log('Setting up call...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video',
          audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        socket = await getSocket();
        socketRef.current = socket;
        
        console.log('Socket connected, setting up event listeners...');
        
        // Setup listeners first
        socket.on('callSignal', (data) => {
          console.log('Received callSignal event:', data);
          handleCallSignal(data);
        });
        socket.on('callEnded', handleCallEnded);

        if (isIncomingCallProp) {
          // Callee is ready, create peer connection and wait for offer
          console.log('Callee: Creating peer connection and waiting for offer...');
          createPeerConnection(stream);
          
          // Add a small delay to ensure peer connection is ready
          setTimeout(() => {
            console.log('Callee: Peer connection ready, waiting for offer...');
          }, 100);
        } else {
          // Caller listens for acceptance before creating PC
          console.log('Caller: Waiting for call acceptance...');
          socket.on('callAccepted', handleCallAccepted);
          socket.emit('callRequest', { to: otherUser._id, from: currentUser._id, type: callType });
        }
      } catch (err) {
        console.error('Call initialization error:', err);
        setError(`Failed to start call: ${err.message}`);
      }
    };

    setup();

    return () => {
      console.log('Cleaning up VideoCall component...');
      isClosedRef.current = true;
      
      if (socketRef.current) {
        socketRef.current.off('callSignal', handleCallSignal);
        socketRef.current.off('callEnded', handleCallEnded);
        socketRef.current.off('callAccepted', handleCallAccepted);
      }
      
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [callType, currentUser._id, otherUser._id, isIncomingCallProp, createPeerConnection, handleCallSignal, handleCallEnded, initiateCallHandshake]);

  const endCall = useCallback(() => {
    console.log('Ending call...');
    if (socketRef.current && !isClosedRef.current) {
      socketRef.current.emit('callEnded', { to: otherUser._id });
    }
    onClose();
  }, [otherUser._id, onClose]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      });
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current && callType === 'video') {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
        setIsVideoOff(!track.enabled);
      });
    }
  };
  
  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 text-center">
          <h3 className="text-xl font-semibold mb-3 text-red-600">Call Error</h3>
          <p className="text-gray-700 mb-5">{error}</p>
          <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      <div className="flex-1 relative bg-gray-900">
        {isConnecting ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-white">
              <div className="text-5xl mb-4 animate-pulse">📞</div>
              <p className="text-xl font-semibold">
                {isIncomingCallProp ? `Connecting to ${otherUser.username}...` : `Calling ${otherUser.username}...`}
              </p>
              <p className="text-sm text-gray-300 mt-2">Establishing connection...</p>
            </div>
          </div>
        ) : (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        )}
      </div>

      <div className="absolute top-5 right-5 w-36 h-48 bg-gray-800 rounded-xl overflow-hidden shadow-lg border-2 border-gray-700">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6">
        <div className="flex justify-center items-center gap-6">
          <button onClick={toggleMute} className={`w-16 h-16 flex items-center justify-center rounded-full text-2xl transition-colors ${isMuted ? 'bg-red-600' : 'bg-gray-700 bg-opacity-80'} text-white hover:bg-opacity-100`}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          {callType === 'video' && (
            <button onClick={toggleVideo} className={`w-16 h-16 flex items-center justify-center rounded-full text-2xl transition-colors ${isVideoOff ? 'bg-red-600' : 'bg-gray-700 bg-opacity-80'} text-white hover:bg-opacity-100`}>
              {isVideoOff ? '📷' : '📹'}
            </button>
          )}
          <button onClick={endCall} className="w-20 h-16 flex items-center justify-center rounded-full bg-red-600 text-white text-3xl hover:bg-red-700">
            📞
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;