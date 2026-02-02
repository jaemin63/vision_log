import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ImageMetadataDto } from './dto/image-metadata.dto';

@Injectable()
export class ImageService {
  private readonly imageDirectory: string;
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
    this.imageDirectory =
      process.env.IMAGE_DIRECTORY || join(process.cwd(), 'images');
  }

  /**
   * Check if file has an allowed image extension
   */
  isImageFile(filename: string): boolean {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return this.allowedExtensions.includes(ext);
  }

  /**
   * Scan directory and return list of image files with metadata
   */
  async getImageList(): Promise<ImageMetadataDto[]> {
    try {
      // Read directory contents
      const files = await fs.readdir(this.imageDirectory);

      // Filter image files and get their stats
      const imagePromises = files
        .filter((file) => this.isImageFile(file))
        .map(async (filename): Promise<ImageMetadataDto> => {
          const filePath = join(this.imageDirectory, filename);
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
          `Image directory not found: ${this.imageDirectory}. Returning empty list.`,
        );
        return [];
      }
      throw error;
    }
  }

  /**
   * Get the full path to an image file
   */
  getImagePath(filename: string): string {
    // Security: Validate filename doesn't contain path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid filename');
    }
    return join(this.imageDirectory, filename);
  }

  /**
   * Check if image file exists
   */
  async imageExists(filename: string): Promise<boolean> {
    try {
      const filePath = this.getImagePath(filename);
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
