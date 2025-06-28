import React, { useState, useEffect } from 'react';
import './App.css';
import BeastManager from './components/BeastManager';
import { getBeastData } from './services/api';

const BEAST_TYPES = [
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', color: '#ff6b6b' },
  { id: 'manticore', name: 'Manticore', emoji: '🦁', color: '#4ecdc4' },
  { id: 'illithid', name: 'Illithid', emoji: '🐙', color: '#45b7d1' },
  { id: 'owlbear', name: 'Owlbear', emoji: '🦉', color: '#96ceb4' },
  { id: 'beholder', name: 'Beholder', emoji: '👁️', color: '#feca57' },
];

function App() {
  const [selectedBeast, setSelectedBeast] = useState(BEAST_TYPES[0]);
  const [serverStatus, setServerStatus] = useState('checking');

  useEffect(() => {
    // Check if server is accessible
    const checkServer = async () => {
      try {
        await getBeastData('unicorn');
        setServerStatus('connected');
      } catch (error) {
        setServerStatus('disconnected');
      }
    };
    checkServer();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>🏰 Mythical Beasts Frontend</h1>
        <p>Grafana Faro Web SDK Demonstration</p>
        <div className="server-status">
          <span className={`status-indicator ${serverStatus}`}></span>
          <span>Server: {serverStatus}</span>
        </div>
      </header>

      <main className="App-main">
        <div className="beast-selector">
          <h2>Select a beast type</h2>
          <div className="beast-buttons">
            {BEAST_TYPES.map((beast) => (
              <button
                key={beast.id}
                className={`beast-button ${selectedBeast.id === beast.id ? 'active' : ''}`}
                onClick={() => setSelectedBeast(beast)}
                style={{ borderColor: beast.color }}
              >
                <span className="beast-emoji">{beast.emoji}</span>
                <span className="beast-name">{beast.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="beast-manager-container">
          <BeastManager
            beast={selectedBeast}
            serverStatus={serverStatus}
          />
        </div>
      </main>

      <footer className="App-footer">
        <p>Built with React ⚛️</p>
      </footer>
    </div>
  );
}

export default App;
