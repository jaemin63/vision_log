import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ImageModule } from './image/image.module';

@Module({
  imports: [
    // EventEmitter for internal event communication
    EventEmitterModule.forRoot(),
    ImageModule,
  ],
})
export class AppModule {}
