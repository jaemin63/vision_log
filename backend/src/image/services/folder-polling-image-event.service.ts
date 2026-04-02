import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ImageEventService } from '../interfaces/image-event-service.interface';
import { PollingConfigService } from '../../config/polling.config';
import { ImageMergeService } from './image-merge.service';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * 공유폴더 폴링 방식 이미지 이벤트 서비스
 *
 * 지정된 폴더를 주기적으로 감시하여 새 이미지 파일이 감지되면
 * 이미지 합치기를 트리거합니다.
 *
 * 동작 방식:
 * 1. pollIntervalMs 간격으로 watchPath 폴더 스캔
 * 2. 이전 폴링 이후 mtime이 갱신된 파일이 있으면 "변경 감지"
 * 3. debounceMs 동안 추가 변경이 없으면 트리거
 *    (로봇이 여러 파일을 순차 저장하는 경우를 위해 debounce 사용)
 */
@Injectable()
export class FolderPollingImageEventService
  implements ImageEventService, OnModuleInit, OnModuleDestroy
{
  private running = false;
  private lastEvent: Date | undefined;
  private error: string | undefined;

  private pollTimer: NodeJS.Timeout | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /** 마지막으로 처리한 시점의 최대 mtime (ms) */
  private lastProcessedMtime = 0;
  /** 현재 감지된 최대 mtime — debounce 대기 중 */
  private pendingMtime = 0;

  private watchPath = '';
  private pollIntervalMs = 1000;
  private debounceMs = 2000;
  private filePattern: RegExp = /\.(png|PNG|jpg|jpeg)$/;

  constructor(
    @Inject(PollingConfigService)
    private readonly configService: PollingConfigService,
    private readonly imageMergeService: ImageMergeService,
  ) {}

  async onModuleInit() {
    const config = this.configService.getConfig();
    if (config.folder.enabled) {
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

    const cfg = this.configService.getConfig().folder;

    if (!cfg.watchPath) {
      this.error = 'folder.watchPath가 설정되지 않았습니다.';
      console.error('[FolderPolling]', this.error);
      return;
    }

    this.watchPath      = cfg.watchPath;
    this.pollIntervalMs = cfg.pollIntervalMs;
    this.debounceMs     = cfg.debounceMs;
    this.filePattern    = new RegExp(cfg.filePattern);
    this.lastProcessedMtime = 0;
    this.pendingMtime   = 0;
    this.isProcessing   = false;
    this.running        = true;
    this.error          = undefined;

    console.log('[FolderPolling] 시작');
    console.log(`[FolderPolling] 감시 폴더: ${this.watchPath}`);
    console.log(`[FolderPolling] 폴링 간격: ${this.pollIntervalMs}ms, debounce: ${this.debounceMs}ms`);

    // 시작 시점 mtime을 기준으로 이전 파일은 무시
    this.lastProcessedMtime = await this.getMaxMtime();
    console.log(`[FolderPolling] 기준 mtime 설정: ${new Date(this.lastProcessedMtime).toISOString()}`);

    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer)    { clearTimeout(this.pollTimer);    this.pollTimer    = null; }
    if (this.debounceTimer){ clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    this.isProcessing = false;
    console.log('[FolderPolling] 중지됨');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running:      this.running,
      lastEvent:    this.lastEvent,
      error:        this.error,
      isProcessing: this.isProcessing,
      watchPath:    this.watchPath,
      lastProcessedMtime: this.lastProcessedMtime
        ? new Date(this.lastProcessedMtime).toISOString()
        : null,
    };
  }

  async manualTrigger(): Promise<{ success: boolean; message: string }> {
    if (this.isProcessing) return { success: false, message: '이미 처리 중입니다.' };
    await this.triggerImageMerge(await this.getMaxMtime());
    return { success: !this.error, message: this.error || '이미지 합치기 완료' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 폴링
  // ─────────────────────────────────────────────────────────────────────────

  private schedulePoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(async () => {
      await this.poll();
      this.schedulePoll(); // 다음 폴링 예약
    }, this.pollIntervalMs);
  }

  private async poll(): Promise<void> {
    if (this.isProcessing) return;

    try {
      const maxMtime = await this.getMaxMtime();

      if (maxMtime <= this.lastProcessedMtime) {
        // 새 파일 없음
        return;
      }

      console.log(
        `[FolderPolling] 새 파일 감지 (mtime: ${new Date(maxMtime).toISOString()})`,
      );

      this.pendingMtime = maxMtime;
      this.scheduleDebounce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 폴더 접근 불가 시 로그만 남기고 계속 시도
      if (this.error !== msg) {
        console.warn(`[FolderPolling] 폴더 접근 오류: ${msg}`);
        this.error = msg;
      }
    }
  }

  /** debounce: 마지막 감지 후 debounceMs 동안 추가 변화 없으면 트리거 */
  private scheduleDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      if (!this.running || this.isProcessing) return;
      await this.triggerImageMerge(this.pendingMtime);
    }, this.debounceMs);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 파일 스캔
  // ─────────────────────────────────────────────────────────────────────────

  /** watchPath 내 매칭 파일들의 최대 mtime(ms) 반환. 파일 없으면 0. */
  private async getMaxMtime(): Promise<number> {
    let entries: string[];
    try {
      entries = await fs.readdir(this.watchPath);
    } catch {
      throw new Error(`폴더를 읽을 수 없습니다: ${this.watchPath}`);
    }

    const matched = entries.filter(f => this.filePattern.test(f));
    if (matched.length === 0) return 0;

    const mtimes = await Promise.all(
      matched.map(f =>
        fs.stat(join(this.watchPath, f))
          .then(s => s.mtimeMs)
          .catch(() => 0),
      ),
    );
    return Math.max(...mtimes);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 이미지 처리
  // ─────────────────────────────────────────────────────────────────────────

  private async triggerImageMerge(detectedMtime: number): Promise<void> {
    this.isProcessing = true;
    try {
      console.log('[FolderPolling] 3D 이미지 합치기 시작...');
      const result = await this.imageMergeService.mergeAndSaveImages();

      if (result.success) {
        console.log('[FolderPolling] 3D 이미지 합치기 성공:', result.filename);
        this.lastEvent = new Date();
        this.error     = undefined;
        // 처리 완료 시점의 mtime을 기준으로 업데이트
        this.lastProcessedMtime = detectedMtime;
      } else {
        console.warn('[FolderPolling] 3D 이미지 합치기 실패:', result.message);
        this.error = result.message;
      }
    } catch (err) {
      console.error('[FolderPolling] 이미지 처리 오류:', err);
      this.error = err instanceof Error ? err.message : 'Image processing error';
    } finally {
      this.isProcessing = false;
    }
  }
}
