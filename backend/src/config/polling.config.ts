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
    /**
     * 상태 표시용 레지스터 번호 (트리거 레지스터와 별개)
     * 이 값을 읽어 statusMessages에 매핑된 메시지를 화면에 표시
     */
    statusRegister: number;
    /**
     * 상태 레지스터 값과 화면 표시 메시지 매핑
     * 예: { "0": "대기 중", "1": "픽킹 준비" }
     */
    statusMessages: Record<string, string>;
  };
  /**
   * 외부 API 서버를 통한 Modbus 폴링 설정
   * (로봇에 직접 접속하지 않고 중간 서버 API를 호출)
   */
  api: {
    /** true이면 이 모드 사용 (modbus, folder보다 우선) */
    enabled: boolean;
    /** API 서버 베이스 URL (예: "https://192.168.0.100") */
    serverUrl: string;
    /** 로봇 ID (GET /api/cobot/:id/...) */
    robotId: number;
    /** 읽을 레지스터 종류 */
    registerType: ModbusRegisterType;
    /** 레지스터 번지 */
    register: number;
    /** 폴링 간격 (ms) */
    pollIntervalMs: number;
    /** 트리거 조건 */
    triggers: TriggerCondition[];
    /**
     * HTTPS 인증서 검증 여부 (자체서명 인증서 사용 시 false)
     * 기본값: false
     */
    rejectUnauthorized: boolean;
    /**
     * 상태 표시용 레지스터 번지 (트리거 레지스터와 별개)
     * 이 값을 읽어 statusMessages에 매핑된 메시지를 화면에 표시
     */
    statusRegister: number;
    /**
     * 레지스터 값 → 표시 메시지 매핑
     * 예: { "0": "대기 중", "1": "픽킹 준비", "2": "픽킹 중" }
     */
    statusMessages: Record<string, string>;
  };
  /** 공유폴더 폴링 설정 */
  folder: {
    /** true이면 이 모드 사용 */
    enabled: boolean;
    /**
     * 감시할 기본 폴더 경로
     * autoLatestSubfolder=true 이면 이 경로 하위에서 가장 높은 번호의
     * 서브폴더(예: SUB00003)를 자동으로 선택함
     */
    watchPath: string;
    /**
     * true이면 watchPath 하위의 서브폴더 중 숫자가 가장 큰 것을 자동 선택
     * 새 서브폴더가 생기면 자동으로 전환
     */
    autoLatestSubfolder: boolean;
    /** 폴링 간격 (ms) */
    pollIntervalMs: number;
    /**
     * 마지막 파일 변경 감지 후 실제 트리거까지 대기 시간 (ms)
     * 로봇이 여러 파일을 순차 저장할 때 모두 쓰인 뒤 트리거되도록 함
     */
    debounceMs: number;
    /** 감시 대상 파일 패턴 (정규식 문자열) */
    filePattern: string;
  };
  viewer: ViewerConfig;
}

const CONFIG_FILE_PATH = join(process.cwd(), 'polling-config.json');

const DEFAULT_CONFIG: PollingConfig = {
  api: {
    enabled: false,
    serverUrl: 'https://192.168.0.100',
    robotId: 1,
    registerType: 'holding',
    register: 99,
    pollIntervalMs: 1000,
    triggers: [{ type: 'transition', from: 0, to: 1 }],
    rejectUnauthorized: false,
    statusRegister: 0,
    statusMessages: {},
  },
  modbus: {
    enabled: false,
    host: '192.168.0.54',
    port: 502,
    unitId: 1,
    registerType: 'holding',
    register: 99,
    pollIntervalMs: 1000,
    triggers: [{ type: 'transition', from: 0, to: 1 }],
    statusRegister: 0,
    statusMessages: {},
  },
  folder: {
    enabled: false,
    watchPath: '',
    autoLatestSubfolder: false,
    pollIntervalMs: 1000,
    debounceMs: 2000,
    filePattern: '\\.(png|PNG|jpg|jpeg)$',
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
    if (loaded.modbus?.triggers && Array.isArray(loaded.modbus.triggers)) {
      modbus.triggers = loaded.modbus.triggers;
    }
    return {
      api: {
        ...DEFAULT_CONFIG.api,
        ...loaded.api,
      },
      modbus,
      folder: {
        ...DEFAULT_CONFIG.folder,
        ...loaded.folder,
      },
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
