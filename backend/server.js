require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketio = require('socket.io');
const jwt = require('jsonwebtoken');
const Message = require('./models/Message');
const User = require('./models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// Middleware
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000',
  'https://chit-chat-5lbam5x2b-rachit012s-projects.vercel.app',
  'https://chit-chat-6vg7jj4q1-rachit012s-projects.vercel.app',
  'https://chit-chat-lime-three.vercel.app', 
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Configure Multer for local file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// File filter to accept only certain types
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || 
      file.mimetype.startsWith('video/') || 
      file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Add a route to serve files with proper headers
app.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error('Error serving file:', err);
      res.status(404).send('File not found');
    }
  });
});

// Remove the conflicting upload endpoint - this will be handled by messageRoutes.js
// app.post('/api/upload', upload.single('file'), (req, res) => {
//   try {
//     const file = req.file;
//     if (!file) {
//       return res.status(400).send('No file uploaded');
//     }

//     // Read the file and send it back as response
//     const filePath = path.join(__dirname, file.path);
//     const fileStream = fs.createReadStream(filePath);
    
//     // Set appropriate headers
//     res.setHeader('Content-Type', file.mimetype);
//     res.setHeader('Content-Disposition', `attachment; filename=${file.originalname}`);
    
//     // Stream the file back
//     fileStream.pipe(res);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send('Error processing file');
//   }
// });

// Socket.IO setup
const io = socketio(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  }
});

// Socket auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('No token provided'));

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return next(new Error('Invalid token'));
    
    try {
      // Update user's online status
      await User.findByIdAndUpdate(decoded.userId, { 
        online: true,
        lastSeen: null
      });
      
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (error) {
      next(new Error('User update failed'));
    }
  });
});

// Track active rooms
const activeRooms = new Map();

