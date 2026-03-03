import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import { useAuth } from '../../context/AuthContext';

export default function MessageThread({ conversation, onStartCall }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    if (!conversation) return;

    loadMessages();

    const socket = getSocket();
    if (!socket) return;

    socket.emit('chat:join', conversation.id);

    socket.on('chat:message', (msg) => {
      if (msg.conversation_id === conversation.id) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    socket.on('chat:typing', ({ conversationId, username }) => {
      if (conversationId === conversation.id) {
        setTypingUsers((prev) => [...new Set([...prev, username])]);
      }
    });

    socket.on('chat:stopTyping', ({ conversationId, userId }) => {
      if (conversationId === conversation.id) {
        setTypingUsers((prev) => prev.filter((u) => u !== userId));
      }
    });

    socket.on('chat:messageDeleted', ({ messageId, deleteFor }) => {
      if (deleteFor === 'everyone') {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        // For "delete for me", just remove from local state
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
    });

    return () => {
      socket.emit('chat:leave', conversation.id);
      socket.off('chat:message');
      socket.off('chat:typing');
      socket.off('chat:stopTyping');
      socket.off('chat:messageDeleted');
    };
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadMessages() {
    try {
      const { data } = await api.get(`/chats/conversations/${conversation.id}/messages`);
      setMessages(data);
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  function handleTyping() {
    const socket = getSocket();
    if (!socket) return;

    socket.emit('chat:typing', { conversationId: conversation.id });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:stopTyping', { conversationId: conversation.id });
    }, 2000);
  }

  function sendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const socket = getSocket();
    if (!socket) return;

    socket.emit('chat:message', {
      conversationId: conversation.id,
      content: newMessage.trim(),
      type: 'text',
    });

    socket.emit('chat:stopTyping', { conversationId: conversation.id });
    setNewMessage('');
  }

  function getOtherUser() {
    if (conversation.type === 'group') return null;
    return conversation.members?.find((m) => m.id !== user.id);
  }

  function getDisplayName() {
    if (conversation.type === 'group') return conversation.name;
    const other = getOtherUser();
    return other?.username || 'Unknown';
  }

  async function handleDeleteMessage(messageId, deleteFor) {
    try {
      const socket = getSocket();
      if (!socket) return;

      socket.emit('chat:deleteMessage', {
        messageId,
        deleteFor,
        conversationId: conversation.id
      });

      setDeleteModal(null);
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  }

  function showDeleteModal(msg) {
    setDeleteModal(msg);
  }

  if (!conversation) {
    return (
      <div className="message-thread empty">
        <p>Select a conversation to start chatting</p>
      </div>
    );
  }

  return (
    <div className="message-thread">
      <div className="thread-header">
        <div className="thread-info">
          <h3>{getDisplayName()}</h3>
          {conversation.type === 'group' && (
            <span className="member-count">{conversation.members?.length} members</span>
          )}
        </div>
        <div className="thread-actions">
          <button onClick={() => onStartCall('audio')} title="Audio call">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </button>
          <button onClick={() => onStartCall('video')} title="Video call">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7"/>
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="messages">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.sender_id === user.id ? 'own' : 'other'}`}
            onMouseEnter={() => setHoveredMessage(msg.id)}
            onMouseLeave={() => setHoveredMessage(null)}
          >
            {msg.sender_id !== user.id && (
              <span className="sender-name">{msg.sender_username}</span>
            )}
            <div className="message-bubble">
              <p>{msg.content}</p>
              <span className="message-time">
                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {hoveredMessage === msg.id && (
                <button
                  className="delete-message-btn"
                  onClick={() => showDeleteModal(msg)}
                  title="Delete message"
                >
                  🗑️
                </button>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          {typingUsers.join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
        </div>
      )}

      <form className="message-input" onSubmit={sendMessage}>
        <input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => {
            setNewMessage(e.target.value);
            handleTyping();
          }}
        />
        <button type="submit" disabled={!newMessage.trim()}>Send</button>
      </form>

      {deleteModal && (
        <div className="delete-modal-overlay" onClick={() => setDeleteModal(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Message</h3>
            <p>Choose who you want to delete this message for:</p>
            <div className="delete-modal-actions">
              <button
                className="btn-delete-me"
                onClick={() => handleDeleteMessage(deleteModal.id, 'me')}
              >
                Delete for me
              </button>
              {deleteModal.sender_id === user.id && (
                <button
                  className="btn-delete-everyone"
                  onClick={() => handleDeleteMessage(deleteModal.id, 'everyone')}
                >
                  Delete for everyone
                </button>
              )}
              <button
                className="btn-cancel"
                onClick={() => setDeleteModal(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
