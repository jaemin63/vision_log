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
    ftp?: {
      host: string;
      port: number;
      username: string;
      password: string;
      path: string;
    };
    smb?: {
      share: string;
      username: string;
      password: string;
      domain?: string;
    };
    http?: {
      baseUrl: string;
      apiKey?: string;
    };
  };
}
