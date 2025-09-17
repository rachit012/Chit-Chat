// Environment configuration
const config = {
  // API URL - can be overridden by environment variables
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  
  // Development mode
  IS_DEV: import.meta.env.DEV || false,
  
  // Production mode
  IS_PROD: import.meta.env.PROD || false
};

export default config; 