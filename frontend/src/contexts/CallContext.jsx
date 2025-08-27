import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

// BroadcastChannel for cross-tab communication
const callStateChannel = new BroadcastChannel('call_state_channel');

const CallContext = createContext();

export const useCallContext = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCallContext must be used within a CallProvider');
  }
  return context;
};

export const CallProvider = ({ children }) => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [activeCallType, setActiveCallType] = useState(null);
  const [activeCallData, setActiveCallData] = useState(null);
  
  // Use refs to track the latest state for immediate access
  const isCallActiveRef = useRef(false);
  const activeCallDataRef = useRef(null);

  // Update refs when state changes
  useEffect(() => {
    isCallActiveRef.current = isCallActive;
    activeCallDataRef.current = activeCallData;
  }, [isCallActive, activeCallData]);

  // Listen for call state changes from other tabs
  useEffect(() => {
    const handleChannelMessage = (event) => {
      const { type, data } = event.data;
      
      switch (type) {
        case 'CALL_STARTED':
          setIsCallActive(true);
          setActiveCallType(data.callType);
          setActiveCallData(data);
          break;
        case 'CALL_ENDED':
          setIsCallActive(false);
          setActiveCallType(null);
          setActiveCallData(null);
          break;
        case 'CALL_STATE_SYNC':
          // Sync state from other tabs
          if (data.isCallActive) {
            setIsCallActive(true);
            setActiveCallType(data.callType);
            setActiveCallData(data.callData);
          }
          break;
        default:
          break;
      }
    };

    callStateChannel.addEventListener('message', handleChannelMessage);

    // Broadcast current state to other tabs
    callStateChannel.postMessage({
      type: 'CALL_STATE_SYNC',
      data: {
        isCallActive,
        callType: activeCallType,
        callData: activeCallData
      }
    });

    return () => {
      callStateChannel.removeEventListener('message', handleChannelMessage);
    };
  }, [isCallActive, activeCallType, activeCallData]);

  const startCall = (callType, callData = null) => {
    // Check if already in a call
    if (isCallActiveRef.current) {
      console.warn('Call already active, cannot start new call');
      return false;
    }

    // Update local state
    setIsCallActive(true);
    setActiveCallType(callType);
    setActiveCallData(callData);

    // Broadcast to other tabs
    callStateChannel.postMessage({
      type: 'CALL_STARTED',
      data: { callType, callData }
    });

    return true;
  };

  const endCall = () => {
    // Update local state
    setIsCallActive(false);
    setActiveCallType(null);
    setActiveCallData(null);

    // Broadcast to other tabs
    callStateChannel.postMessage({
      type: 'CALL_ENDED',
      data: {}
    });
  };

  const isBusy = () => {
    return isCallActiveRef.current;
  };

  return (
    <CallContext.Provider value={{
      isCallActive,
      activeCallType,
      activeCallData,
      startCall,
      endCall,
      isBusy
    }}>
      {children}
    </CallContext.Provider>
  );
}; 