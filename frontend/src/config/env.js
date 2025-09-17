const config = {
  API_URL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  
  IS_DEV: import.meta.env.DEV || false,
  
  IS_PROD: import.meta.env.PROD || false
};

export default config; 