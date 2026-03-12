import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import sharp from 'sharp';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class ImageMergeService {
  private readonly baseDirectory: string;
  private readonly rawDataDir: string;
  private readonly outputDir: string;
  private readonly historyDir: string;
  private readonly blackThreshold = 30;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.baseDirectory =
      process.env.IMAGE_DIRECTORY || join(process.cwd(), 'images');
    this.rawDataDir = join(this.baseDirectory, '3d_raw_data');
    this.outputDir = join(this.baseDirectory, '3d_image'); // 3d_image 폴더에 저장
    this.historyDir = join(this.baseDirectory, '3d_history_data');
  }

  /**
   * 3d_raw_data 폴더의 이미지들을 합쳐서 3d_image에 저장
   * 처리 완료 후 원본은 3d_history_data로 이동
   */
  async mergeAndSaveImages(): Promise<{ success: boolean; filename: string; message: string }> {
    try {
      // 폴더 존재 확인 및 생성
      await this.ensureDirectories();

      // raw_data 폴더에서 이미지 파일 목록 가져오기
      const files = await fs.readdir(this.rawDataDir);
      const imageFiles = files
        .filter((f) => /\.(png|jpg|jpeg|bmp)$/i.test(f))
        .sort((a, b) => {
          // 파일명에서 숫자 추출하여 정렬
          const numA = this.extractNumber(a);
          const numB = this.extractNumber(b);
          return numA - numB;
        });

      if (imageFiles.length < 3) {
        return {
          success: false,
          filename: '',
          message: `이미지가 3장 이상 필요합니다. 현재: ${imageFiles.length}장`,
        };
      }

      console.log('정렬된 이미지 파일:', imageFiles);

      // 순서: 두번째(index 1) → 세번째(index 2) → 첫번째(index 0)
      const orderedFiles = [imageFiles[1], imageFiles[2], imageFiles[0]];
      console.log('합치기 순서:', orderedFiles);

      // 이미지 합치기
      const mergedBuffer = await this.mergeImagesOverlay(orderedFiles);

      // 출력 파일명 생성 (오늘 날짜_시간)
      const now = new Date();
      const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}.png`;

      const outputPath = join(this.outputDir, filename);
      await fs.writeFile(outputPath, mergedBuffer);
      console.log(`합쳐진 이미지 저장: ${outputPath}`);

      // 원본 파일들을 history 폴더로 이동
      const timestamp = now.getTime();
      for (const file of imageFiles.slice(0, 3)) {
        const srcPath = join(this.rawDataDir, file);
        const destPath = join(this.historyDir, `${timestamp}_${file}`);
        await fs.rename(srcPath, destPath);
        console.log(`이동: ${file} → ${destPath}`);
      }

      // 이벤트 발생 (Auto 모드에서 화면에 표시하기 위함)
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
   * 필요한 디렉토리 생성
   */
  private async ensureDirectories(): Promise<void> {
    for (const dir of [this.rawDataDir, this.outputDir, this.historyDir]) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`디렉토리 생성: ${dir}`);
      }
    }
  }

  /**
   * 이미지들을 overlay 방식으로 합치기
   * 검은색이 아닌 부분만 덮어쓰기
   */
  private async mergeImagesOverlay(orderedFiles: string[]): Promise<Buffer> {
    // 첫 번째 이미지를 베이스로 로드
    const basePath = join(this.rawDataDir, orderedFiles[0]);
    const baseImage = sharp(basePath);
    const baseMeta = await baseImage.metadata();

    const width = baseMeta.width!;
    const height = baseMeta.height!;

    // 베이스 이미지의 raw 픽셀 데이터 가져오기
    let baseBuffer = await baseImage
      .resize(width, height)
      .raw()
      .toBuffer();

    const channels = 3; // RGB

    // 나머지 이미지들을 순차적으로 overlay
    for (let i = 1; i < orderedFiles.length; i++) {
      const overlayPath = join(this.rawDataDir, orderedFiles[i]);
      const overlayImage = sharp(overlayPath);

      // overlay 이미지의 raw 픽셀 데이터
      const overlayBuffer = await overlayImage
        .resize(width, height)
        .raw()
        .toBuffer();

      // 픽셀 단위로 합치기
      const newBuffer = Buffer.alloc(baseBuffer.length);

      for (let p = 0; p < width * height; p++) {
        const idx = p * channels;
        const r = overlayBuffer[idx];
        const g = overlayBuffer[idx + 1];
        const b = overlayBuffer[idx + 2];

        // 그레이스케일 밝기 계산 (OpenCV와 동일한 방식)
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        if (gray > this.blackThreshold) {
          // 검은색이 아니면 overlay 픽셀 사용
          newBuffer[idx] = r;
          newBuffer[idx + 1] = g;
          newBuffer[idx + 2] = b;
        } else {
          // 검은색이면 베이스 픽셀 유지
          newBuffer[idx] = baseBuffer[idx];
          newBuffer[idx + 1] = baseBuffer[idx + 1];
          newBuffer[idx + 2] = baseBuffer[idx + 2];
        }
      }

      baseBuffer = newBuffer;
      console.log(`${i + 1}번째 이미지 오버레이 완료: ${orderedFiles[i]}`);
    }

    // 최종 이미지를 PNG로 변환
    const result = await sharp(baseBuffer, {
      raw: { width, height, channels },
    })
      .png()
      .toBuffer();

    return result;
  }

  /**
   * raw_data 폴더의 현재 상태 확인
   */
  async getRawDataStatus(): Promise<{ count: number; files: string[] }> {
    try {
      await this.ensureDirectories();
      const files = await fs.readdir(this.rawDataDir);
      const imageFiles = files.filter((f) => /\.(png|jpg|jpeg|bmp)$/i.test(f));
      return { count: imageFiles.length, files: imageFiles };
    } catch {
      return { count: 0, files: [] };
    }
  }
}
