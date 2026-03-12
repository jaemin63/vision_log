import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { promises as fs } from 'fs';
import { join } from 'path';

@Injectable()
export class ImageCopyService {
  private readonly baseDirectory: string;
  private readonly rawDataDir: string;
  private readonly outputDir: string;

  constructor(private readonly eventEmitter: EventEmitter2) {
    this.baseDirectory =
      process.env.IMAGE_DIRECTORY || join(process.cwd(), 'images');
    this.rawDataDir = join(this.baseDirectory, '2d_raw_data');
    this.outputDir = join(this.baseDirectory, '2d_image');
  }

  /**
   * 2d_raw_data 폴더에서 최신 이미지를 가져와 2d_image에 저장
   * 처리 완료 후 원본 삭제
   */
  async copyLatest2dImage(): Promise<{
    success: boolean;
    filename: string;
    message: string;
  }> {
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

      if (imageFiles.length === 0) {
        return {
          success: false,
          filename: '',
          message: '2d_raw_data 폴더에 이미지가 없습니다.',
        };
      }

      // 가장 최신(마지막) 이미지 파일 선택
      const sourceFile = imageFiles[imageFiles.length - 1];
      const sourcePath = join(this.rawDataDir, sourceFile);

      console.log(`2D 이미지 복사 대상: ${sourceFile}`);

      // 출력 파일명 생성 (오늘 날짜_시간)
      const now = new Date();
      const ext = sourceFile.substring(sourceFile.lastIndexOf('.'));
      const filename = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${ext}`;

      const outputPath = join(this.outputDir, filename);

      // 파일 복사
      await fs.copyFile(sourcePath, outputPath);
      console.log(`2D 이미지 저장: ${outputPath}`);

      // 원본 파일 삭제
      await fs.unlink(sourcePath);
      console.log(`원본 삭제: ${sourcePath}`);

      // 이벤트 발생 (Auto 모드에서 화면에 표시하기 위함)
      this.eventEmitter.emit('image.event.2d', {
        filename,
        timestamp: now,
      });

      return {
        success: true,
        filename,
        message: `2D 이미지 복사 완료: ${filename}`,
      };
    } catch (error) {
      console.error('2D 이미지 복사 실패:', error);
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
    for (const dir of [this.rawDataDir, this.outputDir]) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
        console.log(`디렉토리 생성: ${dir}`);
      }
    }
  }

  /**
   * 2d_raw_data 폴더의 현재 상태 확인
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
