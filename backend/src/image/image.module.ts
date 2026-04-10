import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';
import { MockImageEventService } from './services/mock-image-event.service';
import { ModbusImageEventService } from './services/modbus-image-event.service';
import { FolderPollingImageEventService } from './services/folder-polling-image-event.service';
import { ApiPollingImageEventService } from './services/api-polling-image-event.service';
import { ImageMergeService } from './services/image-merge.service';
import { ImageCopyService } from './services/image-copy.service';
import { ImageEventsGateway } from './gateways/image-events.gateway';
import { PollingConfigService } from '../config/polling.config';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Module({
  controllers: [ImageController],
  providers: [
    ImageService,
    ImageMergeService,
    ImageCopyService,
    PollingConfigService,
    {
      provide: 'ImageEventService',
      useFactory: (
        configService: PollingConfigService,
        eventEmitter: EventEmitter2,
        imageMergeService: ImageMergeService,
        imageCopyService: ImageCopyService,
      ) => {
        const cfg = configService.getConfig();

        // 우선순위: api > folder > modbus > mock
        if (cfg.api.enabled) {
          console.log('[ImageModule] API 폴링 모드 (외부 서버)');
          return new ApiPollingImageEventService(configService, imageMergeService);
        }
        if (cfg.folder.enabled) {
          console.log('[ImageModule] 폴더 폴링 모드');
          return new FolderPollingImageEventService(configService, imageMergeService);
        }
        if (cfg.modbus.enabled) {
          console.log('[ImageModule] Modbus 직접 연결 모드');
          return new ModbusImageEventService(configService, imageMergeService, imageCopyService);
        }
        console.log('[ImageModule] Mock 모드 (개발/테스트)');
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
