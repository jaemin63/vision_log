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
import { ImageMetadataDto } from './dto/image-metadata.dto';
import { ImageEventService } from './interfaces/image-event-service.interface';
import { PollingConfigService, PollingConfig } from '../config/polling.config';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';

@Controller()
export class ImageController {
  constructor(
    private readonly imageService: ImageService,
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

  @Get('api/images/:filename')
  async getImage(
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    try {
      // Security: Validate filename
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
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
      const filePath = this.imageService.getImagePath(filename);
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
}
