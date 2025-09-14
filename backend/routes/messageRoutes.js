const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require('path');
const Message = require('../models/Message');
const authMiddleware = require('../middleware/authMiddleware');

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || 
      file.mimetype.startsWith('video/') || 
      file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

// Set up Multer for file uploads
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Handle file uploads
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }


    // Build dynamic base URL
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const fileInfo = {
      filename: req.file.filename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      url: `${baseUrl}/uploads/${req.file.filename}`,
      type: req.file.mimetype.startsWith('image/') ? 'image' : 'file'
    };

    res.status(200).json(fileInfo);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'File upload failed' });
  }
});

router.get('/room/:roomId', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const messages = await Message.find({ room: req.params.roomId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username avatar');

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Get messages between two users with pagination
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user._id }
      ],
      // Filter out messages deleted for the current user
      $and: [
        {
          $or: [
            { isDeleted: false },
            { 
              $and: [
                { isDeleted: true },
                { 
                  $or: [
                    { sender: req.user._id, deletedForSender: false },
                    { receiver: req.user._id, deletedForReceiver: false }
                  ]
                }
              ]
            }
          ]
        }
      ]
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('sender', 'username avatar')
    .populate('receiver', 'username avatar');

    res.json(messages.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { receiverId, roomId, text, clientMsgId, type, location } = req.body;
    
    // For location messages, text can be empty
    if (!text && type !== 'location') {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const messageData = {
      sender: req.user._id,
      text: text || '', // Ensure text is never undefined
      clientMsgId,
      type: type || 'text'
    };

    // Add location data if it's a location message
    if (type === 'location' && location) {
      messageData.location = location;
    }

    if (receiverId) {
      messageData.receiver = receiverId;
    } else if (roomId) {
      messageData.room = roomId;
    } else {
      return res.status(400).json({ message: 'Either receiverId or roomId is required' });
    }

    const message = new Message(messageData);
    await message.save();
    
    const populatedMessage = await Message.populate(message, [
      { path: 'sender', select: 'username avatar' },
      { path: 'receiver', select: 'username avatar' },
      { path: 'room', select: 'name' }
    ]);

    res.status(201).json(populatedMessage);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a message
router.delete('/:messageId', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findOneAndDelete({
      _id: req.params.messageId,
      sender: req.user._id
    });

    if (!message) {
      return res.status(404).json({ message: 'Message not found or unauthorized' });
    }

    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test endpoint for creating messages with attachments
router.post('/test-with-attachments', authMiddleware, async (req, res) => {
  try {
    const { receiverId, text, attachments = [] } = req.body;
    
    console.log('=== API TEST DEBUG ===');
    console.log('Received attachments:', attachments);
    console.log('Attachments type:', typeof attachments);
    console.log('Is Array?', Array.isArray(attachments));
    
    const messageData = {
      sender: req.user._id,
      text,
      attachments: Array.isArray(attachments) ? attachments : [],
      clientMsgId: `test-${Date.now()}`
    };
    
    if (receiverId) {
      messageData.receiver = receiverId;
    }
    
    console.log('Message data to save:', messageData);
    
    const message = new Message(messageData);
    const savedMessage = await message.save();
    
    console.log('Message saved successfully:', savedMessage._id);
    
    const populatedMessage = await Message.populate(savedMessage, [
      { path: 'sender', select: 'username avatar' },
      { path: 'receiver', select: 'username avatar' }
    ]);

    res.status(201).json(populatedMessage);
  } catch (err) {
    console.error('Test message error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;