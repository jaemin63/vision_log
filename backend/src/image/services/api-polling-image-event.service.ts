import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ImageEventService } from '../interfaces/image-event-service.interface';
import {
  PollingConfigService,
  ModbusRegisterType,
  TriggerCondition,
} from '../../config/polling.config';
import { ImageMergeService } from './image-merge.service';
import * as https from 'https';
import * as http from 'http';

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * 외부 API 서버를 통한 Modbus 폴링 서비스
 *
 * 로봇에 직접 Modbus/TCP로 접속하는 대신,
 * 이미 로봇과 연결된 중간 서버의 REST API를 호출하여
 * 레지스터 값을 읽고 트리거 조건을 감지합니다.
 *
 * 지원 엔드포인트 (POST):
 *   holding  → /api/cobot/:robotId/address/:register/read
 *   coil     → /api/cobot/:robotId/coil/:register/read
 *   discrete → /api/cobot/:robotId/discreteIn/:register/read
 *
 * 응답 형식: { success: boolean; data: number | boolean; error?: string }
 */
@Injectable()
export class ApiPollingImageEventService
  implements ImageEventService, OnModuleInit, OnModuleDestroy
{
  private running = false;
  private lastEvent: Date | undefined;
  private error: string | undefined;

  private pollTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private previousValue = 0;

  private serverUrl = '';
  private robotId = 1;
  private registerType: ModbusRegisterType = 'holding';
  private register = 0;
  private pollIntervalMs = 1000;
  private triggers: TriggerCondition[] = [];
  private httpsAgent: https.Agent | null = null;

  // 상태 표시용 레지스터
  private statusRegister = 0;
  private statusMessages: Record<string, string> = {};
  private statusValue = 0;
  private statusMessage = '';

  constructor(
    @Inject(PollingConfigService)
    private readonly configService: PollingConfigService,
    private readonly imageMergeService: ImageMergeService,
  ) {}

  async onModuleInit() {
    // 자동 시작하지 않음 — Auto 모드 버튼을 눌러야 폴링이 시작됨
    console.log('[ApiPolling] 서비스 준비됨 (Auto 모드 전환 시 폴링 시작)');
  }

  async onModuleDestroy() {
    await this.stop();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 공개 API
  // ─────────────────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.running) return;

    const cfg = this.configService.getConfig().api;

    this.serverUrl      = cfg.serverUrl.replace(/\/+$/, '');
    this.robotId        = cfg.robotId;
    this.registerType   = cfg.registerType;
    this.register       = cfg.register;
    this.pollIntervalMs = cfg.pollIntervalMs;
    this.triggers       = cfg.triggers?.length ? cfg.triggers : [{ type: 'transition', from: 0, to: 1 }];
    this.statusRegister  = cfg.statusRegister ?? 0;
    this.statusMessages  = cfg.statusMessages ?? {};
    this.statusValue     = 0;
    this.statusMessage   = this.resolveMessage(0);
    this.previousValue   = 0;
    this.isProcessing    = false;
    this.running         = true;
    this.error           = undefined;

    // HTTPS agent (자체서명 인증서 허용 여부 설정)
    if (this.serverUrl.startsWith('https')) {
      this.httpsAgent = new https.Agent({
        rejectUnauthorized: cfg.rejectUnauthorized ?? false,
      });
    }

    console.log(`[ApiPolling] 시작`);
    console.log(`[ApiPolling] 서버: ${this.serverUrl}`);
    console.log(`[ApiPolling] robotId=${this.robotId}, ${this.registerType}[${this.register}], 간격=${this.pollIntervalMs}ms`);

    if (this.statusRegister > 0) {
      console.log(
        `[ApiPolling] status polling enabled: ${this.registerType}[${this.statusRegister}]`,
      );
    }
    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    this.isProcessing = false;
    console.log('[ApiPolling] 중지됨');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running:        this.running,
      lastEvent:      this.lastEvent,
      error:          this.error,
      previousValue:  this.previousValue,
      isProcessing:   this.isProcessing,
      serverUrl:      this.serverUrl,
      robotId:        this.robotId,
      register:       this.register,
      registerType:   this.registerType,
      statusValue:    this.statusValue,
      statusMessage:  this.statusMessage,
    };
  }

  /** 레지스터 값 → 메시지 변환 */
  private resolveMessage(value: number): string {
    return this.statusMessages[String(value)] ?? `R[${this.statusRegister}]=${value}`;
  }

  async manualTrigger(): Promise<{ success: boolean; message: string }> {
    if (this.isProcessing) return { success: false, message: '이미 처리 중입니다.' };
    await this.triggerImageMerge();
    return { success: !this.error, message: this.error || '이미지 합치기 완료' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 폴링
  // ─────────────────────────────────────────────────────────────────────────

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.schedulePoll();
    }, this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.isProcessing) return;

    try {
      // 트리거 레지스터 읽기
      const currentValue = await this.readRegisterAt(this.register);

      console.log(
        `[ApiPolling] ${this.registerType}[${this.register}] = ${currentValue} (이전: ${this.previousValue})`,
      );

      const triggered = this.checkTriggers(this.previousValue, currentValue);
      if (triggered) {
        console.log(`[ApiPolling] 트리거 조건 충족: ${this.describeTrigger(triggered)}`);
        await this.triggerImageMerge();
      }

      this.previousValue = currentValue;

      // 상태 레지스터 읽기 (설정된 경우)
      if (this.statusRegister > 0) {
        try {
          const sv = await this.readRegisterAt(this.statusRegister);
          const nextMessage = this.resolveMessage(sv);
          const changed =
            this.statusValue !== sv || this.statusMessage !== nextMessage;
          this.statusValue = sv;
          this.statusMessage = nextMessage;
          console.log(
            `[ApiPolling] status ${this.registerType}[${this.statusRegister}] = ${sv} -> ${nextMessage}${changed ? ' (changed)' : ''}`,
          );
        } catch (statusError) {
          const msg =
            statusError instanceof Error
              ? statusError.message
              : String(statusError);
          console.warn(
            `[ApiPolling] failed to read status ${this.registerType}[${this.statusRegister}]: ${msg}`,
          );
          // 상태 읽기 실패는 무시 (트리거 폴링에 영향 없음)
        }
      }

      // 정상 응답 시 에러 상태 해제
      if (this.error?.startsWith('API')) {
        this.error = undefined;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.error !== msg) {
        console.error(`[ApiPolling] 폴링 오류: ${msg}`);
        this.error = msg;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HTTP 요청
  // ─────────────────────────────────────────────────────────────────────────

  /** 레지스터 타입과 번지에 따른 API 경로 생성 */
  private buildUrl(register: number): string {
    const base = `${this.serverUrl}/api/cobot/${this.robotId}`;
    switch (this.registerType) {
      case 'coil':
        return `${base}/coil/${register}/read`;
      case 'discrete':
        return `${base}/discreteIn/${register}/read`;
      case 'holding':
      default:
        return `${base}/address/${register}/read`;
    }
  }

  /** 지정한 번지의 레지스터를 읽어 숫자로 반환 */
  private async readRegisterAt(register: number): Promise<number> {
    const url = this.buildUrl(register);
    const body = await this.post<{ success: boolean; data: number | boolean; error?: string }>(url);

    if (!body.success) {
      throw new Error(`API 오류: ${body.error ?? 'unknown'}`);
    }

    const raw = body.data;
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    if (typeof raw === 'number') return raw;
    return Number(raw);
  }

  /**
   * HTTP/HTTPS POST 요청 (body 없음 — 서버 API가 파라미터를 path로 받음)
   * 타임아웃: REQUEST_TIMEOUT_MS
   */
  private post<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return reject(new Error(`잘못된 URL: ${url}`));
      }

      const isHttps = parsed.protocol === 'https:';
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port:     parsed.port || (isHttps ? '443' : '80'),
        path:     parsed.pathname,
        method:   'POST',
        headers:  { 'Content-Length': '0' },
        agent:    isHttps ? (this.httpsAgent ?? undefined) : undefined,
        timeout:  REQUEST_TIMEOUT_MS,
      };

      const lib = isHttps ? https : http;
      const req = lib.request(options, (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`JSON 파싱 실패 (status=${res.statusCode}): ${raw.substring(0, 120)}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`요청 타임아웃 (${REQUEST_TIMEOUT_MS}ms): ${url}`));
      });
      req.on('error', reject);
      req.end();
    });
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
      case 'transition': return `전환: ${t.from} → ${t.to}`;
      case 'threshold':  return `임계값: 값 ${t.operator} ${t.value}`;
      case 'change':     return '값 변경 감지';
      default:           return '알 수 없음';
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 이미지 처리
  // ─────────────────────────────────────────────────────────────────────────

  private async triggerImageMerge(): Promise<void> {
    this.isProcessing = true;
    try {
      console.log('[ApiPolling] 3D 이미지 합치기 시작...');
      const result = await this.imageMergeService.mergeAndSaveImages();

      if (result.success) {
        console.log('[ApiPolling] 3D 이미지 합치기 성공:', result.filename);
        this.lastEvent = new Date();
        this.error     = undefined;
      } else {
        console.warn('[ApiPolling] 3D 이미지 합치기 실패:', result.message);
        this.error = result.message;
      }
    } catch (err) {
      console.error('[ApiPolling] 이미지 처리 오류:', err);
      this.error = err instanceof Error ? err.message : 'Image processing error';
    } finally {
      this.isProcessing = false;
    }
  }
}
