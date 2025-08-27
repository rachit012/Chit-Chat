const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  receiver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  text: {
    type: String
  },
  type: {
    type: String,
    enum: ['text', 'file', 'location'],
    default: 'text'
  },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String }
  },
  attachments: {
    type: [{
      url: { type: String, required: true },
      type: { type: String, required: true }, // 'image', 'video', 'document', etc.
      name: { type: String, required: true },
      size: { type: Number, required: true }
    }],
    default: []
  },
  clientMsgId: {
    type: String,
    unique: true,
    sparse: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedForSender: {
    type: Boolean,
    default: false
  },
  deletedForReceiver: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Add indexes for faster querying and to prevent duplicates
messageSchema.index({ sender: 1, receiver: 1, text: 1, clientMsgId: 1, createdAt: 1 }, { unique: true });
messageSchema.index({ room: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);