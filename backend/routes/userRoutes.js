const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const Room = require('../models/Room');
const authMiddleware = require('../middleware/authMiddleware');



// Get all users (excluding current user)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('-password')
      .sort({ online: -1, username: 1 });
    
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Search users
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { bio: { $regex: query, $options: 'i' } },
        { interests: { $regex: query, $options: 'i' } }
      ],
      _id: { $ne: req.user._id }
    }).select('-password');

    res.json(users);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: 'Search failed' });
  }
});

// Get user statistics
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Count total messages (sent or received by user)
    const totalMessages = await Message.countDocuments({
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    });

    // Count rooms user is part of (as member or creator) - use aggregation to avoid duplicates
    const roomStats = await Room.aggregate([
      {
        $match: {
          $or: [
            { members: userId },
            { creator: userId }
          ]
        }
      },
      {
        $group: {
          _id: null,
          uniqueRooms: { $addToSet: "$_id" }
        }
      }
    ]);
    
    const totalRooms = roomStats.length > 0 ? roomStats[0].uniqueRooms.length : 0;
    


    // Count unique contacts (users they've messaged with)
    const contacts = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: userId },
            { receiver: userId }
          ]
        }
      },
      {
        $group: {
          _id: null,
          uniqueUsers: {
            $addToSet: {
              $cond: [
                { $eq: ['$sender', userId] },
                '$receiver',
                '$sender'
              ]
            }
          }
        }
      }
    ]);

    const totalContacts = contacts.length > 0 ? contacts[0].uniqueUsers.length : 0;

    const response = {
      totalMessages,
      totalRooms,
      totalContacts
    };
    
    console.log(`Stats for user ${req.user.username}:`, response);
    res.json(response);
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({ message: 'Failed to fetch user statistics' });
  }
});

// Get user profile for dashboard
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    console.log('=== PROFILE REQUEST ===');
    console.log('User ID:', req.user._id);
    console.log('Username:', req.user.username);
    console.log('Request headers:', req.headers);
    
    const user = await User.findById(req.user._id)
      .select('-password');
    
    console.log('Profile data:', user);
    console.log('Sending profile response:', user);
    res.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: 'Failed to fetch profile' });
  }
});

// Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    console.log('=== PROFILE UPDATE REQUEST ===');
    console.log('User ID:', req.user._id);
    console.log('Request body:', req.body);
    
    const { username, email, bio } = req.body;
    
    // Check if username is already taken by another user
    if (username && username !== req.user.username) {
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        return res.status(400).json({ message: 'Username already taken' });
      }
    }

    // Check if email is already taken by another user
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already taken' });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { username, email, bio },
      { new: true }
    ).select('-password');

    console.log('Updated user:', updatedUser);
    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// Change password
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user._id);
    
    // Verify current password
    const isPasswordValid = await user.comparePassword(currentPassword);
    
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ message: 'Failed to change password' });
  }
});

// Cleanup duplicate room members (temporary route)
router.post('/cleanup-rooms', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find all rooms where user is a member
    const rooms = await Room.find({ members: userId });
    
    let cleanedCount = 0;
    for (const room of rooms) {
      const memberCount = room.members.filter(m => m.toString() === userId.toString()).length;
      if (memberCount > 1) {
        // Remove all instances of the user
        room.members = room.members.filter(m => m.toString() !== userId.toString());
        // Add user back once
        room.members.push(userId);
        await room.save();
        cleanedCount++;
      }
    }
    
    res.json({ 
      message: `Cleaned up ${cleanedCount} rooms with duplicate members`,
      cleanedCount 
    });
  } catch (error) {
    console.error("Error cleaning up rooms:", error);
    res.status(500).json({ message: 'Failed to cleanup rooms' });
  }
});

// Delete account
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Delete user's messages
    await Message.deleteMany({
      $or: [
        { sender: userId },
        { receiver: userId }
      ]
    });

    // Remove user from rooms
    await Room.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error("Error deleting account:", error);
    res.status(500).json({ message: 'Failed to delete account' });
  }
});





// Get user profile by ID (must be last to avoid conflicts with /stats and /profile)
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

module.exports = router;