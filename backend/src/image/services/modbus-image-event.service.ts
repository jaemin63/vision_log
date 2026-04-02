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

/** 재접속 관련 상수 */
const RECONNECT_DELAY_MS  = 5_000;  // 재접속 시도 간격
const RECONNECT_TIMEOUT_MS = 4_000; // connectTCP 타임아웃
const READ_TIMEOUT_MS      = 3_000; // 레지스터 읽기 타임아웃

/** 소켓 수준 에러인지 판단 (프로토콜 에러와 구분) */
function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ENETUNREACH|EHOSTUNREACH|Port Not Open/i.test(msg)
  );
}

/**
 * Modbus/TCP Image Event Service
 *
 * Modbus/TCP 서버(Robot PC)에 클라이언트로 연결하여
 * 특정 레지스터를 폴링하고, 값이 조건에 맞게 변경되면
 * 이미지 합치기를 트리거합니다.
 *
 * 연결 관리:
 * - 최초 start() 시 연결
 * - 폴링 중 소켓 에러 감지 시 자동 재접속
 * - 재접속 중에는 폴링 스킵 (false-trigger 방지)
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
  private previousValue: number = 0;
  private isProcessing = false;
  private isReconnecting = false;         // 재접속 진행 중 플래그
  private reconnectTimer: NodeJS.Timeout | null = null;
  private registerType: ModbusRegisterType = 'holding';
  private triggers: TriggerCondition[] = [];
  private modbusHost = '';
  private modbusPort = 502;
  private modbusUnitId = 1;
  private modbusRegister = 0;
  private pollIntervalMs = 1000;

  constructor(
    @Inject(PollingConfigService)
    private readonly configService: PollingConfigService,
    private readonly imageMergeService: ImageMergeService,
    private readonly _imageCopyService: ImageCopyService,
  ) {}

  async onModuleInit() {
    const config = this.configService.getConfig();
    if (config.modbus.enabled) {
      await this.start();
    }
  }

  async onModuleDestroy() {
    await this.stop();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 공개 API
  // ─────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;

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
    this.modbusHost     = config.modbus.host;
    this.modbusPort     = config.modbus.port;
    this.modbusUnitId   = config.modbus.unitId;
    this.modbusRegister = config.modbus.register;
    this.pollIntervalMs = config.modbus.pollIntervalMs;
    this.registerType   = config.modbus.registerType;
    this.triggers       = config.modbus.triggers || [{ type: 'transition', from: 0, to: 1 }];
    this.previousValue  = 0;
    this.isProcessing   = false;
    this.running        = true;
    this.error          = undefined;

    // 최초 연결 시도
    await this.connectModbus();

    // 폴링 시작
    this.startPolling();
    console.log('ModbusImageEventService 시작됨');
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    await this.closeClient();
    this.isProcessing   = false;
    this.isReconnecting = false;
    console.log('ModbusImageEventService 중지됨');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running:        this.running,
      lastEvent:      this.lastEvent,
      error:          this.error,
      connected:      this.isConnected(),
      isReconnecting: this.isReconnecting,
      previousValue:  this.previousValue,
      isProcessing:   this.isProcessing,
      registerType:   this.registerType,
      triggers:       this.triggers,
    };
  }

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

  // ─────────────────────────────────────────────────────────────────────────
  // 연결 관리
  // ─────────────────────────────────────────────────────────────────────────

  private isConnected(): boolean {
    return this.client !== null && this.client.isOpen;
  }

  /** 기존 클라이언트 닫기 */
  private async closeClient(): Promise<void> {
    if (this.client) {
      try {
        this.client.close(() => {});
      } catch {
        // 무시
      }
      this.client = null;
    }
  }

  /**
   * Modbus TCP 연결 시도.
   * 성공하면 true, 실패하면 false 반환 (예외를 던지지 않음).
   */
  private async connectModbus(): Promise<boolean> {
    await this.closeClient();

    try {
      const client = new ModbusRTU();
      client.setTimeout(READ_TIMEOUT_MS);

      await Promise.race([
        client.connectTCP(this.modbusHost, { port: this.modbusPort }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), RECONNECT_TIMEOUT_MS),
        ),
      ]);

      client.setID(this.modbusUnitId);
      this.client = client;
      this.error  = undefined;
      console.log(`[Modbus] 연결 성공: ${this.modbusHost}:${this.modbusPort}`);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error  = `연결 실패: ${msg}`;
      this.client = null;
      console.warn(`[Modbus] 연결 실패: ${msg}`);
      return false;
    }
  }

  /**
   * 재접속 스케줄링 (이미 진행 중이면 무시).
   * RECONNECT_DELAY_MS 후에 connectModbus()를 시도하고
   * 실패하면 다시 스케줄링하지 않음 — 다음 폴링 사이클에서 다시 감지됨.
   */
  private scheduleReconnect(): void {
    if (this.isReconnecting || !this.running) return;

    this.isReconnecting = true;
    console.log(`[Modbus] ${RECONNECT_DELAY_MS / 1000}초 후 재접속 시도...`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.running) {
        this.isReconnecting = false;
        return;
      }

      console.log('[Modbus] 재접속 시도 중...');
      const ok = await this.connectModbus();
      this.isReconnecting = false;

      if (ok) {
        // 재접속 성공 — previousValue 리셋으로 false-trigger 방지
        this.previousValue = 0;
        console.log('[Modbus] 재접속 성공, 폴링 재개');
      } else {
        // 재접속 실패 — 다음 폴링 사이클에서 다시 감지하여 스케줄링됨
        console.warn('[Modbus] 재접속 실패, 다음 폴링 사이클에서 재시도');
      }
    }, RECONNECT_DELAY_MS);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 폴링
  // ─────────────────────────────────────────────────────────────────────────

  private startPolling(): void {
    console.log(
      `[Modbus] 폴링 시작: ${this.registerType} 레지스터 ${this.modbusRegister}, 간격 ${this.pollIntervalMs}ms`,
    );

    this.pollInterval = setInterval(async () => {
      // 처리 중이거나 재접속 중이면 스킵
      if (this.isProcessing || this.isReconnecting) return;

      // 연결 상태 확인 — 끊겨 있으면 재접속 스케줄링 후 스킵
      if (!this.isConnected()) {
        console.warn('[Modbus] 연결 끊김 감지 (폴링 시작 시점) — 재접속 스케줄링');
        this.scheduleReconnect();
        return;
      }

      try {
        const currentValue = await this.readRegister(this.modbusRegister);

        console.log(
          `[Modbus] ${this.registerType}[${this.modbusRegister}] = ${currentValue} (이전: ${this.previousValue})`,
        );

        const triggered = this.checkTriggers(this.previousValue, currentValue);
        if (triggered) {
          console.log(`[Modbus] 트리거 조건 충족: ${this.describeTrigger(triggered)}`);
          await this.triggerImageMerge();
        }

        this.previousValue = currentValue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.error = msg;
        console.error(`[Modbus] 폴링 오류: ${msg}`);

        if (isConnectionError(err)) {
          console.warn('[Modbus] 소켓 연결 오류 — 재접속 스케줄링');
          // 클라이언트 상태 초기화 후 재접속
          await this.closeClient();
          this.scheduleReconnect();
        }
        // 프로토콜 에러(Modbus exception 등)는 재접속하지 않음
      }
    }, this.pollIntervalMs);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 레지스터 읽기
  // ─────────────────────────────────────────────────────────────────────────

  private async readRegister(register: number): Promise<number> {
    // 연결 재확인 (폴링 시작 시점과 실제 읽기 사이에 끊길 수 있음)
    if (!this.isConnected()) {
      throw new Error('Port Not Open');
    }

    const c = this.client!;
    switch (this.registerType) {
      case 'coil': {
        const r = await c.readCoils(register, 1);
        return r.data[0] ? 1 : 0;
      }
      case 'discrete': {
        const r = await c.readDiscreteInputs(register, 1);
        return r.data[0] ? 1 : 0;
      }
      case 'input': {
        const r = await c.readInputRegisters(register, 1);
        return r.data[0];
      }
      case 'holding':
      default: {
        const r = await c.readHoldingRegisters(register, 1);
        return r.data[0];
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 트리거 처리
  // ─────────────────────────────────────────────────────────────────────────

  private checkTriggers(prev: number, curr: number): TriggerCondition | null {
    for (const t of this.triggers) {
      if (this.isTriggerMet(t, prev, curr)) return t;
    }
    return null;
  }

  private isTriggerMet(t: TriggerCondition, prev: number, curr: number): boolean {
    switch (t.type) {
      case 'transition':
        return prev === t.from && curr === t.to;
      case 'threshold':
        switch (t.operator) {
          case '==': return curr === t.value;
          case '!=': return curr !== t.value;
          case '>':  return curr >   t.value;
          case '<':  return curr <   t.value;
          case '>=': return curr >=  t.value;
          case '<=': return curr <=  t.value;
          default:   return false;
        }
      case 'change':
        return prev !== curr;
      default:
        return false;
    }
  }

  private describeTrigger(t: TriggerCondition): string {
    switch (t.type) {
      case 'transition': return `전환 감지: ${t.from} → ${t.to}`;
      case 'threshold':  return `임계값 조건: 값 ${t.operator} ${t.value}`;
      case 'change':     return '값 변경 감지';
      default:           return '알 수 없는 트리거';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 이미지 처리
  // ─────────────────────────────────────────────────────────────────────────

  private async triggerImageMerge(): Promise<void> {
    this.isProcessing = true;
    try {
      console.log('[Modbus] 3D 이미지 합치기 시작...');
      const result = await this.imageMergeService.mergeAndSaveImages();

      if (result.success) {
        console.log('[Modbus] 3D 이미지 합치기 성공:', result.filename);
        this.lastEvent = new Date();
        this.error     = undefined;
      } else {
        console.warn('[Modbus] 3D 이미지 합치기 실패:', result.message);
        this.error = result.message;
      }
    } catch (err) {
      console.error('[Modbus] 이미지 처리 오류:', err);
      this.error = err instanceof Error ? err.message : 'Image processing error';
    } finally {
      this.isProcessing = false;
    }
  }
}
