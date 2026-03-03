import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import './Profile.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://localhost:3001/api';

function Profile({ onClose }) {
  const { user, updateUser } = useAuth();
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

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);

      console.log('Uploading avatar...');
      const response = await api.post('/users/profile/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      console.log('Avatar upload successful:', response);
      console.log('Response data:', response.data);

      // Update user state with new avatar
      if (response.data && response.data.avatar_url) {
        const newAvatarUrl = response.data.avatar_url;
        console.log('New avatar URL:', newAvatarUrl);

        updateUser({ avatar_url: newAvatarUrl });
        setAvatarPreview(newAvatarUrl);
        setAvatarFile(null);
        setSuccess('Avatar updated successfully');
      } else {
        throw new Error('Invalid response format');
      }
    } catch (err) {
      console.error('Avatar upload failed:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      setError(err.response?.data?.error || err.message || 'Failed to upload avatar');
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

      const response = await api.patch('/users/profile', { username, status });

      updateUser(response.data);
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

      await api.post('/users/profile/password', { currentPassword, newPassword });

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
                <img src={avatarPreview.startsWith('blob:') ? avatarPreview : `https://localhost:3001${avatarPreview}`} alt="Avatar" />
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
