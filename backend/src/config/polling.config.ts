import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface PollingConfig {
  modbus: {
    enabled: boolean;
    host: string;
    port: number;
    register: number;
    conditionValue: number;
    pollIntervalMs: number;
  };
  robot: {
    accessMethod: 'ftp' | 'smb' | 'http' | 'local';
    imagePath: string;
    // FTP settings
    ftp?: {
      host: string;
      port: number;
      username: string;
      password: string;
      path: string;
    };
    // SMB/Network Share settings
    smb?: {
      share: string; // e.g., \\192.168.1.100\images
      username: string;
      password: string;
      domain?: string;
    };
    // HTTP settings
    http?: {
      baseUrl: string;
      apiKey?: string;
    };
  };
}

const CONFIG_FILE_PATH = join(process.cwd(), 'polling-config.json');

const DEFAULT_CONFIG: PollingConfig = {
  modbus: {
    enabled: false,
    host: '192.168.1.100',
    port: 502,
    register: 1001,
    conditionValue: 1,
    pollIntervalMs: 1000,
  },
  robot: {
    accessMethod: 'smb',
    imagePath: '\\192.168.1.100\\images',
    smb: {
      share: '\\192.168.1.100\\images',
      username: '',
      password: '',
      domain: 'WORKGROUP',
    },
    ftp: {
      host: '192.168.1.100',
      port: 21,
      username: '',
      password: '',
      path: '/images',
    },
    http: {
      baseUrl: 'http://192.168.1.100/api',
    },
  },
};

export class PollingConfigService {
  private config: PollingConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file or create default
   */
  loadConfig(): PollingConfig {
    try {
      if (existsSync(CONFIG_FILE_PATH)) {
        const fileContent = readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const loaded = JSON.parse(fileContent);
        // Merge with default to ensure all fields exist
        return this.mergeWithDefault(loaded);
      } else {
        // Create default config file
        this.saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
    } catch (error) {
      console.error('Failed to load config, using defaults:', error);
      return DEFAULT_CONFIG;
    }
  }

  /**
   * Save configuration to file
   */
  saveConfig(config: PollingConfig): void {
    try {
      writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf-8');
      this.config = this.mergeWithDefault(config);
    } catch (error) {
      console.error('Failed to save config:', error);
      throw error;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): PollingConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<PollingConfig>): PollingConfig {
    const updated = {
      ...this.config,
      modbus: { ...this.config.modbus, ...updates.modbus },
      robot: {
        ...this.config.robot,
        ...updates.robot,
        ftp: updates.robot?.ftp
          ? { ...this.config.robot.ftp, ...updates.robot.ftp }
          : this.config.robot.ftp,
        smb: updates.robot?.smb
          ? { ...this.config.robot.smb, ...updates.robot.smb }
          : this.config.robot.smb,
        http: updates.robot?.http
          ? { ...this.config.robot.http, ...updates.robot.http }
          : this.config.robot.http,
      },
    };
    this.saveConfig(updated);
    return this.getConfig();
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   */
  private mergeWithDefault(loaded: any): PollingConfig {
    return {
      modbus: {
        ...DEFAULT_CONFIG.modbus,
        ...loaded.modbus,
      },
      robot: {
        ...DEFAULT_CONFIG.robot,
        ...loaded.robot,
        ftp: {
          ...DEFAULT_CONFIG.robot.ftp,
          ...loaded.robot?.ftp,
        },
        smb: {
          ...DEFAULT_CONFIG.robot.smb,
          ...loaded.robot?.smb,
        },
        http: {
          ...DEFAULT_CONFIG.robot.http,
          ...loaded.robot?.http,
        },
      },
    };
  }

  /**
   * Get config file path
   */
  getConfigFilePath(): string {
    return CONFIG_FILE_PATH;
  }
}
