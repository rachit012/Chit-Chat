const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const authMiddleware = require('../middleware/authMiddleware');

// Create a new room
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description, isPublic, tags } = req.body;
    
    const existingRoom = await Room.findOne({ name });
    if (existingRoom) {
      return res.status(400).json({ message: 'Room name already exists' });
    }

    const newRoom = new Room({
      name,
      description,
      creator: req.user._id,
      members: [req.user._id], // Creator is automatically a member
      isPublic,
      tags
    });

    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all public rooms
router.get('/', authMiddleware, async (req, res) => {
  try {
    const rooms = await Room.find({ isPublic: true })
      .populate('creator', 'username avatar')
      .populate('members', 'username avatar');
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search rooms
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 2) {
      return res.status(400).json({ message: 'Search query must be at least 2 characters' });
    }

    const rooms = await Room.find(
      { $text: { $search: query }, isPublic: true },
      { score: { $meta: 'textScore' } }
    )
    .sort({ score: { $meta: 'textScore' } })
    .populate('creator', 'username avatar')
    .populate('members', 'username avatar');

    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join a room
router.post('/:roomId/join', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is already a member (using string comparison for ObjectId)
    const isAlreadyMember = room.members.some(member => 
      member.toString() === req.user._id.toString()
    );

    if (!isAlreadyMember) {
      room.members.push(req.user._id);
      await room.save();
    }

    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Leave a room
router.post('/:roomId/leave', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    room.members = room.members.filter(member => member.toString() !== req.user._id.toString());
    await room.save();

    res.json({ message: 'Left room successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get room details
router.get('/:roomId', authMiddleware, async (req, res) => {
  try {
    const room = await Room.findById(req.params.roomId)
      .populate('creator', 'username avatar')
      .populate('members', 'username avatar');

    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    res.json(room);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;