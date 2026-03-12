import {
  Controller,
  Get,
  Param,
  Post,
  Put,
  Body,
  Res,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Response } from 'express';
import { ImageService } from './image.service';
import { ImageMergeService } from './services/image-merge.service';
import { ImageCopyService } from './services/image-copy.service';
import { ImageMetadataDto } from './dto/image-metadata.dto';
import { ImageEventService } from './interfaces/image-event-service.interface';
import { PollingConfigService, PollingConfig } from '../config/polling.config';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';

@Controller()
export class ImageController {
  constructor(
    private readonly imageService: ImageService,
    private readonly imageMergeService: ImageMergeService,
    private readonly imageCopyService: ImageCopyService,
    @Inject('ImageEventService')
    private readonly imageEventService: ImageEventService,
    private readonly configService: PollingConfigService,
  ) {}

  @Get('health')
  health() {
    return { status: 'OK', message: 'Image Logger Backend is running' };
  }

  @Get('api/images')
  async getImages(): Promise<ImageMetadataDto[]> {
    try {
      return await this.imageService.getImageList();
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to retrieve image list',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get 2D image list
   * GET /api/images/2d
   */
  @Get('api/images/2d')
  async getImages2d(): Promise<ImageMetadataDto[]> {
    try {
      return await this.imageService.getImageList2d();
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to retrieve 2D image list',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get 3D image list
   * GET /api/images/3d
   */
  @Get('api/images/3d')
  async getImages3d(): Promise<ImageMetadataDto[]> {
    try {
      return await this.imageService.getImageList3d();
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to retrieve 3D image list',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Serve 2D image file
   * GET /api/images/2d/:filename
   */
  @Get('api/images/2d/:filename')
  async getImage2d(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.serveImage(filename, '2d', res);
  }

  /**
   * Serve 3D image file
   * GET /api/images/3d/:filename
   */
  @Get('api/images/3d/:filename')
  async getImage3d(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.serveImage(filename, '3d', res);
  }

  /**
   * Legacy: Serve image file (defaults to 3D)
   * GET /api/images/:filename
   */
  @Get('api/images/:filename')
  async getImage(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.serveImage(filename, '3d', res);
  }

  /**
   * Internal method to serve image file
   */
  private async serveImage(
    filename: string,
    type: '2d' | '3d',
    res: Response,
  ): Promise<void> {
    try {
      // Security: Validate filename
      if (
        filename.includes('..') ||
        filename.includes('/') ||
        filename.includes('\\')
      ) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Invalid filename',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if file is a valid image file
      if (!this.imageService.isImageFile(filename)) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Invalid file type',
            message: 'File must be a valid image file',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if file exists
      const filePath = this.imageService.getImagePath(filename, type);
      if (!existsSync(filePath)) {
        throw new HttpException(
          {
            status: HttpStatus.NOT_FOUND,
            error: 'Image not found',
            message: `Image file '${filename}' does not exist`,
          },
          HttpStatus.NOT_FOUND,
        );
      }

      // Set proper headers
      const mimeType = this.imageService.getMimeType(filename);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

      // Stream the file
      const fileStream = createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to serve image',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get event service status
   * GET /api/events/status
   */
  @Get('api/events/status')
  getEventServiceStatus() {
    return this.imageEventService.getStatus();
  }

  /**
   * Start polling service
   * POST /api/events/polling/start
   */
  @Post('api/events/polling/start')
  async startPolling() {
    try {
      if (this.imageEventService.isRunning()) {
        return {
          success: true,
          message: 'Polling service is already running',
          status: this.imageEventService.getStatus(),
        };
      }

      await this.imageEventService.start();
      return {
        success: true,
        message: 'Polling service started',
        status: this.imageEventService.getStatus(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to start polling service',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Stop polling service
   * POST /api/events/polling/stop
   */
  @Post('api/events/polling/stop')
  async stopPolling() {
    try {
      if (!this.imageEventService.isRunning()) {
        return {
          success: true,
          message: 'Polling service is already stopped',
          status: this.imageEventService.getStatus(),
        };
      }

      await this.imageEventService.stop();
      return {
        success: true,
        message: 'Polling service stopped',
        status: this.imageEventService.getStatus(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to stop polling service',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test endpoint: Manually trigger image event (for testing)
   * POST /api/events/trigger
   * Body: { filename: string }
   */
  @Post('api/events/trigger')
  async triggerEvent(@Body() body: { filename?: string }) {
    try {
      const imageFilename = body?.filename;

      if (!imageFilename) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Missing filename',
            message: 'Please provide filename in request body: { "filename": "image.jpg" }',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Check if service is running
      if (!this.imageEventService.isRunning()) {
        // Auto-start for testing
        await this.imageEventService.start();
      }

      // Trigger event (works with MockImageEventService)
      if ('triggerEvent' in this.imageEventService) {
        (this.imageEventService as any).triggerEvent(imageFilename);
        return {
          success: true,
          message: `Event triggered for ${imageFilename}`,
        };
      } else {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Event service does not support manual triggering',
            message: 'This endpoint only works with MockImageEventService',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to trigger event',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Test endpoint: Merge 3D images and trigger event
   * POST /api/test/merge-images
   * 3d_raw_data 폴더의 이미지를 합쳐서 3d_image에 저장하고 이벤트 발생
   */
  @Post('api/test/merge-images')
  async mergeImages() {
    try {
      const result = await this.imageMergeService.mergeAndSaveImages();

      if (!result.success) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Failed to merge images',
            message: result.message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to merge images',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get 3d_raw_data folder status
   * GET /api/test/raw-data-status
   */
  @Get('api/test/raw-data-status')
  async getRawDataStatus() {
    return this.imageMergeService.getRawDataStatus();
  }

  /**
   * Test endpoint: Copy 2D image
   * POST /api/test/copy-2d-image
   * 2d_raw_data 폴더의 이미지를 2d_image에 복사하고 이벤트 발생
   */
  @Post('api/test/copy-2d-image')
  async copy2dImage() {
    try {
      const result = await this.imageCopyService.copyLatest2dImage();

      if (!result.success) {
        throw new HttpException(
          {
            status: HttpStatus.BAD_REQUEST,
            error: 'Failed to copy 2D image',
            message: result.message,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: 'Failed to copy 2D image',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get 2d_raw_data folder status
   * GET /api/test/raw-data-status-2d
   */
  @Get('api/test/raw-data-status-2d')
  async getRawDataStatus2d() {
    return this.imageCopyService.getRawDataStatus();
  }

  /**
   * Get viewer configuration
   * GET /api/config/viewer
   */
  @Get('api/config/viewer')
  getViewerConfig() {
    return this.configService.getViewerConfig();
  }

  /**
   * Update viewer configuration
   * PUT /api/config/viewer
   */
  @Put('api/config/viewer')
  updateViewerConfig(@Body() body: { initialZoomPercent?: number }) {
    return this.configService.updateConfig({
      viewer: body,
    }).viewer;
  }
}
