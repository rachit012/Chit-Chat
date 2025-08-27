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
      console.log('CallContext: Received BroadcastChannel message:', event.data);
      const { type, data } = event.data;
      
      switch (type) {
        case 'CALL_STARTED':
          console.log('CallContext: Processing CALL_STARTED message:', data);
          setIsCallActive(true);
          setActiveCallType(data.callType);
          setActiveCallData(data.callData);
          break;
        case 'CALL_ENDED':
          console.log('CallContext: Processing CALL_ENDED message:', data);
          setIsCallActive(false);
          setActiveCallType(null);
          setActiveCallData(null);
          break;
        case 'CALL_STATE_SYNC':
          console.log('CallContext: Processing CALL_STATE_SYNC message:', data);
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

    // Only broadcast state on mount, not on every state change
    console.log('CallContext: Broadcasting initial state on mount:', { isCallActive, activeCallType, activeCallData });
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
  }, []); // Remove dependencies to prevent infinite loop

  const startCall = (callType, callData = null) => {
    console.log('CallContext: startCall called with:', { callType, callData, currentState: { isCallActive, activeCallType, activeCallData } });
    
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
    console.log('CallContext: endCall called, current state:', { isCallActive, activeCallType, activeCallData });
    
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