import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class ImageMergeService {
  private readonly baseDirectory: string;
  private readonly sourceBaseDir: string; // C:\share\TEST
  private readonly outputDir: string;
  private readonly rawDataDir: string;
  private readonly demoRawDir: string;
  private readonly blackThreshold = 60;

  private static readonly MONTHS = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
  ];

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.baseDirectory =
      process.env.IMAGE_DIRECTORY || join(process.cwd(), 'images');
    this.sourceBaseDir = process.env.SHARE_DIRECTORY || 'C:\\share\\TEST';
    this.outputDir = join(this.baseDirectory, '3d_image');
    this.rawDataDir = join(this.baseDirectory, '3d_raw_data');
    this.demoRawDir = join(this.baseDirectory, 'demo_raw');
  }

  /**
   * 오늘 날짜 기반 소스 디렉토리 경로 반환
   * 형식: C:\share\TEST\Y{YY}{MMM}{DD}\SUB00000
   */
  private getSourceDir(): string {
    const now = new Date();
    const year = String(now.getFullYear()).slice(-2);
    const month = ImageMergeService.MONTHS[now.getMonth()];
    const day = String(now.getDate()).padStart(2, '0');
    const dateFolder = `Y${year}${month}${day}`;
    return join(this.sourceBaseDir, dateFolder, 'SUB00003');
  }

  /**
   * C:\share\TEST\{날짜}\SUB00000 폴더의 IM* 이미지 3장을 합쳐서 3d_image에 저장
   * 처리 완료 후 소스 폴더의 모든 파일 삭제
   */
  async mergeAndSaveImages(): Promise<{ success: boolean; filename: string; message: string }> {
    try {
      const sourceDir = this.getSourceDir();
      console.log(`소스 디렉토리: ${sourceDir}`);

      // 출력 폴더 확인 및 생성
      await this.ensureDirectory(this.outputDir);

      // 소스 폴더 접근
      let files: string[];
      try {
        files = await fs.readdir(sourceDir);
      } catch {
        return {
          success: false,
          filename: '',
          message: `소스 디렉토리 접근 실패: ${sourceDir}`,
        };
      }

      // IM* 파일 필터링 및 정렬 (확장자 유무 무관)
      const imageFiles = files
        .filter((f) => /^IM\d+/i.test(f))
        .sort((a, b) => this.extractNumber(a) - this.extractNumber(b));

      if (imageFiles.length < 3) {
        return {
          success: false,
          filename: '',
          message: `이미지가 3장 이상 필요합니다. 현재: ${imageFiles.length}장 (경로: ${sourceDir})`,
        };
      }

      console.log('정렬된 이미지 파일:', imageFiles.slice(0, 3));

      // 파일 특성으로 역할 자동 감지
      // - ch:1  → depth map
      // - ch:3 + 파일 크기 작음 → color segmentation
      // - ch:3 + 파일 크기 큼   → edge/normal map
      const metaList = await Promise.all(
        imageFiles.slice(0, 3).map(async (f) => {
          const meta = await sharp(join(sourceDir, f)).metadata();
          const stat = await fs.stat(join(sourceDir, f));
          return { file: f, channels: meta.channels ?? 3, size: stat.size };
        }),
      );

      const depthEntry = metaList.find((m) => m.channels === 1);
      const colorCandidates = metaList.filter((m) => m.channels !== 1);
      colorCandidates.sort((a, b) => a.size - b.size); // 작은 게 color, 큰 게 edge

      if (!depthEntry || colorCandidates.length < 2) {
        return { success: false, filename: '', message: '파일 역할 감지 실패: depth/color/edge 구분 불가' };
      }

      const colorFile = colorCandidates[0].file;
      const edgeFile  = colorCandidates[1].file;
      const depthFile = depthEntry.file;
      console.log(`color: ${colorFile}, depth: ${depthFile}, edge: ${edgeFile}`);

      // 이미지 합치기 (3장)
      const mergedBuffer = await this.mergeAllThree(depthFile, edgeFile, colorFile, sourceDir);

      // 출력 파일명 생성 (날짜_시간.png)
      const now = new Date();
      const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}.png`;

      const outputPath = join(this.outputDir, filename);
      await fs.writeFile(outputPath, mergedBuffer);
      console.log(`합쳐진 이미지 저장: ${outputPath}`);

      // 소스 폴더의 모든 파일을 3d_raw_data에 백업 후 삭제
      await this.ensureDirectory(this.rawDataDir);
      const allFiles = await fs.readdir(sourceDir);
      for (const file of allFiles) {
        const filePath = join(sourceDir, file);
        try {
          await fs.copyFile(filePath, join(this.rawDataDir, file));
          console.log(`백업: ${filePath} → 3d_raw_data/${file}`);
          await fs.unlink(filePath);
          console.log(`삭제: ${filePath}`);
        } catch (e) {
          console.warn(`파일 처리 실패: ${filePath}`, e);
        }
      }
      console.log(`소스 폴더 정리 완료: ${sourceDir}`);

      // 이벤트 발생 (프론트엔드 표시용)
      this.eventEmitter.emit('image.event.3d', {
        filename,
        timestamp: now,
      });

      return {
        success: true,
        filename,
        message: `이미지 합치기 완료: ${filename}`,
      };
    } catch (error) {
      console.error('이미지 합치기 실패:', error);
      return {
        success: false,
        filename: '',
        message: error instanceof Error ? error.message : '알 수 없는 오류',
      };
    }
  }

  /**
   * 파일명에서 숫자 추출
   */
  private extractNumber(filename: string): number {
    const match = filename.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 디렉토리 생성
   */
  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      console.log(`디렉토리 생성: ${dir}`);
    }
  }

  /**
   * 3장 합성: depth(회색 배경) → edge(multiply 블렌딩) → color(오버레이)
   * Fanuc iRVision 결과물과 유사한 출력
   */
  private async mergeAllThree(
    depthFile: string,
    edgeFile: string,
    colorFile: string,
    sourceDir: string,
  ): Promise<Buffer> {
    const depthPath = join(sourceDir, depthFile);
    const edgePath  = join(sourceDir, edgeFile);
    const colorPath = join(sourceDir, colorFile);

    const depthMeta = await sharp(depthPath).metadata();
    const width  = depthMeta.width!;
    const height = depthMeta.height!;
    const channels = 3;

    // 1. depth: ch:1 grayscale → 정규화 → 밝기 부스트 → RGB
    const depthBuffer = await sharp(depthPath)
      .resize(width, height)
      .normalise()
      .linear(2.0, 50)   // Fanuc 수준의 밝은 회색 배경
      .toColourspace('srgb')
      .raw()
      .toBuffer();

    // 2. edge: RGB → grayscale → 정규화 (ch:1 단일채널로 유지)
    const edgeBuffer = await sharp(edgePath)
      .resize(width, height)
      .greyscale()
      .normalise()
      .raw()
      .toBuffer(); // ch:1 → 픽셀당 1바이트, p 인덱스로 읽어야 함

    // 3. color: 컬러 세그멘테이션
    const colorBuffer = await sharp(colorPath)
      .resize(width, height)
      .raw()
      .toBuffer();

    const outBuffer = Buffer.alloc(width * height * channels);

    for (let p = 0; p < width * height; p++) {
      const idx = p * channels;

      const cr = colorBuffer[idx];
      const cg = colorBuffer[idx + 1];
      const cb = colorBuffer[idx + 2];
      const colorGray = 0.299 * cr + 0.587 * cg + 0.114 * cb;

      if (colorGray > this.blackThreshold) {
        // 컬러 객체: 그대로 사용
        outBuffer[idx]     = cr;
        outBuffer[idx + 1] = cg;
        outBuffer[idx + 2] = cb;
      } else {
        // 배경: depth 기반, edge로 경계선만 살짝 어둡게 (0.75~1.0 범위로 클램프)
        const edgeVal = 0.75 + (edgeBuffer[p] / 255) * 0.25; // ch:1 → p 인덱스
        outBuffer[idx]     = Math.min(255, Math.round(depthBuffer[idx]     * edgeVal));
        outBuffer[idx + 1] = Math.min(255, Math.round(depthBuffer[idx + 1] * edgeVal));
        outBuffer[idx + 2] = Math.min(255, Math.round(depthBuffer[idx + 2] * edgeVal));
      }
    }

    console.log('depth + edge + color 3장 합성 완료');

    return sharp(outBuffer, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();
  }

  /**
   * demo_raw 폴더의 고정 파일 3장으로 합성 (파일 삭제 없음)
   * Exhibition 설명용 데모 전용
   */
  async mergeDemoImages(): Promise<{ success: boolean; filename: string; message: string; stats?: { coveragePercent: number; depthScore: number; orientationStats: { hubUp: number; flangeUp: number; tilted: number } } }> {
    try {
      await this.ensureDirectory(this.outputDir);
      await this.ensureDirectory(this.rawDataDir);

      let files: string[];
      try {
        files = await fs.readdir(this.demoRawDir);
      } catch {
        return { success: false, filename: '', message: `demo_raw 폴더를 찾을 수 없습니다: ${this.demoRawDir}` };
      }

      const imageFiles = files
        .filter((f) => /\.(png|PNG)$/.test(f))
        .sort();

      if (imageFiles.length < 3) {
        return { success: false, filename: '', message: `demo_raw에 PNG 파일이 3장 이상 필요합니다 (현재: ${imageFiles.length}장)` };
      }

      const metaList = await Promise.all(
        imageFiles.slice(0, 3).map(async (f) => {
          const meta = await sharp(join(this.demoRawDir, f)).metadata();
          const stat = await fs.stat(join(this.demoRawDir, f));
          return { file: f, channels: meta.channels ?? 3, size: stat.size };
        }),
      );

      const depthEntry = metaList.find((m) => m.channels === 1);
      const colorCandidates = metaList.filter((m) => m.channels !== 1).sort((a, b) => a.size - b.size);

      if (!depthEntry || colorCandidates.length < 2) {
        return { success: false, filename: '', message: 'demo_raw 파일 역할 감지 실패 (depth/color/edge 구분 불가)' };
      }

      const colorFile = colorCandidates[0].file;
      const edgeFile  = colorCandidates[1].file;
      const depthFile = depthEntry.file;
      console.log(`[demo] color: ${colorFile}, depth: ${depthFile}, edge: ${edgeFile}`);

      const [mergedBuffer, stats] = await Promise.all([
        this.mergeAllThree(depthFile, edgeFile, colorFile, this.demoRawDir),
        this.analyzeImages(colorFile, depthFile, this.demoRawDir),
      ]);

      const now = new Date();
      const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}.png`;

      await fs.writeFile(join(this.outputDir, filename), mergedBuffer);

      // 3d_raw_data에 복사 (getLatestRawSet이 여기서 읽음) — 원본 demo_raw는 삭제 안 함
      // fs.copyFile은 소스 mtime을 유지하므로 복사 후 mtime을 현재 시각으로 갱신
      const copyTime = new Date();
      for (const file of imageFiles.slice(0, 3)) {
        const dest = join(this.rawDataDir, file);
        await fs.copyFile(join(this.demoRawDir, file), dest);
        await fs.utimes(dest, copyTime, copyTime);
      }

      this.eventEmitter.emit('image.event.3d', { filename, timestamp: now });
      console.log(`[demo] 합성 완료: ${filename}`);

      return { success: true, filename, message: `데모 이미지 합치기 완료: ${filename}`, stats };
    } catch (error) {
      console.error('[demo] 합성 실패:', error);
      return { success: false, filename: '', message: error instanceof Error ? error.message : '알 수 없는 오류' };
    }
  }

  /**
   * 소스 디렉토리 현재 상태 확인
   */
  async getRawDataStatus(): Promise<{ count: number; files: string[]; sourceDir: string }> {
    const sourceDir = this.getSourceDir();
    try {
      const files = await fs.readdir(sourceDir);
      const imageFiles = files.filter((f) => /^IM\d+/i.test(f));
      return { count: imageFiles.length, files: imageFiles, sourceDir };
    } catch {
      return { count: 0, files: [], sourceDir };
    }
  }

  /**
   * 3d_raw_data에서 가장 최근 세트(3장)의 파일명 반환
   * index 0 = color, index 1 = depth, index 2 = edge
   */
  async getLatestRawSet(): Promise<{
    color: string | null;
    depth: string | null;
    edge: string | null;
    rawDataDir: string;
  }> {
    try {
      const files = await fs.readdir(this.rawDataDir);
      // IM+숫자 또는 demo_* 패턴의 PNG만 매칭
      const imFiles = files.filter((f) => /^(IM\d+|demo_\w+)\.(png)$/i.test(f));

      if (imFiles.length < 3) {
        return { color: null, depth: null, edge: null, rawDataDir: this.rawDataDir };
      }

      // Get mtime for each file
      const withMtime = await Promise.all(
        imFiles.map(async (name) => {
          const stat = await fs.stat(join(this.rawDataDir, name));
          return { name, mtime: stat.mtime.getTime() };
        }),
      );

      // Sort by mtime desc, take newest 3
      withMtime.sort((a, b) => b.mtime - a.mtime);
      const latest3 = withMtime.slice(0, 3);

      // 파일 특성으로 역할 감지 (ch:1=depth, ch:3 작은=color, ch:3 큰=edge)
      const metaList = await Promise.all(
        latest3.map(async ({ name }) => {
          const meta = await sharp(join(this.rawDataDir, name)).metadata();
          return { name, channels: meta.channels ?? 3, size: (await fs.stat(join(this.rawDataDir, name))).size };
        }),
      );

      const depthEntry = metaList.find((m) => m.channels === 1);
      const colorCandidates = metaList.filter((m) => m.channels !== 1).sort((a, b) => a.size - b.size);

      if (!depthEntry || colorCandidates.length < 2) {
        return { color: null, depth: null, edge: null, rawDataDir: this.rawDataDir };
      }

      return {
        color: colorCandidates[0].name,
        depth: depthEntry.name,
        edge: colorCandidates[1].name,
        rawDataDir: this.rawDataDir,
      };
    } catch {
      return { color: null, depth: null, edge: null, rawDataDir: this.rawDataDir };
    }
  }

  /**
   * 3d_raw_data 폴더에서 파일 경로 반환
   */
  getRawFilePath(filename: string): string {
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    return join(this.rawDataDir, filename);
  }

  /**
   * 3장 이미지에서 분석 통계 추출
   * - coveragePercent  : 비배경 픽셀 비율 (검출 커버리지 %)
   * - depthScore       : depth map 표준편차 기반 깊이 분포 지수 (0~100)
   * - orientationStats : 각 부품 블롭의 depth variance로 자세 분류
   *     정방향(Hub Up)   : 허브 상면 + 플랜지 면 두 레벨 → 중간 variance
   *     역방향(Flange Up): 평탄한 플랜지 상면 → 낮은 variance
   *     기울어짐(Tilted) : 높이 차이 큰 gradient → 높은 variance
   */
  async analyzeImages(
    colorFile: string,
    depthFile: string,
    sourceDir: string,
  ): Promise<{ coveragePercent: number; depthScore: number; orientationStats: { hubUp: number; flangeUp: number; tilted: number } }> {
    try {
      const colorPath = join(sourceDir, colorFile);
      const depthPath = join(sourceDir, depthFile);

      // ── color 이미지 로드 ──
      const { data: cData, info: cInfo } = await sharp(colorPath)
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });

      const W = cInfo.width, H = cInfo.height, CH = cInfo.channels;

      // ── depth 이미지 로드 (color와 동일 해상도로 정렬) ──
      const { data: dData } = await sharp(depthPath)
        .grayscale()
        .resize(W, H, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // ── 비배경 픽셀 마스크 & colorKey ──
      const colorKey = new Int32Array(W * H); // 0 = background
      let colorPixels = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * CH;
          const r = cData[i], g = cData[i + 1], b = cData[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luma > this.blackThreshold) {
            colorPixels++;
            colorKey[y * W + x] = (r << 16) | (g << 8) | b;
          }
        }
      }
      const totalPixels = W * H;
      const coveragePercent = Math.round((colorPixels / totalPixels) * 1000) / 10;

      // ── BFS: 색상 블롭별 픽셀 수집 ──
      const NOISE_THRESHOLD_PX = 30;
      const RELATIVE_THRESHOLD = 0.30;
      const visited = new Uint8Array(W * H);
      const colorBlobsMap = new Map<number, number[][]>();
      const queue: number[] = [];

      for (let start = 0; start < W * H; start++) {
        if (!colorKey[start] || visited[start]) continue;
        const targetColor = colorKey[start];
        queue.length = 0;
        queue.push(start);
        visited[start] = 1;
        const pixels: number[] = [];
        while (queue.length) {
          const idx = queue.pop()!;
          pixels.push(idx);
          const cx = idx % W, cy = Math.floor(idx / W);
          for (const [nx, ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (!visited[ni] && colorKey[ni] === targetColor) {
              visited[ni] = 1;
              queue.push(ni);
            }
          }
        }
        if (pixels.length >= NOISE_THRESHOLD_PX) {
          const arr = colorBlobsMap.get(targetColor) ?? [];
          arr.push(pixels);
          colorBlobsMap.set(targetColor, arr);
        }
      }

      // ── 유효 블롭 선별 (색상별 상대 임계값으로 파편 제거) ──
      const validBlobs: number[][] = [];
      for (const blobs of colorBlobsMap.values()) {
        const maxSize = Math.max(...blobs.map(b => b.length));
        for (const blob of blobs) {
          if (blob.length >= maxSize * RELATIVE_THRESHOLD) validBlobs.push(blob);
        }
      }

      // ── 자세 분류: 블롭 내 depth 표준편차 기반 ──
      // 플랜지 허브 top-down 뷰:
      //   정방향(Hub Up)   : 허브 상면 + 플랜지 면 → 두 높이 레벨 → stdev 중간
      //   역방향(Flange Up): 평탄한 플랜지 상면 → stdev 낮음
      //   기울어짐(Tilted) : 부품 전체가 기울어짐 → stdev 높음
      const TILT_STDEV = 22;
      const HUB_STDEV  = 8;
      let hubUp = 0, flangeUp = 0, tilted = 0;

      for (const pixels of validBlobs) {
        // 최대 500픽셀 stride 샘플링 (성능)
        const step = Math.max(1, Math.floor(pixels.length / 500));
        let sum = 0, count = 0;
        for (let i = 0; i < pixels.length; i += step) { sum += dData[pixels[i]]; count++; }
        const mean = sum / count;
        let sqSum = 0;
        for (let i = 0; i < pixels.length; i += step) { const d = dData[pixels[i]] - mean; sqSum += d * d; }
        const stdev = Math.sqrt(sqSum / count);

        if (stdev >= TILT_STDEV)     tilted++;
        else if (stdev >= HUB_STDEV) hubUp++;
        else                          flangeUp++;
      }

      // ── depth 전체 분포 지수 ──
      const depthStats = await sharp(depthPath).stats();
      const globalStdev = depthStats.channels[0]?.stdev ?? 0;
      const maxVal      = depthStats.channels[0]?.max   ?? 1;
      const depthScore  = Math.min(100, Math.round((globalStdev / (maxVal * 0.3)) * 100));

      return { coveragePercent, depthScore, orientationStats: { hubUp, flangeUp, tilted } };
    } catch {
      return { coveragePercent: 0, depthScore: 0, orientationStats: { hubUp: 0, flangeUp: 0, tilted: 0 } };
    }
  }

  /**
   * 원본 IM* 파일을 역할에 맞게 처리하여 PNG 버퍼로 반환
   * - color : 컬러 세그멘테이션 (ch:3) → sRGB 정규화 → PNG
   * - depth : depth map (ch:1 grayscale) → 밝기 부스트 → RGB → PNG
   * - edge  : edge/normal map (ch:3) → grayscale 정규화 → PNG
   */
  async convertRawToPng(filename: string, role: 'color' | 'depth' | 'edge'): Promise<Buffer> {
    const filePath = this.getRawFilePath(filename);

    if (role === 'color') {
      // 팔레트 인덱스 PNG일 수 있으므로 raw 픽셀로 완전 변환 후 RGB PNG로 재인코딩
      const { data, info } = await sharp(filePath)
        .toColourspace('srgb')
        .raw()
        .toBuffer({ resolveWithObject: true });
      return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .png()
        .toBuffer();
    }

    if (role === 'depth') {
      return sharp(filePath)
        .normalise()
        .linear(2.0, 50)
        .toColourspace('srgb')
        .png()
        .toBuffer();
    }

    // edge: normalise()가 이 파일 포맷에서 동작 안 함 → 수동 스케일링
    // 원본 max가 7/255 수준이므로 직접 255/max 배율 적용 후 gamma로 밝기 강조
    {
      const { data, info } = await sharp(filePath)
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });

      let maxVal = 0;
      for (let i = 0; i < data.length; i++) {
        if (data[i] > maxVal) maxVal = data[i];
      }

      const scale = maxVal > 0 ? 255 / maxVal : 1;
      const stretched = Buffer.allocUnsafe(data.length);
      for (let i = 0; i < data.length; i++) {
        // 스케일 후 gamma 0.5 적용 (어두운 엣지 밝게)
        const v = Math.min(255, data[i] * scale);
        stretched[i] = Math.round(Math.pow(v / 255, 0.5) * 255);
      }

      return sharp(stretched, {
        raw: { width: info.width, height: info.height, channels: 1 },
      })
        .png()
        .toBuffer();
    }
  }
}
