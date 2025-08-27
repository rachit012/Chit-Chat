const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

// Test endpoint to verify AI routes are working
router.get('/test', (req, res) => {
  res.json({ 
    message: 'AI routes are working',
    apiKeySet: !!process.env.GEMINI_API_KEY,
    timestamp: new Date()
  });
});

// Initialize Google Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error('GEMINI_API_KEY is not set in environment variables');
}

const genAI = new GoogleGenerativeAI(apiKey || 'your-api-key-here');

// Chat with AI
router.post('/chat', authMiddleware, async (req, res) => {
  try {
    console.log('=== AI CHAT REQUEST ===');
    console.log('Request body:', req.body);
    console.log('User from auth:', req.user);
    
    const { message, userId } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('Initializing Gemini AI model...');
    // Get the generative model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    console.log('Model initialized successfully');

    console.log('Sending message to Gemini:', message);
    // Send the message and get response using generateContent
    const prompt = `You are a helpful AI assistant integrated into a chat application. Be concise, friendly, and helpful. Keep responses under 200 words unless the user asks for more detail.

User: ${message}`;
    
    const result = await model.generateContent(prompt);
    console.log('Message sent, getting response...');
    const response = await result.response;
    const text = response.text();
    console.log('Response received:', text.substring(0, 100) + '...');

    res.json({ 
      response: text,
      userId: userId,
      timestamp: new Date()
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    console.error('Environment check - GEMINI_API_KEY exists:', !!process.env.GEMINI_API_KEY);
    console.error('Environment check - GEMINI_API_KEY value:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET');
    
    // Handle missing API key
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here') {
      console.error('API key is missing or not properly set');
      return res.status(500).json({ 
        error: 'AI service is not configured. Please add your Google Gemini API key to the backend .env file.' 
      });
    }
    
    // Handle specific Gemini API errors
    if (error.message.includes('API_KEY') || error.message.includes('Invalid API key')) {
      console.error('Invalid API key error detected');
      return res.status(500).json({ 
        error: 'Invalid AI service API key. Please check your Google Gemini API key.' 
      });
    }
    
    if (error.message.includes('quota') || error.message.includes('rate limit')) {
      console.error('Rate limit error detected');
      return res.status(429).json({ 
        error: 'AI service is temporarily unavailable due to high usage. Please try again later.' 
      });
    }

    // Log the actual error for debugging
    console.error('Unknown AI error:', error.message);
    res.status(500).json({ 
      error: `AI service error: ${error.message}` 
    });
  }
});

module.exports = router; 