import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';
import { MockImageEventService } from './services/mock-image-event.service';
import { ModbusImageEventService } from './services/modbus-image-event.service';
import { ImageMergeService } from './services/image-merge.service';
import { ImageCopyService } from './services/image-copy.service';
import { ImageEventsGateway } from './gateways/image-events.gateway';
import { PollingConfigService } from '../config/polling.config';
import { EventEmitter2 } from '@nestjs/event-emitter';

// Determine which event service to use based on config
const getImageEventService = (configService: PollingConfigService) => {
  const config = configService.getConfig();
  if (config.modbus.enabled) {
    return ModbusImageEventService;
  }
  return MockImageEventService;
};

@Module({
  controllers: [ImageController],
  providers: [
    ImageService,
    ImageMergeService,
    ImageCopyService,
    PollingConfigService,
    // Use MockImageEventService for development/testing
    // Switch to ModbusImageEventService when modbus.enabled=true in config
    {
      provide: 'ImageEventService',
      useFactory: (
        configService: PollingConfigService,
        eventEmitter: EventEmitter2,
        imageMergeService: ImageMergeService,
        imageCopyService: ImageCopyService,
      ) => {
        const ServiceClass = getImageEventService(configService);
        if (ServiceClass === ModbusImageEventService) {
          return new ModbusImageEventService(
            configService,
            imageMergeService,
            imageCopyService,
          );
        }
        return new MockImageEventService(eventEmitter);
      },
      inject: [PollingConfigService, EventEmitter2, ImageMergeService, ImageCopyService],
    },
    ImageEventsGateway,
  ],
  exports: [
    ImageService,
    'ImageEventService',
    PollingConfigService,
    ImageMergeService,
    ImageCopyService,
  ],
})
export class ImageModule {}
