import { createContext, useContext, useEffect, useState } from 'react';
import { getSocket } from '../services/socket';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [onlineUsers, setOnlineUsers] = useState([]);

  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit('presence:getOnline');

    socket.on('presence:onlineList', (users) => setOnlineUsers(users));
    socket.on('presence:online', ({ userId }) => {
      setOnlineUsers((prev) => [...new Set([...prev, userId])]);
    });
    socket.on('presence:offline', ({ userId }) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== userId));
    });

    return () => {
      socket.off('presence:onlineList');
      socket.off('presence:online');
      socket.off('presence:offline');
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ onlineUsers }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
}
