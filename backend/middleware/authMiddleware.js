const jwt = require("jsonwebtoken");
const User = require("../models/User");

const authMiddleware = async (req, res, next) => {
  console.log('=== AUTH MIDDLEWARE ===');
  console.log('Request URL:', req.url);
  console.log('Request method:', req.method);
  console.log('All headers:', req.headers);
  
  const token = req.header("Authorization")?.replace("Bearer ", "");
  console.log("Token:", token);
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ message: "Authentication failed!" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log("Decoded token:", decoded);

    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log('User not found in database');
      return res.status(401).json({ message: "Authentication failed!" });
    }

    console.log('User authenticated successfully:', user.username);
    req.user = user;
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return res.status(401).json({ message: "Authentication failed!" });
  }
};


module.exports = authMiddleware;