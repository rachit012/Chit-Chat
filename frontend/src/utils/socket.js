import { io } from 'socket.io-client';
import api from './api';

let socketInstance = null;

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

const createSocketInstance = (token) => {
  return io(SOCKET_URL, {
    auth: { token },
    withCredentials: true,
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 1000,
    timeout: 10000,
    transports: ['websocket', 'polling']
  });
};

export const isSocketConnected = () => {
  return socketInstance?.connected || false;
};

export const connectSocket = async (token) => {
  try {
    if (socketInstance && socketInstance.connected) {
      return socketInstance;
    }

    socketInstance = createSocketInstance(token);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Socket connection timeout'));
      }, 10000);

      const onConnect = () => {
        clearTimeout(timeout);
        console.log('Socket connected successfully');
        socketInstance.off('connect', onConnect);
        socketInstance.off('connect_error', onError);
        resolve(socketInstance);
      };

      const onError = async (error) => {
        clearTimeout(timeout);
        console.error('Socket connection error:', error);
        
        if (error.message.includes('unauthorized') || error.message.includes('jwt')) {
          try {
            const { data } = await api.post('/auth/refresh');
            localStorage.setItem('accessToken', data.token);
            
            socketInstance = createSocketInstance(data.token);
            socketInstance.connect();
            
            socketInstance.once('connect', () => {
              console.log('Socket connected after token refresh');
              resolve(socketInstance);
            });
            
            socketInstance.once('connect_error', (refreshError) => {
              console.error('Socket connection error after token refresh:', refreshError);
              reject(refreshError);
            });
          } catch (refreshErr) {
            console.error('Token refresh failed:', refreshErr);
            reject(error);
          }
        } else {
          socketInstance.off('connect', onConnect);
          socketInstance.off('connect_error', onError);
          reject(error);
        }
      };

      socketInstance.once('connect', onConnect);
      socketInstance.once('connect_error', onError);
      socketInstance.connect();
    });
  } catch (err) {
    console.error('Socket connection failed:', err);
    throw err;
  }
};

export const getSocket = async () => {
  try {
    if (socketInstance && socketInstance.connected) {
      return socketInstance;
    }

    const token = localStorage.getItem('accessToken');
    if (!token) {
      throw new Error('No access token available');
    }

    return await connectSocket(token);
  } catch (err) {
    console.error('Failed to get socket:', err);
    throw err;
  }
};

export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

export const checkSocketHealth = () => {
  if (!socketInstance) {
    return { connected: false, transport: null };
  }
  
  return {
    connected: socketInstance.connected,
    transport: socketInstance.io?.engine?.transport?.name || null
  };
};