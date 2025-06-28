import axios from 'axios';
import { getFaro } from '../faro';

// Base URL for the API - configurable for different environments
// Default tries the nginx proxy first, falls back to direct API access
const getApiBaseUrl = () => {
  // Check if we're running in production build
  const isProduction = process.env.NODE_ENV === 'production';

  // Use environment variable if set
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }

  // In production (Docker), try to use relative path for nginx proxy
  if (isProduction && window.location.hostname === 'localhost' && window.location.port === '3001') {
    return '/api';  // Use nginx proxy
  }

  // Default to direct API access
  return 'http://localhost:4000';
};

const API_BASE_URL = getApiBaseUrl();

// Create axios instance with default config
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging and trace propagation
api.interceptors.request.use(
  (config) => {
    console.log(`🚀 API Request: ${config.method?.toUpperCase()} ${config.url}`);

    return config;
  },
  (error) => {
    console.error('❌ API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and logging
api.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ API Response Error:', error.response?.status, error.message);

    return Promise.reject(error);
  }
);

/**
 * Get all names for a specific beast type
 * @param {string} beastType - The type of beast (unicorn, manticore, etc.)
 * @returns {Promise<Array>} Array of beast names
 */
export const getBeastData = async (beastType) => {
  // Simple operation - Faro automatically instruents this HTTP request
  try {
    const response = await api.get(`/${beastType}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching ${beastType} data:`, error);
    throw error;
  }
};

/**
 * Add a new name to a specific beast type
 * @param {string} beastType - The type of beast
 * @param {string} name - The name to add
 * @returns {Promise<void>}
 */
export const addBeastName = async (beastType, name) => {
  try {
    const response = await api.post(`/${beastType}`, { name });
    return response.data;
  } catch (error) {
    console.error(`Error adding ${name} to ${beastType}:`, error);
    throw error;
  }
};

/**
 * Delete a name from a specific beast type
 * @param {string} beastType - The type of beast
 * @param {string} name - The name to delete
 * @returns {Promise<void>}
 */
export const deleteBeastName = async (beastType, name) => {
  try {
    const response = await api.delete(`/${beastType}`, {
      data: { name }
    });
    return response.data;
  } catch (error) {
    console.error(`Error deleting ${name} from ${beastType}:`, error);
    throw error;
  }
};

/**
 * Check server health/connectivity
 * @returns {Promise<boolean>} True if server is accessible
 */
export const checkServerHealth = async () => {
  try {
    // Try to fetch data from a known endpoint
    await getBeastData('unicorn');
    return true;
  } catch (error) {
    return false;
  }
};

export default api;
