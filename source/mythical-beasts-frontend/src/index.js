import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { initFaro } from './faro';

// Initialize Faro SDK asynchronously
const initializeApp = async () => {
  try {
    await initFaro();
    console.log('✅ Faro SDK initialized successfully');
  } catch (error) {
    console.warn('⚠️ Faro SDK failed to initialize, continuing without observability:', error);
  }

  // Render the app regardless of Faro initialization status
  const root = ReactDOM.createRoot(document.getElementById('root'));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

// Start the app
initializeApp();
