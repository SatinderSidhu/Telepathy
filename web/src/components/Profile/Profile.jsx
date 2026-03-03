import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import axios from 'axios';
import './Profile.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:3000/api';

function Profile({ onClose }) {
  const { user, setUser } = useAuth();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Profile update state
  const [username, setUsername] = useState(user?.username || '');
  const [status, setStatus] = useState(user?.status || '');

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Avatar upload state
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(user?.avatar_url || '');

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('Only image files are allowed');
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleUploadAvatar = async () => {
    if (!avatarFile) {
      setError('Please select an image');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const formData = new FormData();
      formData.append('avatar', avatarFile);

      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/users/profile/avatar`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setUser({ ...user, avatar_url: response.data.avatar_url });
      setSuccess('Avatar updated successfully');
      setAvatarFile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to upload avatar');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      const response = await axios.patch(
        `${API_URL}/users/profile`,
        { username, status },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUser(response.data);
      setSuccess('Profile updated successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All password fields are required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/users/profile/password`,
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="profile-modal">
      <div className="profile-container">
        <div className="profile-header">
          <h2>My Profile</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {success && <div className="success-msg">{success}</div>}

        {/* Avatar Section */}
        <div className="profile-section">
          <h3>Profile Picture</h3>
          <div className="avatar-upload">
            <div className="avatar-preview">
              {avatarPreview ? (
                <img src={avatarPreview.startsWith('blob:') ? avatarPreview : `${API_URL.replace('/api', '')}${avatarPreview}`} alt="Avatar" />
              ) : (
                <div className="avatar-placeholder">{user?.username?.charAt(0).toUpperCase()}</div>
              )}
            </div>
            <div className="avatar-actions">
              <label htmlFor="avatar-input" className="btn-secondary">
                Choose Image
              </label>
              <input
                id="avatar-input"
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                style={{ display: 'none' }}
              />
              {avatarFile && (
                <button
                  className="btn-primary"
                  onClick={handleUploadAvatar}
                  disabled={loading}
                >
                  Upload
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Profile Info Section */}
        <div className="profile-section">
          <h3>Profile Information</h3>
          <form onSubmit={handleUpdateProfile}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="disabled-input"
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <input
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                placeholder="What's on your mind?"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              Save Changes
            </button>
          </form>
        </div>

        {/* Change Password Section */}
        <div className="profile-section">
          <h3>Change Password</h3>
          <form onSubmit={handleChangePassword}>
            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              Change Password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default Profile;