// Socket connection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.userId} with socket ID: ${socket.id}`);
  
  // Join user's personal room
  socket.join(socket.userId);
  
  // Debug: List all connected users
  const connectedUsers = Array.from(io.sockets.sockets.values()).map(s => s.userId);
  console.log('Currently connected users:', connectedUsers);
  
  // Notify others this user is online
  socket.broadcast.emit('userOnline', socket.userId);

  // Handle private messages
  socket.on('sendMessage', async ({ receiver, text, clientMsgId, attachments = [], type, location }) => {
    try {
      console.log('=== MESSAGE DEBUG ===');
      console.log('Message type:', type);
      console.log('Location data:', location);
      console.log('Raw attachments:', attachments);
      console.log('Attachments type:', typeof attachments);
      console.log('Is Array?', Array.isArray(attachments));
      console.log('Attachments stringified:', JSON.stringify(attachments));
      
      // Ensure attachments is an array and properly formatted
      let attachmentsArray = [];
      if (Array.isArray(attachments)) {
        attachmentsArray = attachments;
      } else if (typeof attachments === 'string') {
        try {
          attachmentsArray = JSON.parse(attachments);
        } catch (e) {
          console.error('Failed to parse attachments string:', e);
          attachmentsArray = [];
        }
      }
      
      console.log('Final attachments array:', attachmentsArray);
      console.log('Final array type:', typeof attachmentsArray);
      console.log('Final array isArray:', Array.isArray(attachmentsArray));
      
      const messageData = {
        sender: socket.userId,
        receiver: receiver,
        text: text || '',
        attachments: attachmentsArray,
        clientMsgId,
        type: type || 'text'
      };

      // Add location data if it's a location message
      if (type === 'location' && location) {
        messageData.location = location;
      }
      
      console.log('Message data to save:', messageData);
      
      const message = new Message(messageData);

      const savedMessage = await message.save();
      console.log('Message saved successfully:', savedMessage._id);
      
      const populatedMessage = await Message.populate(savedMessage, [
        { path: 'sender', select: 'username avatar' },
        { path: 'receiver', select: 'username avatar' }
      ]);

      const messageToEmit = {
        ...populatedMessage.toObject(),
        clientMsgId,
        fromServer: true
      };
      
      // Send to receiver
      io.to(receiver).emit('newMessage', messageToEmit);
      // Also send back to sender
      io.to(socket.userId).emit('newMessage', messageToEmit);
      
    } catch (err) {
      console.error('Message error:', err.message);
      console.error('Full error:', err);
      socket.emit('messageError', { 
        error: 'Failed to send message',
        clientMsgId
      });
    }
  });

  // Handle message deletion
  socket.on('deleteMessage', async ({ messageId, deleteType = 'both' }) => {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user is authorized to delete this message
      const isSender = message.sender.toString() === socket.userId;
      const isReceiver = message.receiver && message.receiver.toString() === socket.userId;
      
      if (!isSender && !isReceiver) {
        throw new Error('Unauthorized to delete this message');
      }

      let updatedMessage;
      
      if (deleteType === 'both' && isSender) {
        // Delete for both sender and receiver (only sender can do this)
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            isDeleted: true,
            deletedAt: new Date(),
            text: '[Message deleted]',
            attachments: [] // Remove attachments
          },
          { new: true }
        );
        
        // Notify both sender and receiver
        io.to(socket.userId).emit('messageDeleted', {
          messageId,
          deleteType: 'both',
          message: updatedMessage
        });
        
        if (message.receiver) {
          io.to(message.receiver.toString()).emit('messageDeleted', {
            messageId,
            deleteType: 'both',
            message: updatedMessage
          });
        }
        
      } else if (deleteType === 'sender' && isSender) {
        // Delete only for sender
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            deletedForSender: true,
            deletedAt: new Date()
          },
          { new: true }
        );
        
        // Notify only sender
        io.to(socket.userId).emit('messageDeleted', {
          messageId,
          deleteType: 'sender',
          message: updatedMessage
        });
        
      } else if (deleteType === 'receiver' && isReceiver) {
        // Delete only for receiver
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            deletedForReceiver: true,
            deletedAt: new Date()
          },
          { new: true }
        );
        
        // Notify only receiver
        io.to(socket.userId).emit('messageDeleted', {
          messageId,
          deleteType: 'receiver',
          message: updatedMessage
        });
        
      } else {
        throw new Error('Invalid deletion type or insufficient permissions');
      }

      const populatedMessage = await Message.populate(updatedMessage, [
        { path: 'sender', select: 'username avatar' },
        { path: 'receiver', select: 'username avatar' }
      ]);
      
    } catch (err) {
      console.error('Delete message error:', err);
      socket.emit('messageError', { error: 'Failed to delete message' });
    }
  });

  // Handle joining chat rooms
  socket.on('joinRoom', async (roomId) => {
    socket.join(roomId);
    console.log(`${socket.userId} joined room ${roomId}`);
    
    // Track room activity
    if (!activeRooms.has(roomId)) {
      activeRooms.set(roomId, new Set());
    }
    activeRooms.get(roomId).add(socket.userId);
    
    // Notify room members
    io.to(roomId).emit('userJoinedRoom', {
      userId: socket.userId,
      username: socket.username,
      roomId: roomId
    });
  });

  // Handle leaving chat rooms
  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    console.log(`${socket.userId} left room ${roomId}`);
    
    if (activeRooms.has(roomId)) {
      activeRooms.get(roomId).delete(socket.userId);
      if (activeRooms.get(roomId).size === 0) {
        activeRooms.delete(roomId);
      }
    }
    
    // Notify room members
    io.to(roomId).emit('userLeftRoom', {
      userId: socket.userId,
      username: socket.username,
      roomId: roomId
    });
  });

  // Handle room messages
  socket.on('sendRoomMessage', async ({ roomId, text, tempId, sender, senderName, attachments = [] }) => {
    try {
      console.log('Received room message data:', { roomId, text, tempId, sender, senderName, attachments });
      console.log('Room attachments type:', typeof attachments);
      console.log('Room attachments value:', attachments);
      
      // Ensure attachments is an array and properly formatted
      let attachmentsArray = [];
      if (Array.isArray(attachments)) {
        attachmentsArray = attachments;
      } else if (typeof attachments === 'string') {
        try {
          attachmentsArray = JSON.parse(attachments);
        } catch (e) {
          console.error('Failed to parse room attachments string:', e);
          attachmentsArray = [];
        }
      }
      
      console.log('Processed room attachments array:', attachmentsArray);
      
      // Create immediate message object
      const immediateMessage = {
        _id: tempId,
        sender,
        senderName,
        room: roomId,
        text,
        attachments: attachmentsArray,
        createdAt: new Date(),
        tempId
      };

      // Broadcast immediately to all room members
      io.to(roomId).emit('newRoomMessage', immediateMessage);

      // Save to database in background
      const message = new Message({
        sender,
        room: roomId,
        text,
        attachments: attachmentsArray,
        clientMsgId: tempId
      });

      const savedMessage = await message.save();
      const populatedMessage = await Message.populate(savedMessage, [
        { path: 'sender', select: 'username avatar' }
      ]);

      // Broadcast the final saved message
      io.to(roomId).emit('newRoomMessage', {
        ...populatedMessage.toObject(),
        tempId
      });

    } catch (err) {
      console.error('Room message error:', err);
      socket.emit('messageError', { 
        error: 'Failed to send room message',
        tempId
      });
      io.to(roomId).emit('removeFailedMessage', { tempId });
    }
  });

  socket.on('deleteRoomMessage', async ({ messageId, deleteType = 'both' }) => {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user is authorized to delete this message
      const isSender = message.sender.toString() === socket.userId;
      
      if (!isSender) {
        throw new Error('Unauthorized to delete this message');
      }

      let updatedMessage;
      
      if (deleteType === 'both') {
        // Delete for everyone in the room
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            isDeleted: true,
            deletedAt: new Date(),
            text: '[Message deleted]',
            attachments: [] // Remove attachments
          },
          { new: true }
        );
        
        // Notify all room members
        io.to(message.room.toString()).emit('roomMessageDeleted', {
          messageId,
          deleteType: 'both',
          message: updatedMessage
        });
        
      } else if (deleteType === 'sender') {
        // Delete only for sender
        updatedMessage = await Message.findByIdAndUpdate(
          messageId,
          {
            deletedForSender: true,
            deletedAt: new Date()
          },
          { new: true }
        );
        
        // Notify only sender
        io.to(socket.userId).emit('roomMessageDeleted', {
          messageId,
          deleteType: 'sender',
          message: updatedMessage
        });
        
      } else {
        throw new Error('Invalid deletion type');
      }

      const populatedMessage = await Message.populate(updatedMessage, [
        { path: 'sender', select: 'username avatar' }
      ]);
      
    } catch (err) {
      console.error('Room message deletion error:', err);
      socket.emit('messageError', { error: 'Failed to delete room message' });
    }
  });

  // Handle call requests
  socket.on('callRequest', ({ to, from, type }) => {
    console.log(`[Call Request] From: ${from} -> To: ${to} (Type: ${type})`);
    
    // Find the target user's socket
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.userId === to);
    
    if (!targetSocket || !targetSocket.connected) {
      console.log(`[Call Request] User ${to} is offline`);
      socket.emit('callRejected', { 
        to: from,
        reason: 'User is offline'
      });
      return;
    }
    
    // Check if the target user is already in a call by checking their socket rooms
    const targetUserRooms = Array.from(targetSocket.rooms);
    const isInCall = targetUserRooms.some(room => room.startsWith('call_'));
    
    if (isInCall) {
      console.log(`[Call Request] User ${to} is already in a call`);
      socket.emit('callRejected', { 
        to: from,
        reason: 'User is busy'
      });
      return;
    }
    
    // Send the call request to the target user
    io.to(to).emit('callRequest', {
      caller: { _id: from, username: socket.username },
      type: type
    });
    
    console.log(`[Call Request] Call request sent to user ${to}`);
  });

  // Handle call acceptance
  socket.on('callAccepted', ({ to, from }) => {
    console.log(`[Call Accepted] From: ${from} -> To: ${to}`);
    
    // Create a call room for this specific call
    const callRoomId = `call_${from}_${to}_${Date.now()}`;
    
    // Join both users to the call room
    const callerSocket = Array.from(io.sockets.sockets.values()).find(s => s.userId === from);
    const calleeSocket = Array.from(io.sockets.sockets.values()).find(s => s.userId === to);
    
    if (callerSocket) {
      callerSocket.join(callRoomId);
      console.log(`[Call Accepted] Caller ${from} joined call room ${callRoomId}`);
    }
    
    if (calleeSocket) {
      calleeSocket.join(callRoomId);
      console.log(`[Call Accepted] Callee ${to} joined call room ${callRoomId}`);
    }
    
    io.to(to).emit('callAccepted', { from });
  });

  // Handle callee ready confirmation
  socket.on('calleeReady', ({ to }) => {
    console.log(`[Callee Ready] From: ${socket.userId} -> To: ${to}`);
    io.to(to).emit('calleeReady', { from: socket.userId });
  });

  // Handle call rejection
  socket.on('callRejected', ({ to, from }) => {
    console.log(`[Call Rejected] From: ${from} -> To: ${to}`);
    io.to(to).emit('callRejected', { from });
  });

  // Handle call ending
  socket.on('callEnded', ({ to }) => {
    console.log(`[Call Ended] From: ${socket.userId} -> To: ${to}`);
    
    // Leave all call rooms
    const userRooms = Array.from(socket.rooms);
    userRooms.forEach(room => {
      if (room.startsWith('call_')) {
        socket.leave(room);
        console.log(`[Call Ended] User ${socket.userId} left call room ${room}`);
      }
    });
    
    io.to(to).emit('callEnded', { from: socket.userId });
  });

  // Handle WebRTC signaling
  socket.on('callSignal', ({ signal, to }) => {
    console.log(`[Call Signal] From: ${socket.userId} -> To: ${to}, Type: ${signal.type}`);
    
    // Find the target user's socket
    const targetSocket = Array.from(io.sockets.sockets.values()).find(s => s.userId === to);
    
    if (!targetSocket || !targetSocket.connected) {
      console.log(`[Call Signal] Target user ${to} is not connected, cannot send signal`);
      return;
    }
    
    io.to(to).emit('callSignal', {
      signal: signal,
      from: socket.userId,
    });
    
    console.log(`[Call Signal] Signal sent successfully to user ${to}`);
  });

  // Handle group call requests
  socket.on('groupCallRequest', ({ roomId, from, type }) => {
    console.log(`Group call request from ${from} in room ${roomId}, type: ${type}`);
    
    // ✅ FIX: Use socket.to(roomId) to broadcast to everyone in the room EXCEPT the sender.
    // This prevents the caller from receiving their own request and causing a race condition.
    socket.to(roomId).emit('groupCallRequest', {
      caller: { _id: from, username: socket.username },
      roomId: roomId,
      type: type
    });
  });

  // Handle group call acceptance
  socket.on('groupCallAccepted', ({ roomId, to, from }) => {
    console.log(`Group call accepted from ${from} to ${to} in room ${roomId}`);
    io.to(to).emit('groupCallAccepted', {
      from: from,
      roomId: roomId,
      signal: null
    });
  });
  // Handle group call rejection
  socket.on('groupCallRejected', ({ roomId, to, from }) => {
    console.log(`Group call rejected from ${from} to ${to} in room ${roomId}`);
    io.to(to).emit('groupCallRejected', { from: from, roomId: roomId });
  });

  // Handle group call ending
  socket.on('groupCallEnded', ({ roomId, from }) => {
    console.log(`Group call ended from ${from} in room ${roomId}`);
    io.to(roomId).emit('groupCallEnded', { from: from, roomId: roomId });
  });

  // Handle group WebRTC signaling
  socket.on('groupCallSignal', ({ signal, to, roomId }) => {
    console.log(`Group call signal from ${socket.userId} to ${to} in room ${roomId}`);
    io.to(to).emit('groupCallSignal', {
      signal: signal,
      from: socket.userId,
      roomId: roomId
    });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${socket.userId}`);
    
    // Debug: List remaining connected users
    const remainingUsers = Array.from(io.sockets.sockets.values()).map(s => s.userId);
    console.log('Remaining connected users:', remainingUsers);
    
    try {
      // Update user's online status
      await User.findByIdAndUpdate(socket.userId, { 
        online: false,
        lastSeen: new Date()
      });
      
      // Notify others this user went offline
      socket.broadcast.emit('userOffline', socket.userId);
      
      // Leave all rooms
      activeRooms.forEach((users, roomId) => {
        if (users.has(socket.userId)) {
          users.delete(socket.userId);
          io.to(roomId).emit('userLeftRoom', {
            userId: socket.userId,
            username: socket.username,
            roomId: roomId
          });
          
          if (users.size === 0) {
            activeRooms.delete(roomId);
          }
        }
      });
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  });
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/rooms', require('./routes/roomRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// Serve frontend build in production
if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist")));

  app.get(/.*/, (req, res) => {
    res.sendFile(path.resolve(__dirname, "../dist", "index.html"));
  });
}

// Server start
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));