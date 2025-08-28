import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../utils/socket';

const VideoCall = ({ currentUser, otherUser, onClose, callType = 'video', isIncomingCallProp = false }) => {
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerConnectionRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  
  const isClosedRef = useRef(false);
  const pendingCandidatesRef = useRef([]);

  const handleCallSignal = useCallback(async ({ signal }) => {
    if (isClosedRef.current || !peerConnectionRef.current) return;
    const pc = peerConnectionRef.current;

    try {
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        while (pendingCandidatesRef.current.length > 0) {
          const candidate = pendingCandidatesRef.current.shift();
          await pc.addIceCandidate(candidate);
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (socketRef.current) {
          socketRef.current.emit('callSignal', { 
            signal: pc.localDescription, 
            to: otherUser._id 
          });
        }
      } else if (signal.type === 'answer') {
        if (pc.signalingState !== 'have-local-offer') return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        while (pendingCandidatesRef.current.length > 0) {
          const candidate = pendingCandidatesRef.current.shift();
          await pc.addIceCandidate(candidate);
        }
      } else if (signal.candidate) {
        if (pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingCandidatesRef.current.push(signal.candidate);
        }
      }
    } catch (err) {
      console.error('Error handling signal:', err);
    }
  }, [otherUser._id]);

  const handleCallEnded = useCallback(() => {
    if (!isClosedRef.current) onClose();
  }, [onClose]);

  const createPeerConnection = useCallback((stream) => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    
    pc.ontrack = (event) => {
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        // ✅ FINAL FIX: Only assign the srcObject if it hasn't been set.
        // This prevents the new load request from interrupting the play() command.
        if (remoteVideoRef.current.srcObject !== event.streams[0]) {
          console.log('Assigning remote stream to video element for the first time.');
          remoteVideoRef.current.srcObject = event.streams[0];
          
          // Call play() only when we first set the stream.
          remoteVideoRef.current.play().catch(e => {
            console.error("Remote video autoplay failed:", e);
            // You can optionally show an "Click to play" button here on failure.
          });
        }
      }
    };
    
    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('callSignal', { 
          signal: { candidate: event.candidate }, 
          to: otherUser._id 
        });
      }
    };
    
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsConnecting(false);
        console.log('WebRTC connection established!');
      } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        if (!isClosedRef.current) onClose();
      }
    };
    
    peerConnectionRef.current = pc;
    return pc;
  }, [otherUser._id, onClose]);

  const initiateCallHandshake = useCallback(async (stream) => {
    if (isIncomingCallProp) return;
    
    const pc = createPeerConnection(stream);
    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video'
      });
      await pc.setLocalDescription(offer);
      if (socketRef.current) {
        socketRef.current.emit('callSignal', { 
          signal: pc.localDescription, 
          to: otherUser._id 
        });
      }
    } catch (err) {
      console.error('Error creating offer:', err);
    }
  }, [isIncomingCallProp, otherUser._id, createPeerConnection, callType]);

  useEffect(() => {
    let socket;
    const setup = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: callType === 'video', audio: true,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
        socket = await getSocket();
        socketRef.current = socket;
        
        socket.on('callSignal', handleCallSignal);
        socket.on('callEnded', handleCallEnded);

        if (isIncomingCallProp) {
          createPeerConnection(stream);
          socket.emit('calleeReady', { to: otherUser._id });
        } else {
          const onCalleeReady = () => initiateCallHandshake(localStreamRef.current);
          socket.on('calleeReady', onCalleeReady);
          socket.emit('callRequest', { to: otherUser._id, from: currentUser._id, type: callType });
        }
      } catch (err) {
        setError(`Failed to start call: ${err.message}`);
      }
    };
    setup();

    return () => {
      isClosedRef.current = true;
      if (socketRef.current) {
        socketRef.current.off('callSignal');
        socketRef.current.off('callEnded');
        socketRef.current.off('calleeReady');
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [callType, currentUser._id, otherUser._id, isIncomingCallProp, createPeerConnection, handleCallSignal, handleCallEnded, initiateCallHandshake]);

  const endCall = useCallback(() => {
    if (socketRef.current && !isClosedRef.current) {
      socketRef.current.emit('callEnded', { to: otherUser._id });
    }
    onClose();
  }, [otherUser._id, onClose]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current && callType === 'video') {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };
  
  if (error) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4 text-center">
          <h3 className="text-xl font-semibold mb-3 text-red-600">Call Error</h3>
          <p className="text-gray-700 mb-5">{error}</p>
          <button onClick={onClose} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-50">
      <div className="flex-1 relative bg-gray-900">
        {isConnecting && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-center text-white">
              <p className="text-xl font-semibold">
                {isIncomingCallProp ? `Connecting to ${otherUser.username}...` : `Calling ${otherUser.username}...`}
              </p>
            </div>
          </div>
        )}
        <video ref={remoteVideoRef} playsInline className="w-full h-full object-cover" />
      </div>

      <div className="absolute top-5 right-5 w-36 h-48 bg-gray-800 rounded-xl overflow-hidden shadow-lg border-2 border-gray-700 z-20">
        <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
      </div>

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-6 z-20">
        <div className="flex justify-center items-center gap-6">
          <button onClick={toggleMute} className={`w-16 h-16 flex items-center justify-center rounded-full text-2xl transition-colors ${isMuted ? 'bg-red-600' : 'bg-gray-700 bg-opacity-80'} text-white`}>
            {isMuted ? '🔇' : '🎤'}
          </button>
          {callType === 'video' && (
            <button onClick={toggleVideo} className={`w-16 h-16 flex items-center justify-center rounded-full text-2xl transition-colors ${isVideoOff ? 'bg-red-600' : 'bg-gray-700 bg-opacity-80'} text-white`}>
              {isVideoOff ? '📷' : '📹'}
            </button>
          )}
          <button onClick={endCall} className="w-20 h-16 flex items-center justify-center rounded-full bg-red-600 text-white text-3xl">
            📞
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCall;