import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getSocket } from '../services/socket';
import { useNotification } from '../hooks/useNotification';
import { useToast } from '../components/Shared/Toast';
import ChatList from '../components/Chat/ChatList';
import MessageThread from '../components/Chat/MessageThread';
import CallScreen from '../components/Call/CallScreen';

export default function ChatPage() {
  const { user, logout } = useAuth();
  const { notifyMessage, notifyCall } = useNotification();
  const { addToast } = useToast();
  const [activeChat, setActiveChat] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const activeChatRef = useRef(activeChat);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Incoming call notification
    socket.on('call:incoming', (data) => {
      setIncomingCall(data);
      notifyCall(data.callerName, data.callType);
      addToast(`Incoming ${data.callType} call from ${data.callerName}`, 'call', 10000);
    });

    // New message notification (for messages NOT in the active chat)
    socket.on('chat:message', (msg) => {
      if (msg.sender_id === user.id) return;

      const isActiveChat = activeChatRef.current?.id === msg.conversation_id;
      if (!isActiveChat) {
        notifyMessage(msg.sender_username, msg.content);
        addToast(`${msg.sender_username}: ${msg.content}`, 'message');
      }
    });

    return () => {
      socket.off('call:incoming');
      socket.off('chat:message');
    };
  }, [user.id, notifyMessage, notifyCall, addToast]);

  function handleStartCall(callType) {
    if (!activeChat) return;
    setActiveCall({ conversation: activeChat, conversationId: activeChat.id, callType, isIncoming: false });
  }

  function handleAcceptIncoming() {
    if (!incomingCall) return;
    setActiveCall({
      conversationId: incomingCall.conversationId,
      callType: incomingCall.callType,
      isIncoming: true,
      callerId: incomingCall.callerId,
    });
    setIncomingCall(null);
  }

  function handleDeclineIncoming() {
    const socket = getSocket();
    if (socket && incomingCall) {
      socket.emit('call:decline', {
        conversationId: incomingCall.conversationId,
        callerId: incomingCall.callerId,
      });
    }
    setIncomingCall(null);
  }

  return (
    <div className="chat-page">
      <div className="sidebar">
        <div className="user-info">
          <div className="avatar">{user.username[0].toUpperCase()}</div>
          <span>{user.username}</span>
          <button onClick={logout} className="btn-logout">Logout</button>
        </div>
        <ChatList
          activeChat={activeChat}
          onSelectChat={setActiveChat}
          onNewChat={() => {}}
        />
      </div>

      <div className="main-area">
        {activeCall ? (
          <CallScreen
            conversation={activeCall.conversation || null}
            conversationId={activeCall.conversationId}
            callType={activeCall.callType}
            isIncoming={activeCall.isIncoming}
            callerId={activeCall.callerId}
            onEndCall={() => setActiveCall(null)}
          />
        ) : (
          <MessageThread
            conversation={activeChat}
            onStartCall={handleStartCall}
          />
        )}
      </div>

      {incomingCall && !activeCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-modal">
            <h3>Incoming {incomingCall.callType} call</h3>
            <p>from {incomingCall.callerName}</p>
            <div className="incoming-call-actions">
              <button className="btn-accept" onClick={handleAcceptIncoming}>Accept</button>
              <button className="btn-decline" onClick={handleDeclineIncoming}>Decline</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
