// src/utils/api.js
import axios from 'axios';
import config from '../config/env.js';

const api = axios.create({
  baseURL: config.API_URL,
  withCredentials: true
});

// Add request interceptor to include token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    // Prevent infinite loop on refresh token endpoint
    if (originalRequest.url.includes('/auth/refresh')) {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // If unauthorized and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Try to refresh token
        const { data } = await axios.post(
          `${config.API_URL.replace('/api', '')}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        
        // Store new token
        localStorage.setItem('accessToken', data.token);
        
        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${data.token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed - redirect to login
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }
    
    return Promise.reject(error);
  }
);

export default api;