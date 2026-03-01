import { useState, useEffect } from 'react';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

export default function ChatList({ activeChat, onSelectChat, onNewChat }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const { onlineUsers } = useSocket();

  useEffect(() => {
    loadConversations();

    const socket = getSocket();
    if (socket) {
      socket.on('chat:message', () => loadConversations());
    }
    return () => {
      socket?.off('chat:message');
    };
  }, []);

  async function loadConversations() {
    try {
      const { data } = await api.get('/chats/conversations');
      setConversations(data);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  async function handleSearch(query) {
    setSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
      setSearchResults(data);
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  async function startChat(userId) {
    try {
      const { data } = await api.post('/chats/conversations', {
        type: 'direct',
        memberIds: [userId],
      });
      setSearch('');
      setSearchResults([]);
      await loadConversations();
      onSelectChat(data);
    } catch (err) {
      console.error('Start chat error:', err);
    }
  }

  function getDisplayName(conv, currentUserId) {
    if (conv.type === 'group') return conv.name;
    const other = conv.members?.find((m) => m.id !== currentUserId);
    return other?.username || 'Unknown';
  }

  function getAvatar(conv, currentUserId) {
    if (conv.type === 'group') return conv.name?.[0]?.toUpperCase() || 'G';
    const other = conv.members?.find((m) => m.id !== currentUserId);
    return other?.username?.[0]?.toUpperCase() || '?';
  }

  function isOnline(conv, currentUserId) {
    if (conv.type === 'group') return false;
    const other = conv.members?.find((m) => m.id !== currentUserId);
    return other ? onlineUsers.includes(other.id) : false;
  }

  return (
    <div className="chat-list">
      <div className="chat-list-header">
        <h2>Chats</h2>
        <button className="btn-icon" onClick={onNewChat} title="New group chat">+</button>
      </div>
      <div className="search-box">
        <input
          type="text"
          placeholder="Search users..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {searchResults.length > 0 && (
        <div className="search-results">
          {searchResults.map((u) => (
            <div key={u.id} className="chat-item" onClick={() => startChat(u.id)}>
              <div className="avatar">{u.username[0].toUpperCase()}</div>
              <div className="chat-info">
                <span className="chat-name">{u.username}</span>
                <span className="chat-preview">Start a conversation</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="conversations">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`chat-item ${activeChat?.id === conv.id ? 'active' : ''}`}
            onClick={() => onSelectChat(conv)}
          >
            <div className={`avatar ${isOnline(conv, user.id) ? 'online' : ''}`}>
              {getAvatar(conv, user.id)}
            </div>
            <div className="chat-info">
              <span className="chat-name">{getDisplayName(conv, user.id)}</span>
              <span className="chat-preview">
                {conv.lastMessage?.content || 'No messages yet'}
              </span>
            </div>
          </div>
        ))}
        {conversations.length === 0 && !search && (
          <p className="empty-state">No conversations yet. Search for users to start chatting.</p>
        )}
      </div>
    </div>
  );
}
