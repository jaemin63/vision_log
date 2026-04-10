import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ImageEventService } from '../interfaces/image-event-service.interface';
import { PollingConfigService } from '../../config/polling.config';
import { ImageMergeService } from './image-merge.service';
import { promises as fs } from 'fs';
import { join } from 'path';

/**
 * 공유폴더 폴링 방식 이미지 이벤트 서비스
 *
 * 동작 방식:
 * 1. pollIntervalMs 간격으로 감시 폴더 스캔
 * 2. autoLatestSubfolder=true 이면 watchPath 하위에서 숫자가 가장 큰
 *    서브폴더(예: SUB00003)를 자동 선택하고, 새 폴더 생성 시 자동 전환
 * 3. 이전 폴링 이후 mtime이 갱신된 파일이 있으면 변경 감지
 * 4. debounceMs 동안 추가 변경이 없으면 트리거
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

  private lastProcessedMtime = 0;
  private pendingMtime = 0;

  /** config 의 watchPath (autoLatestSubfolder=true 이면 베이스 경로) */
  private basePath = '';
  /** 실제로 파일을 감시 중인 경로 */
  private activeWatchPath = '';
  private autoLatestSubfolder = false;
  private pollIntervalMs = 1000;
  private debounceMs = 2000;
  private filePattern: RegExp = /\.(png|PNG|jpg|jpeg)$/;

  constructor(
    @Inject(PollingConfigService)
    private readonly configService: PollingConfigService,
    private readonly imageMergeService: ImageMergeService,
  ) {}

  async onModuleInit() {
    console.log('[FolderPolling] 서비스 준비됨 (Auto 모드 전환 시 폴링 시작)');
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

    this.basePath            = cfg.watchPath;
    this.autoLatestSubfolder = cfg.autoLatestSubfolder ?? false;
    this.pollIntervalMs      = cfg.pollIntervalMs;
    this.debounceMs          = cfg.debounceMs;
    this.filePattern         = new RegExp(cfg.filePattern);
    this.lastProcessedMtime  = 0;
    this.pendingMtime        = 0;
    this.isProcessing        = false;
    this.running             = true;
    this.error               = undefined;

    // 초기 감시 경로 결정
    if (this.autoLatestSubfolder) {
      const latest = await this.findLatestSubfolder();
      this.activeWatchPath = latest ? join(this.basePath, latest) : this.basePath;
      console.log(`[FolderPolling] 시작 — 베이스: ${this.basePath}`);
      console.log(`[FolderPolling] 활성 서브폴더: ${this.activeWatchPath}`);
    } else {
      this.activeWatchPath = this.basePath;
      console.log(`[FolderPolling] 시작 — 감시 폴더: ${this.activeWatchPath}`);
    }
    console.log(`[FolderPolling] 폴링 간격: ${this.pollIntervalMs}ms, debounce: ${this.debounceMs}ms`);

    // 시작 시점 mtime 기록 (이전 파일 무시)
    this.lastProcessedMtime = await this.getMaxMtime(this.activeWatchPath);
    console.log(`[FolderPolling] 기준 mtime: ${new Date(this.lastProcessedMtime).toISOString()}`);

    this.schedulePoll();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pollTimer)     { clearTimeout(this.pollTimer);     this.pollTimer     = null; }
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
    this.isProcessing = false;
    console.log('[FolderPolling] 중지됨');
  }

  isRunning(): boolean { return this.running; }

  getStatus() {
    return {
      running:             this.running,
      lastEvent:           this.lastEvent,
      error:               this.error,
      isProcessing:        this.isProcessing,
      basePath:            this.basePath,
      activeWatchPath:     this.activeWatchPath,
      autoLatestSubfolder: this.autoLatestSubfolder,
      lastProcessedMtime:  this.lastProcessedMtime
        ? new Date(this.lastProcessedMtime).toISOString()
        : null,
    };
  }

  async manualTrigger(): Promise<{ success: boolean; message: string }> {
    if (this.isProcessing) return { success: false, message: '이미 처리 중입니다.' };
    await this.triggerImageMerge(await this.getMaxMtime(this.activeWatchPath));
    return { success: !this.error, message: this.error || '이미지 합치기 완료' };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 서브폴더 자동 탐색
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * basePath 하위 디렉토리 중 이름이 숫자로만 끝나는 것 중 가장 큰 것 반환
   * (SUB00003, SUB00010 등 — 사전순 정렬로 마지막 = 최대)
   */
  private async findLatestSubfolder(): Promise<string | null> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      const subs = entries
        .filter(e => e.isDirectory() && /\d+$/.test(e.name))
        .map(e => e.name)
        .sort(); // 제로패딩이므로 사전순 = 숫자순
      return subs.length > 0 ? subs[subs.length - 1] : null;
    } catch {
      return null;
    }
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
      // autoLatestSubfolder: 더 높은 번호의 서브폴더가 생겼는지 확인
      if (this.autoLatestSubfolder) {
        const latest = await this.findLatestSubfolder();
        if (latest) {
          const latestPath = join(this.basePath, latest);
          if (latestPath !== this.activeWatchPath) {
            console.log(`[FolderPolling] 새 서브폴더 감지: ${this.activeWatchPath} → ${latestPath}`);
            this.activeWatchPath    = latestPath;
            this.lastProcessedMtime = 0; // 새 폴더 파일 전부 신규로 처리
            // 기준 mtime 재설정 (새 폴더의 기존 파일 무시)
            this.lastProcessedMtime = await this.getMaxMtime(this.activeWatchPath);
            console.log(`[FolderPolling] 새 기준 mtime: ${new Date(this.lastProcessedMtime).toISOString()}`);
            return; // 이번 사이클은 전환만 하고 다음 폴링에서 감지
          }
        }
      }

      const maxMtime = await this.getMaxMtime(this.activeWatchPath);
      if (maxMtime <= this.lastProcessedMtime) return;

      console.log(`[FolderPolling] 새 파일 감지 — ${this.activeWatchPath} (mtime: ${new Date(maxMtime).toISOString()})`);
      this.pendingMtime = maxMtime;
      this.scheduleDebounce();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.error !== msg) {
        console.warn(`[FolderPolling] 폴더 접근 오류: ${msg}`);
        this.error = msg;
      }
    }
  }

  private scheduleDebounce(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(async () => {
      this.debounceTimer = null;
      if (!this.running || this.isProcessing) return;
      await this.triggerImageMerge(this.pendingMtime);
    }, this.debounceMs);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 파일 스캔
  // ─────────────────────────────────────────────────────────────────────────

  private async getMaxMtime(dir: string): Promise<number> {
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      throw new Error(`폴더를 읽을 수 없습니다: ${dir}`);
    }
    const matched = entries.filter(f => this.filePattern.test(f));
    if (matched.length === 0) return 0;

    const mtimes = await Promise.all(
      matched.map(f => fs.stat(join(dir, f)).then(s => s.mtimeMs).catch(() => 0)),
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
        console.log('[FolderPolling] 성공:', result.filename);
        this.lastEvent          = new Date();
        this.error              = undefined;
        this.lastProcessedMtime = detectedMtime;
      } else {
        console.warn('[FolderPolling] 실패:', result.message);
        this.error = result.message;
      }
    } catch (err) {
      console.error('[FolderPolling] 오류:', err);
      this.error = err instanceof Error ? err.message : 'Image processing error';
    } finally {
      this.isProcessing = false;
    }
  }
}
