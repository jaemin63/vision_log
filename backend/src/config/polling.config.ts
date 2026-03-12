import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export type ModbusRegisterType = 'coil' | 'discrete' | 'input' | 'holding';

export interface ViewerConfig {
  initialZoomPercent: number;
}

/**
 * Trigger condition types:
 * - transition: Triggers when value changes from 'from' to 'to'
 * - threshold: Triggers when value meets the condition (operator + value)
 * - change: Triggers on any value change
 */
export type TriggerType = 'transition' | 'threshold' | 'change';
export type ThresholdOperator = '==' | '!=' | '>' | '<' | '>=' | '<=';

export interface TransitionTrigger {
  type: 'transition';
  from: number;
  to: number;
}

export interface ThresholdTrigger {
  type: 'threshold';
  operator: ThresholdOperator;
  value: number;
}

export interface ChangeTrigger {
  type: 'change';
}

export type TriggerCondition = TransitionTrigger | ThresholdTrigger | ChangeTrigger;

export interface PollingConfig {
  modbus: {
    enabled: boolean;
    host: string;
    port: number;
    unitId: number;
    registerType: ModbusRegisterType;
    register: number;
    pollIntervalMs: number;
    triggers: TriggerCondition[];
  };
  viewer: ViewerConfig;
}

const CONFIG_FILE_PATH = join(process.cwd(), 'polling-config.json');

const DEFAULT_CONFIG: PollingConfig = {
  modbus: {
    enabled: false,
    host: '192.168.1.100',
    port: 502,
    unitId: 1,
    registerType: 'holding',
    register: 0,
    pollIntervalMs: 1000,
    triggers: [{ type: 'transition', from: 0, to: 1 }],
  },
  viewer: {
    initialZoomPercent: 100,
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
  updateConfig(updates: {
    modbus?: Partial<PollingConfig['modbus']>;
    viewer?: Partial<ViewerConfig>;
  }): PollingConfig {
    const updated = {
      ...this.config,
      modbus: { ...this.config.modbus, ...updates.modbus },
      viewer: { ...this.config.viewer, ...updates.viewer },
    };
    this.saveConfig(updated);
    return this.getConfig();
  }

  /**
   * Merge loaded config with defaults to ensure all fields exist
   */
  private mergeWithDefault(loaded: any): PollingConfig {
    const modbus = {
      ...DEFAULT_CONFIG.modbus,
      ...loaded.modbus,
    };
    // Use loaded triggers if present, otherwise use default
    if (loaded.modbus?.triggers && Array.isArray(loaded.modbus.triggers)) {
      modbus.triggers = loaded.modbus.triggers;
    }
    return {
      modbus,
      viewer: {
        ...DEFAULT_CONFIG.viewer,
        ...loaded.viewer,
      },
    };
  }

  /**
   * Get viewer configuration only
   */
  getViewerConfig(): ViewerConfig {
    return { ...this.config.viewer };
  }

  /**
   * Get config file path
   */
  getConfigFilePath(): string {
    return CONFIG_FILE_PATH;
  }
}
