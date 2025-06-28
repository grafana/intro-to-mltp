import React, { useState, useEffect } from 'react';
import './BeastManager.css';
import { getBeastData, addBeastName, deleteBeastName } from '../services/api';

const BeastManager = ({ beast, serverStatus }) => {
  const [beastNames, setBeastNames] = useState([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  // Load beast data when beast type changes
  useEffect(() => {
    if (serverStatus === 'connected') {
      loadBeastData();
    }
  }, [beast.id, serverStatus]);

  const loadBeastData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBeastData(beast.id);
      setBeastNames(data || []);
    } catch (err) {
      setError(`Failed to load ${beast.name} data. Server might be unavailable.`);
      setBeastNames([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddName = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setActionLoading('add');
    setError(null);
    try {
      await addBeastName(beast.id, newName.trim());
      setNewName('');
      await loadBeastData(); // Refresh the list
    } catch (err) {
      if (err.response?.status === 500 && err.response?.data?.constraint) {
        setError(`"${newName}" already exists in the ${beast.name} collection.`);
      } else {
        setError(`Failed to add "${newName}". ${err.response?.data || err.message}`);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteName = async (nameToDelete) => {
    if (!window.confirm(`Are you sure you want to remove "${nameToDelete.name}" from the ${beast.name} collection?`)) {
      return;
    }

    setActionLoading(`delete-${nameToDelete.id}`);
    setError(null);
    try {
      await deleteBeastName(beast.id, nameToDelete.name);
      await loadBeastData(); // Refresh the list
    } catch (err) {
      setError(`Failed to delete "${nameToDelete.name}". ${err.response?.data || err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const generateRandomName = () => {
    const prefixes = {
      unicorn: ['Sparkle', 'Starlight', 'Crystal', 'Rainbow', 'Silvermane', 'Moonbeam'],
      manticore: ['Fierce', 'Shadow', 'Thunder', 'Venom', 'Razorclaw', 'Darkwing'],
      illithid: ['Mind', 'Void', 'Psychic', 'Tentacle', 'Brain', 'Psionic'],
      owlbear: ['Feather', 'Claw', 'Hoot', 'Forest', 'Wise', 'Night'],
      beholder: ['All-seeing', 'Eye', 'Gaze', 'Watcher', 'Orb', 'Vision']
    };

    const suffixes = ['storm', 'shadow', 'light', 'fang', 'wing', 'heart', 'soul', 'blade', 'fire', 'frost'];

    const beastPrefixes = prefixes[beast.id] || prefixes.unicorn;
    const randomPrefix = beastPrefixes[Math.floor(Math.random() * beastPrefixes.length)];
    const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    return `${randomPrefix}${randomSuffix}`;
  };

  if (serverStatus === 'disconnected') {
    return (
      <div className="beast-manager server-disconnected">
        <h2 style={{ color: beast.color }}>
          {beast.emoji} {beast.name} Manager
        </h2>
        <div className="error-message">
          <p>⚠️ Server is currently unavailable</p>
          <p>Please ensure the mythical-beasts-server is running on port 4000</p>
        </div>
      </div>
    );
  }

  return (
    <div className="beast-manager">
      <h2 style={{ color: beast.color }}>
        {beast.emoji} {beast.name} Manager
      </h2>

      <div className="add-section">
        <form onSubmit={handleAddName} className="add-form">
          <div className="input-group">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Enter a ${beast.name.toLowerCase()} name...`}
              className="name-input"
              disabled={loading || actionLoading}
            />
            <button
              type="button"
              onClick={() => setNewName(generateRandomName())}
              className="random-button"
              disabled={loading || actionLoading}
              title="Generate random name"
            >
              🎲
            </button>
            <button
              type="submit"
              className="add-button"
              disabled={loading || actionLoading || !newName.trim()}
              style={{ backgroundColor: beast.color }}
            >
              {actionLoading === 'add' ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>
      </div>

      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}

      <div className="names-section">
        <div className="section-header">
          <h3>Current {beast.name}s ({beastNames.length})</h3>
          <button
            onClick={loadBeastData}
            className="refresh-button"
            disabled={loading}
            title="Refresh list"
          >
            {loading ? '⟳' : '↻'}
          </button>
        </div>

        {loading ? (
          <div className="loading">
            <div className="loading-spinner"></div>
            <p>Loading {beast.name.toLowerCase()}s...</p>
          </div>
        ) : beastNames.length === 0 ? (
          <div className="empty-state">
            <p>No {beast.name.toLowerCase()}s found</p>
            <p>Add some names to get started!</p>
          </div>
        ) : (
          <div className="names-grid">
            {beastNames.map((name, index) => (
              <div key={`${name.id || index}-${name.name}`} className="name-card">
                <span className="name-text">{name.name}</span>
                <button
                  onClick={() => handleDeleteName(name)}
                  className="delete-button"
                  disabled={actionLoading === `delete-${name.id}`}
                  title={`Remove ${name.name}`}
                >
                  {actionLoading === `delete-${name.id}` ? '⟳' : '✕'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BeastManager;
