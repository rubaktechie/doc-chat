import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getSettings()
      .then(({ settings, providers }) => { setSettings(settings); setProviders(providers); })
      .catch((e) => setError(e.message));
  }, []);

  if (!settings) return <div className="page"><h1>Settings</h1>{error ? <p className="error">{error}</p> : <p className="muted">Loading…</p>}</div>;

  const onProviderChange = (provider) => {
    // Prefill model names with the chosen provider's defaults.
    const p = providers[provider] || {};
    setSettings({ provider, chat_model: p.chatModel || '', embed_model: p.embedModel || '' });
    setSaved(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const { settings: updated } = await api.updateSettings(settings);
      setSettings(updated);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <form className="settings-form" onSubmit={save}>
        <label>Provider
          <select value={settings.provider} onChange={(e) => onProviderChange(e.target.value)}>
            {Object.keys(providers).map((name) => (
              <option key={name} value={name}>
                {name}{providers[name].hasKey === false && name === 'openai' ? ' (no key set)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>Chat model
          <input value={settings.chat_model || ''} onChange={(e) => setSettings({ ...settings, chat_model: e.target.value })} />
        </label>
        <label>Embedding model
          <input value={settings.embed_model || ''} onChange={(e) => setSettings({ ...settings, embed_model: e.target.value })} />
        </label>
        <p className="muted small">
          Each embedding model keeps its own index, so switching is safe — nothing is lost.
          Re-upload documents to search them under a new embedding model; switch back and
          previously-indexed ones return instantly. The chat model can be changed anytime.
        </p>
        {error && <p className="error">{error}</p>}
        {saved && <p className="ok">Saved.</p>}
        <button type="submit">Save</button>
      </form>
    </div>
  );
}
