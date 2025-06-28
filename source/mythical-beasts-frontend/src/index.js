import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initFaro } from './faro';

// Always initialise Faro first, to ensure that it is available for the React app.
console.log('🔍 Initializing Faro SDK before React app...');
try {
  initFaro();
  console.log('✅ Faro SDK initialized successfully');
} catch (error) {
  console.warn('⚠️ Faro SDK failed to initialize, continuing without observability:', error);
}

// Render the app!
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
