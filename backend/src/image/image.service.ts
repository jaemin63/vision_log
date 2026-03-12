import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ImageMetadataDto } from './dto/image-metadata.dto';

@Injectable()
export class ImageService {
  private readonly baseDirectory: string;
  private readonly imageDirectory2d: string;
  private readonly imageDirectory3d: string;
  private readonly allowedExtensions = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.webp',
  ];

  constructor() {
    // Get image directory from environment variable or use default
    this.baseDirectory =
      process.env.IMAGE_DIRECTORY || join(process.cwd(), 'images');
    this.imageDirectory2d = join(this.baseDirectory, '2d_image');
    this.imageDirectory3d = join(this.baseDirectory, '3d_image');
  }

  /**
   * Check if file has an allowed image extension
   */
  isImageFile(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return this.allowedExtensions.includes(ext);
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.access(dir);
    } catch {
      await fs.mkdir(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }

  /**
   * Scan directory and return list of image files with metadata
   */
  private async getImageListFromDir(
    directory: string,
  ): Promise<ImageMetadataDto[]> {
    try {
      // Ensure directory exists
      await this.ensureDirectory(directory);

      // Read directory contents
      const files = await fs.readdir(directory);

      // Filter image files and get their stats
      const imagePromises = files
        .filter((file) => this.isImageFile(file))
        .map(async (filename): Promise<ImageMetadataDto> => {
          const filePath = join(directory, filename);
          const stats = await fs.stat(filePath);

          return {
            filename,
            timestamp: stats.mtime, // Modification time
          };
        });

      const images = await Promise.all(imagePromises);

      // Sort by timestamp (newest first)
      return images.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
    } catch (error: any) {
      // If directory doesn't exist or can't be read, return empty array
      if (error?.code === 'ENOENT') {
        console.warn(
          `Image directory not found: ${directory}. Returning empty list.`,
        );
        return [];
      }
      throw error;
    }
  }

  /**
   * Get 2D image list
   */
  async getImageList2d(): Promise<ImageMetadataDto[]> {
    return this.getImageListFromDir(this.imageDirectory2d);
  }

  /**
   * Get 3D image list
   */
  async getImageList3d(): Promise<ImageMetadataDto[]> {
    return this.getImageListFromDir(this.imageDirectory3d);
  }

  /**
   * Legacy: Get image list (defaults to 3D for backward compatibility)
   */
  async getImageList(): Promise<ImageMetadataDto[]> {
    return this.getImageList3d();
  }

  /**
   * Get the full path to an image file
   */
  getImagePath(filename: string, type: '2d' | '3d' = '3d'): string {
    // Security: Validate filename doesn't contain path traversal
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new Error('Invalid filename');
    }
    const dir = type === '2d' ? this.imageDirectory2d : this.imageDirectory3d;
    return join(dir, filename);
  }

  /**
   * Check if image file exists
   */
  async imageExists(
    filename: string,
    type: '2d' | '3d' = '3d',
  ): Promise<boolean> {
    try {
      const filePath = this.getImagePath(filename, type);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get MIME type based on file extension
   */
  getMimeType(filename: string): string {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
