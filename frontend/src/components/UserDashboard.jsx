import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const UserDashboard = ({ currentUser, onClose, onLogout }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profileData, setProfileData] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    bio: currentUser?.bio || ''
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    bio: currentUser?.bio || ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchUserProfile();
  }, []);

    const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setError('No authentication token found. Please log in again.');
        setLoading(false);
        return;
      }
      
      // Fetch profile data
      const profileRes = await api.get('/users/profile');
      setProfileData(profileRes.data);
      setEditForm({
        username: profileRes.data.username || '',
        email: profileRes.data.email || '',
        bio: profileRes.data.bio || ''
      });
      
    } catch (err) {
      console.error('Failed to fetch user profile:', err);
      setError('Failed to load profile data. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async () => {
    try {
      setError(null);
      
      const response = await api.put('/users/profile', editForm);
      
      // Update the profile data with the response
      setProfileData(response.data);
      
      setIsEditing(false);
      setError(null);
      
      // Show success message
      alert('Profile updated successfully!');
      
      // Refresh the profile data
      await fetchUserProfile();
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError(err.response?.data?.message || 'Failed to update profile. Please try again.');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const currentPassword = formData.get('currentPassword');
    const newPassword = formData.get('newPassword');
    const confirmPassword = formData.get('confirmPassword');



    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      setError(null);
      await api.put('/users/change-password', {
        currentPassword,
        newPassword
      });
      e.target.reset();
      setError(null);
      alert('Password changed successfully! You will be logged out to use your new password.');
      
      // Log out the user after password change
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      onLogout();
    } catch (err) {
      console.error('Failed to change password:', err);
      setError(err.response?.data?.message || 'Failed to change password');
    }
  };

  const handleAccountDeletion = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    try {
      await api.delete('/users/account');
      onLogout();
    } catch (err) {
      console.error('Failed to delete account:', err);
      setError('Failed to delete account');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <span className="ml-3">Loading dashboard...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
              {currentUser?.username?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">User Dashboard</h2>
              <p className="text-sm text-gray-500">Manage your account and preferences</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

                           {/* Error Banner */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 mx-6 mt-4 rounded">
              {error}
            </div>
          )}

        {/* Content */}
        <div className="flex h-[calc(90vh-120px)]">
          {/* Sidebar */}
          <div className="w-64 border-r border-gray-200 bg-gray-50">
            <nav className="p-4">
                             {[
                 { id: 'profile', label: 'Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                 { id: 'security', label: 'Security', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
                 { id: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
                 { id: 'danger', label: 'Danger Zone', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z' }
               ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg mb-2 transition-colors ${
                    activeTab === tab.id 
                      ? tab.id === 'danger' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center">
                    <svg className="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
                    </svg>
                    {tab.label}
                  </div>
                </button>
              ))}
            </nav>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6">
                         {activeTab === 'profile' && (
               <div>
                 <h3 className="text-lg font-semibold mb-4">Profile Information</h3>
                 {!isEditing ? (
                   <div className="space-y-4">
                     <div className="flex items-center space-x-4">
                       <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-2xl">
                         {profileData?.username?.charAt(0).toUpperCase()}
                       </div>
                                               <div>
                          <h4 className="text-xl font-semibold">{profileData?.username}</h4>
                          <p className="text-gray-500">{profileData?.email}</p>
                        </div>
                     </div>
                     
                     {profileData?.bio && (
                       <div>
                         <h5 className="font-medium mb-2">Bio</h5>
                         <p className="text-gray-600">{profileData.bio}</p>
                       </div>
                     )}
                     
                     <button
                       onClick={() => setIsEditing(true)}
                       className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                     >
                       Edit Profile
                     </button>
                   </div>
                 ) : (
                   <form onSubmit={(e) => { e.preventDefault(); handleProfileUpdate(); }} className="space-y-4">
                     <div>
                       <label className="block text-sm font-medium mb-1">Username</label>
                       <input
                         type="text"
                         value={editForm.username}
                         onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         required
                       />
                     </div>
                     
                     <div>
                       <label className="block text-sm font-medium mb-1">Email</label>
                       <input
                         type="email"
                         value={editForm.email}
                         onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         required
                       />
                     </div>
                     
                     <div>
                       <label className="block text-sm font-medium mb-1">Bio</label>
                       <textarea
                         value={editForm.bio}
                         onChange={(e) => setEditForm(prev => ({ ...prev, bio: e.target.value }))}
                         rows="3"
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                         placeholder="Tell us about yourself..."
                       />
                     </div>
                     
                     <div className="flex space-x-3">
                       <button
                         type="submit"
                         className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                       >
                         Save Changes
                       </button>
                       <button
                         type="button"
                         onClick={() => setIsEditing(false)}
                         className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400"
                       >
                         Cancel
                       </button>
                     </div>
                   </form>
                 )}
               </div>
             )}

            {activeTab === 'security' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Security Settings</h3>
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium mb-4">Change Password</h4>
                  <form onSubmit={handlePasswordChange} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Current Password</label>
                      <input
                        type="password"
                        name="currentPassword"
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">New Password</label>
                      <input
                        type="password"
                        name="newPassword"
                        required
                        minLength="6"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium mb-1">Confirm New Password</label>
                      <input
                        type="password"
                        name="confirmPassword"
                        required
                        minLength="6"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                    >
                      Change Password
                    </button>
                  </form>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div>
                <h3 className="text-lg font-semibold mb-4">Account Settings</h3>
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h4 className="font-medium mb-4">Notification Preferences</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Message Notifications</p>
                        <p className="text-sm text-gray-500">Receive notifications for new messages</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Call Notifications</p>
                        <p className="text-sm text-gray-500">Receive notifications for incoming calls</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" className="sr-only peer" defaultChecked />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'danger' && (
              <div>
                <h3 className="text-lg font-semibold mb-4 text-red-600">Danger Zone</h3>
                <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                  <h4 className="font-medium text-red-800 mb-2">Delete Account</h4>
                  <p className="text-sm text-red-600 mb-4">
                    Once you delete your account, there is no going back. Please be certain.
                  </p>
                  <button
                    onClick={handleAccountDeletion}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard; 