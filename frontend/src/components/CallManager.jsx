import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../utils/socket';
import VideoCall from './VideoCall';
import { useCallContext } from '../contexts/CallContext';

// This BroadcastChannel is used to sync call state across multiple browser tabs.
const callChannel = new BroadcastChannel('call_manager_channel');

const CallManager = ({ currentUser }) => {
  const [incomingCall, setIncomingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [socket, setSocket] = useState(null);
  const { isCallActive, activeCallType, activeCallData, startCall, endCall, isBusy } = useCallContext();

  const activeCallRef = useRef(activeCall);
  activeCallRef.current = activeCall;

  const incomingCallRef = useRef(incomingCall);
  incomingCallRef.current = incomingCall;

  // Handle outgoing calls from CallContext
  useEffect(() => {
    console.log('CallManager: State change detected:', { 
      isCallActive, 
      activeCallType, 
      activeCallData, 
      activeCall,
      incomingCall,
      currentUser: currentUser?._id 
    });
    
    if (isCallActive && activeCallData && !activeCall) {
      // This is an outgoing call initiated from another component
      console.log('CallManager: Setting up outgoing call from CallContext');
      setActiveCall({
        otherUser: activeCallData.otherUser,
        type: activeCallType,
        isIncoming: false,
      });
    } else if (!isCallActive && activeCall && !incomingCall) {
      // Only clean up if there's no incoming call and the call was ended from another component
      console.log('CallManager: Call ended from CallContext, cleaning up');
      console.log('CallManager: Cleanup reason - isCallActive:', isCallActive, 'activeCall:', !!activeCall, 'incomingCall:', !!incomingCall);
      setActiveCall(null);
    }
  }, [isCallActive, activeCallType, activeCallData, activeCall, incomingCall]);

  useEffect(() => {
    if (!currentUser || !currentUser._id) return;

    let socketInstance;

    const initializeSocket = async () => {
      try {
        socketInstance = await getSocket();
        setSocket(socketInstance);

        const handleCallRequest = (data) => {
          // Ignore call requests from oneself
          if (data.caller._id === currentUser._id) return;
          
          console.log('CallManager: Received call request from:', data.caller._id, 'type:', data.type);
          console.log('CallManager: Current state before handling call request:', { 
            isBusy: isBusy(), 
            activeCallRef: activeCallRef.current, 
            incomingCallRef: incomingCallRef.current,
            currentUser: currentUser._id
          });
          
          // Check if user is busy (either in active call or has incoming call)
          if (isBusy() || activeCallRef.current || incomingCallRef.current) {
            console.warn('User is busy, rejecting call request.');
            socketInstance.emit('callRejected', { to: data.caller._id, from: currentUser._id });
            return;
          }
          
          console.log('CallManager: Setting incoming call state');
          setIncomingCall({ caller: data.caller, type: data.type });
        };

        // This handles when the other user ends, rejects, or is unavailable.
        const handleCallTerminated = ({ reason }) => {
          console.log(`Call terminated. Reason: ${reason || 'Normal hang up'}`);
          setIncomingCall(null);
          setActiveCall(null);
          endCall(); // Update CallContext
        };
        
        socketInstance.on('callRequest', handleCallRequest);
        socketInstance.on('callRejected', handleCallTerminated);
        socketInstance.on('callEnded', handleCallTerminated);
        
        // Return a cleanup function
        return () => {
          socketInstance.off('callRequest', handleCallRequest);
          socketInstance.off('callRejected', handleCallTerminated);
          socketInstance.off('callEnded', handleCallTerminated);
        };

      } catch (err) {
        console.error('CallManager socket initialization error:', err);
      }
    };

    const cleanupPromise = initializeSocket();

    return () => {
      cleanupPromise.then(cleanup => cleanup && cleanup());
    };
  }, [currentUser?._id, isBusy, endCall]);

  // ✅ FIX: This effect now listens for specific actions from other tabs.
  useEffect(() => {
    const handleChannelMessage = (event) => {
      console.log(`[BroadcastChannel] Received message in this tab:`, event.data);
      console.log(`[BroadcastChannel] Current state before processing:`, { activeCall, incomingCall, currentUser: currentUser?._id });
      const { type } = event.data;

      switch (type) {
        case 'ACCEPT_CALL':
        case 'REJECT_CALL':
          // If another tab accepted or rejected, this tab should just clear its incoming call UI.
          console.log(`[BroadcastChannel] Processing ${type}, clearing incoming call`);
          setIncomingCall(null);
          break;
        case 'END_CALL':
          // If another tab ended the call, this tab should clean up everything.
          console.log(`[BroadcastChannel] Processing END_CALL, cleaning up everything`);
          setIncomingCall(null);
          setActiveCall(null);
          endCall(); // Update CallContext
          break;
        default:
          break;
      }
      console.log(`[BroadcastChannel] State after processing ${type}:`, { activeCall, incomingCall });
    };

    callChannel.addEventListener('message', handleChannelMessage);
    return () => {
      callChannel.removeEventListener('message', handleChannelMessage);
    };
  }, [endCall]);

  const handleAcceptCall = useCallback(() => {
    if (incomingCall && socket) {
      // ✅ FIX: Broadcast the "ACCEPT" action to other tabs first.
      callChannel.postMessage({ type: 'ACCEPT_CALL' });
      
      socket.emit('callAccepted', { to: incomingCall.caller._id, from: currentUser._id });
      setActiveCall({
        otherUser: incomingCall.caller,
        type: incomingCall.type,
        isIncoming: true,
      });
      setIncomingCall(null);
      
      // Update CallContext
      startCall(incomingCall.type, { otherUser: incomingCall.caller });
    }
  }, [incomingCall, socket, currentUser, startCall]);

  const handleRejectCall = useCallback(() => {
    if (incomingCall && socket) {
      // ✅ FIX: Broadcast the "REJECT" action to other tabs.
      callChannel.postMessage({ type: 'REJECT_CALL' });

      socket.emit('callRejected', { to: incomingCall.caller._id, from: currentUser._id });
    }
    setIncomingCall(null);
  }, [incomingCall, socket, currentUser]);

  const handleCloseActiveCall = useCallback(() => {
    // ✅ FIX: Broadcast the "END_CALL" action to other tabs when the call is closed from this tab.
    callChannel.postMessage({ type: 'END_CALL' });
    setActiveCall(null);
    setIncomingCall(null); // Ensure incoming is also cleared
    endCall(); // Update CallContext
  }, [endCall]);

  if (incomingCall) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl">
          <h3 className="text-xl font-semibold mb-2">
            Incoming {incomingCall.type === 'video' ? 'Video' : 'Voice'} Call
          </h3>
          <p className="text-gray-600 mb-6 font-medium">{incomingCall.caller?.username || 'Unknown'}</p>
          <div className="flex gap-4">
            <button
              onClick={handleAcceptCall}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={handleRejectCall}
              className="flex-1 bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (activeCall) {
    return (
      <VideoCall
        key={activeCall.otherUser._id}
        currentUser={currentUser}
        otherUser={activeCall.otherUser}
        callType={activeCall.type}
        isIncomingCallProp={activeCall.isIncoming}
        onClose={handleCloseActiveCall}
      />
    );
  }

  return null;
};

export default CallManager;