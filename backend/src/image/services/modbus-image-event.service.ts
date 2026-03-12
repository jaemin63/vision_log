import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ImageEventService } from '../interfaces/image-event-service.interface';
import {
  PollingConfigService,
  ModbusRegisterType,
  TriggerCondition,
} from '../../config/polling.config';
import { ImageMergeService } from './image-merge.service';
import { ImageCopyService } from './image-copy.service';
import ModbusRTU from 'modbus-serial';

/**
 * Modbus/TCP Image Event Service
 *
 * Modbus/TCP 서버(Robot PC)에 클라이언트로 연결하여
 * 특정 레지스터를 폴링하고, 값이 0에서 1로 변경되면
 * 이미지 합치기를 트리거합니다.
 */
@Injectable()
export class ModbusImageEventService
  implements ImageEventService, OnModuleInit, OnModuleDestroy
{
  private running = false;
  private lastEvent: Date | undefined;
  private error: string | undefined;
  private pollInterval: NodeJS.Timeout | null = null;
  private client: ModbusRTU | null = null;
  private previousValue: number = 0; // 이전 값 저장
  private isProcessing = false; // 이미지 처리 중 플래그
  private registerType: ModbusRegisterType = 'holding';
  private triggers: TriggerCondition[] = [];

  constructor(
    @Inject(PollingConfigService)
    private readonly configService: PollingConfigService,
    private readonly imageMergeService: ImageMergeService,
    private readonly imageCopyService: ImageCopyService,
  ) {}

  async onModuleInit() {
    // Auto-start if configured in config file
    const config = this.configService.getConfig();
    if (config.modbus.enabled) {
      await this.start();
    }
  }

  async onModuleDestroy() {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    try {
      const config = this.configService.getConfig();

      console.log('ModbusImageEventService 시작 중...');
      console.log('Modbus 설정:', {
        host: config.modbus.host,
        port: config.modbus.port,
        unitId: config.modbus.unitId,
        registerType: config.modbus.registerType,
        register: config.modbus.register,
        interval: config.modbus.pollIntervalMs,
        triggers: config.modbus.triggers,
      });

      // 설정 저장
      this.registerType = config.modbus.registerType;
      this.triggers = config.modbus.triggers || [{ type: 'transition', from: 0, to: 1 }];

      // Modbus TCP 클라이언트 생성 및 연결
      this.client = new ModbusRTU();

      try {
        await this.client.connectTCP(config.modbus.host, {
          port: config.modbus.port,
        });
        this.client.setID(config.modbus.unitId);
        console.log(`Modbus TCP 연결 성공: ${config.modbus.host}:${config.modbus.port}`);
      } catch (connectError) {
        console.warn('Modbus TCP 연결 실패 (시뮬레이션 모드로 전환):', connectError);
        this.client = null;
      }

      // 이전 값 초기화
      this.previousValue = 0;
      this.isProcessing = false;

      // 폴링 시작
      this.startPolling(config.modbus.register, config.modbus.pollIntervalMs);

      this.running = true;
      this.error = undefined;
      console.log('ModbusImageEventService 시작됨');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unknown error';
      this.running = false;
      console.error('ModbusImageEventService 시작 실패:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    // 폴링 중지
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Modbus 연결 해제
    if (this.client) {
      try {
        this.client.close(() => {
          console.log('Modbus TCP 연결 종료');
        });
      } catch (e) {
        // 연결 종료 오류 무시
      }
      this.client = null;
    }

    this.running = false;
    this.isProcessing = false;
    console.log('ModbusImageEventService 중지됨');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      lastEvent: this.lastEvent,
      error: this.error,
      connected: this.client !== null,
      previousValue: this.previousValue,
      isProcessing: this.isProcessing,
      registerType: this.registerType,
      triggers: this.triggers,
    };
  }

  /**
   * 폴링 시작
   */
  private startPolling(register: number, intervalMs: number): void {
    console.log(`폴링 시작: ${this.registerType} 레지스터 ${register}, 간격 ${intervalMs}ms`);

    this.pollInterval = setInterval(async () => {
      if (this.isProcessing) {
        // 이미지 처리 중에는 폴링 스킵
        return;
      }

      try {
        const currentValue = await this.readRegister(register);

        // 매 폴링 결과 로그 출력
        console.log(`[Modbus] ${this.registerType} 레지스터 ${register} = ${currentValue} (이전값: ${this.previousValue})`);

        // 트리거 조건 체크
        const triggeredCondition = this.checkTriggers(this.previousValue, currentValue);
        if (triggeredCondition) {
          console.log(`>>> 트리거 조건 충족: ${this.describeTrigger(triggeredCondition)}`);
          await this.triggerImageMerge();
        }

        // 이전 값 업데이트
        this.previousValue = currentValue;
      } catch (pollError) {
        console.error('폴링 오류:', pollError);
        this.error = pollError instanceof Error ? pollError.message : 'Polling error';
      }
    }, intervalMs);
  }

  /**
   * 트리거 조건 체크
   * @returns 충족된 트리거 조건 또는 null
   */
  private checkTriggers(
    previousValue: number,
    currentValue: number,
  ): TriggerCondition | null {
    for (const trigger of this.triggers) {
      if (this.isTriggerMet(trigger, previousValue, currentValue)) {
        return trigger;
      }
    }
    return null;
  }

  /**
   * 개별 트리거 조건 체크
   */
  private isTriggerMet(
    trigger: TriggerCondition,
    previousValue: number,
    currentValue: number,
  ): boolean {
    switch (trigger.type) {
      case 'transition':
        // 특정 값에서 다른 값으로 전환 감지
        return previousValue === trigger.from && currentValue === trigger.to;

      case 'threshold':
        // 임계값 조건 (현재 값 기준)
        switch (trigger.operator) {
          case '==':
            return currentValue === trigger.value;
          case '!=':
            return currentValue !== trigger.value;
          case '>':
            return currentValue > trigger.value;
          case '<':
            return currentValue < trigger.value;
          case '>=':
            return currentValue >= trigger.value;
          case '<=':
            return currentValue <= trigger.value;
          default:
            return false;
        }

      case 'change':
        // 값이 변경되면 트리거
        return previousValue !== currentValue;

      default:
        return false;
    }
  }

  /**
   * 트리거 조건 설명 문자열 생성
   */
  private describeTrigger(trigger: TriggerCondition): string {
    switch (trigger.type) {
      case 'transition':
        return `전환 감지: ${trigger.from} → ${trigger.to}`;
      case 'threshold':
        return `임계값 조건: 값 ${trigger.operator} ${trigger.value}`;
      case 'change':
        return '값 변경 감지';
      default:
        return '알 수 없는 트리거';
    }
  }

  /**
   * Modbus 레지스터 읽기 (레지스터 타입에 따라 다른 함수 호출)
   */
  private async readRegister(register: number): Promise<number> {
    if (this.client && this.client.isOpen) {
      try {
        switch (this.registerType) {
          case 'coil':
            // Coil 읽기 (Function Code 01)
            const coilResult = await this.client.readCoils(register, 1);
            return coilResult.data[0] ? 1 : 0;

          case 'discrete':
            // Discrete Input 읽기 (Function Code 02)
            const discreteResult = await this.client.readDiscreteInputs(register, 1);
            return discreteResult.data[0] ? 1 : 0;

          case 'input':
            // Input Register 읽기 (Function Code 04)
            const inputResult = await this.client.readInputRegisters(register, 1);
            return inputResult.data[0];

          case 'holding':
          default:
            // Holding Register 읽기 (Function Code 03)
            const holdingResult = await this.client.readHoldingRegisters(register, 1);
            return holdingResult.data[0];
        }
      } catch (readError) {
        console.error(`${this.registerType} 레지스터 ${register} 읽기 실패:`, readError);
        throw readError;
      }
    } else {
      // 연결이 없으면 0 반환 (시뮬레이션 모드)
      return 0;
    }
  }

  /**
   * 이미지 처리 트리거 (2D 복사 + 3D 병합)
   */
  private async triggerImageMerge(): Promise<void> {
    this.isProcessing = true;

    try {
      // 3D 이미지 병합
      console.log('3D 이미지 합치기 시작...');
      const result3d = await this.imageMergeService.mergeAndSaveImages();

      if (result3d.success) {
        console.log('3D 이미지 합치기 성공:', result3d.filename);
      } else {
        console.warn('3D 이미지 합치기 실패:', result3d.message);
      }

      // 2D 이미지 복사
      console.log('2D 이미지 복사 시작...');
      const result2d = await this.imageCopyService.copyLatest2dImage();

      if (result2d.success) {
        console.log('2D 이미지 복사 성공:', result2d.filename);
      } else {
        console.warn('2D 이미지 복사 실패:', result2d.message);
      }

      // 하나라도 성공하면 이벤트 타임스탬프 업데이트
      if (result3d.success || result2d.success) {
        this.lastEvent = new Date();
        this.error = undefined;
      } else {
        this.error = `3D: ${result3d.message}, 2D: ${result2d.message}`;
      }
    } catch (error) {
      console.error('이미지 처리 오류:', error);
      this.error = error instanceof Error ? error.message : 'Image processing error';
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 테스트용: 수동으로 신호 트리거
   */
  async manualTrigger(): Promise<{ success: boolean; message: string }> {
    if (this.isProcessing) {
      return { success: false, message: '이미 처리 중입니다.' };
    }

    await this.triggerImageMerge();
    return {
      success: this.error === undefined,
      message: this.error || '이미지 합치기 완료',
    };
  }
}
