import { useState, useEffect } from 'react';
import type { PollingConfig } from '../types/config';
import { api } from '../services/api';
import './PollingConfigEditor.css';

interface PollingConfigEditorProps {
  onClose: () => void;
  onSave?: () => void;
}

export function PollingConfigEditor({
  onClose,
  onSave,
}: PollingConfigEditorProps) {
  const [config, setConfig] = useState<PollingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getPollingConfig();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;

    try {
      setSaving(true);
      setError(null);
      await api.updatePollingConfig(config);
      onSave?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (path: string[], value: any) => {
    if (!config) return;

    const newConfig = { ...config };
    let current: any = newConfig;

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]];
    }

    current[path[path.length - 1]] = value;
    setConfig(newConfig);
  };

  if (loading) {
    return (
      <div className="config-editor-overlay">
        <div className="config-editor-modal">
          <p>Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="config-editor-overlay">
        <div className="config-editor-modal">
          <p>Failed to load configuration</p>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="config-editor-overlay" onClick={onClose}>
      <div className="config-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="config-editor-header">
          <h2>Polling Configuration</h2>
          <button className="config-editor-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="config-editor-content">
          {error && <div className="config-editor-error">{error}</div>}

          {/* Modbus Settings */}
          <div className="config-section">
            <h3>Modbus/TCP Settings</h3>
            <div className="config-field">
              <label>
                <input
                  type="checkbox"
                  checked={config.modbus.enabled}
                  onChange={(e) =>
                    updateConfig(['modbus', 'enabled'], e.target.checked)
                  }
                />
                Enable Modbus
              </label>
            </div>
            <div className="config-field">
              <label>Host IP</label>
              <input
                type="text"
                value={config.modbus.host}
                onChange={(e) =>
                  updateConfig(['modbus', 'host'], e.target.value)
                }
                placeholder="192.168.1.100"
              />
            </div>
            <div className="config-field">
              <label>Port</label>
              <input
                type="number"
                value={config.modbus.port}
                onChange={(e) =>
                  updateConfig(['modbus', 'port'], parseInt(e.target.value))
                }
              />
            </div>
            <div className="config-field">
              <label>Register Address</label>
              <input
                type="number"
                value={config.modbus.register}
                onChange={(e) =>
                  updateConfig(['modbus', 'register'], parseInt(e.target.value))
                }
              />
            </div>
            <div className="config-field">
              <label>Condition Value</label>
              <input
                type="number"
                value={config.modbus.conditionValue}
                onChange={(e) =>
                  updateConfig(
                    ['modbus', 'conditionValue'],
                    parseInt(e.target.value),
                  )
                }
              />
            </div>
            <div className="config-field">
              <label>Poll Interval (ms)</label>
              <input
                type="number"
                value={config.modbus.pollIntervalMs}
                onChange={(e) =>
                  updateConfig(
                    ['modbus', 'pollIntervalMs'],
                    parseInt(e.target.value),
                  )
                }
              />
            </div>
          </div>

          {/* Robot Access Settings */}
          <div className="config-section">
            <h3>Robot PC Access Settings</h3>
            <div className="config-field">
              <label>Access Method</label>
              <select
                value={config.robot.accessMethod}
                onChange={(e) =>
                  updateConfig(['robot', 'accessMethod'], e.target.value)
                }
              >
                <option value="smb">SMB/Network Share</option>
                <option value="ftp">FTP</option>
                <option value="http">HTTP/API</option>
                <option value="local">Local File System</option>
              </select>
            </div>
            <div className="config-field">
              <label>Image Path</label>
              <input
                type="text"
                value={config.robot.imagePath}
                onChange={(e) =>
                  updateConfig(['robot', 'imagePath'], e.target.value)
                }
                placeholder="\\192.168.1.100\images or /images"
              />
            </div>

            {/* SMB Settings */}
            {config.robot.accessMethod === 'smb' && (
              <div className="config-subsection">
                <h4>SMB/Network Share Settings</h4>
                <div className="config-field">
                  <label>Share Path</label>
                  <input
                    type="text"
                    value={config.robot.smb?.share || ''}
                    onChange={(e) =>
                      updateConfig(['robot', 'smb', 'share'], e.target.value)
                    }
                    placeholder="\\192.168.1.100\images"
                  />
                </div>
                <div className="config-field">
                  <label>Username</label>
                  <input
                    type="text"
                    value={config.robot.smb?.username || ''}
                    onChange={(e) =>
                      updateConfig(
                        ['robot', 'smb', 'username'],
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div className="config-field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={config.robot.smb?.password || ''}
                    onChange={(e) =>
                      updateConfig(
                        ['robot', 'smb', 'password'],
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div className="config-field">
                  <label>Domain</label>
                  <input
                    type="text"
                    value={config.robot.smb?.domain || ''}
                    onChange={(e) =>
                      updateConfig(['robot', 'smb', 'domain'], e.target.value)
                    }
                    placeholder="WORKGROUP"
                  />
                </div>
              </div>
            )}

            {/* FTP Settings */}
            {config.robot.accessMethod === 'ftp' && (
              <div className="config-subsection">
                <h4>FTP Settings</h4>
                <div className="config-field">
                  <label>FTP Host</label>
                  <input
                    type="text"
                    value={config.robot.ftp?.host || ''}
                    onChange={(e) =>
                      updateConfig(['robot', 'ftp', 'host'], e.target.value)
                    }
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="config-field">
                  <label>FTP Port</label>
                  <input
                    type="number"
                    value={config.robot.ftp?.port || 21}
                    onChange={(e) =>
                      updateConfig(
                        ['robot', 'ftp', 'port'],
                        parseInt(e.target.value),
                      )
                    }
                  />
                </div>
                <div className="config-field">
                  <label>Username</label>
                  <input
                    type="text"
                    value={config.robot.ftp?.username || ''}
                    onChange={(e) =>
                      updateConfig(
                        ['robot', 'ftp', 'username'],
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div className="config-field">
                  <label>Password</label>
                  <input
                    type="password"
                    value={config.robot.ftp?.password || ''}
                    onChange={(e) =>
                      updateConfig(
                        ['robot', 'ftp', 'password'],
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div className="config-field">
                  <label>Remote Path</label>
                  <input
                    type="text"
                    value={config.robot.ftp?.path || ''}
                    onChange={(e) =>
                      updateConfig(['robot', 'ftp', 'path'], e.target.value)
                    }
                    placeholder="/images"
                  />
                </div>
              </div>
            )}

            {/* HTTP Settings */}
            {config.robot.accessMethod === 'http' && (
              <div className="config-subsection">
                <h4>HTTP/API Settings</h4>
                <div className="config-field">
                  <label>Base URL</label>
                  <input
                    type="text"
                    value={config.robot.http?.baseUrl || ''}
                    onChange={(e) =>
                      updateConfig(['robot', 'http', 'baseUrl'], e.target.value)
                    }
                    placeholder="http://192.168.1.100/api"
                  />
                </div>
                <div className="config-field">
                  <label>API Key (Optional)</label>
                  <input
                    type="text"
                    value={config.robot.http?.apiKey || ''}
                    onChange={(e) =>
                      updateConfig(['robot', 'http', 'apiKey'], e.target.value)
                    }
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="config-editor-footer">
          <button onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="config-save-button"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
