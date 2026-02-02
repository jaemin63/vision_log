import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ImageEventService } from '../interfaces/image-event-service.interface';

/**
 * Mock image event service for testing/development
 * 
 * This service can be manually triggered or use a file watcher
 * to simulate image events.
 * 
 * In production, replace this with ModbusImageEventService
 */
@Injectable()
export class MockImageEventService
  implements ImageEventService, OnModuleInit, OnModuleDestroy
{
  private running = false;
  private lastEvent: Date | undefined;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async onModuleInit() {
    // Auto-start in development mode
    if (process.env.NODE_ENV !== 'production') {
      // Optionally start automatically for testing
      // await this.start();
    }
  }

  async onModuleDestroy() {
    await this.stop();
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    console.log('MockImageEventService started (for testing)');
    
    // In a real implementation, you might:
    // - Start file watcher
    // - Set up polling interval
    // - Connect to external service
  }

  async stop(): Promise<void> {
    this.running = false;
    console.log('MockImageEventService stopped');
  }

  isRunning(): boolean {
    return this.running;
  }

  getStatus() {
    return {
      running: this.running,
      lastEvent: this.lastEvent,
    };
  }

  /**
   * Manually trigger an image event (for testing)
   * 
   * @param filename - Name of the image file that triggered the event
   */
  triggerEvent(filename: string): void {
    if (!this.running) {
      console.warn('MockImageEventService is not running. Event not emitted.');
      return;
    }

    this.lastEvent = new Date();
    
    // Emit event that will be picked up by WebSocket gateway
    this.eventEmitter.emit('image.event', {
      filename,
      timestamp: this.lastEvent,
    });

    console.log(`MockImageEventService: Emitted event for ${filename}`);
  }
}
