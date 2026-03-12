import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

/**
 * WebSocket Gateway for Image Events
 * 
 * This gateway broadcasts image events to connected frontend clients.
 * 
 * Connection:
 * - Frontend connects to: ws://localhost:3000/events
 * - Events are automatically broadcast to all connected clients
 * 
 * Event Format:
 * {
 *   type: 'image-event',
 *   filename: string,
 *   timestamp: Date
 * }
 * 
 * Usage in Frontend:
 * ```typescript
 * const ws = new WebSocket('ws://localhost:3000/events');
 * ws.onmessage = (message) => {
 *   const data = JSON.parse(message.data);
 *   if (data.type === 'image-event') {
 *     // Handle image event
 *   }
 * };
 * ```
 */
@Injectable()
@WebSocketGateway({
  namespace: '/events',
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  },
})
export class ImageEventsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    console.log('ImageEventsGateway initialized');
  }

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
    // Send welcome message
    client.emit('connected', {
      message: 'Connected to Image Events Gateway',
      timestamp: new Date(),
    });
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Listen for 2D image events from EventEmitter
   * and broadcast to all connected WebSocket clients
   */
  @OnEvent('image.event.2d')
  handleImage2dEvent(payload: { filename: string; timestamp: Date }) {
    const eventData = {
      type: 'image-event-2d',
      filename: payload.filename,
      timestamp: payload.timestamp,
    };

    // Broadcast to all connected clients
    this.server.emit('image-event-2d', eventData);
    console.log(`Broadcasted 2D image event: ${payload.filename}`);
  }

  /**
   * Listen for 3D image events from EventEmitter
   * and broadcast to all connected WebSocket clients
   */
  @OnEvent('image.event.3d')
  handleImage3dEvent(payload: { filename: string; timestamp: Date }) {
    const eventData = {
      type: 'image-event-3d',
      filename: payload.filename,
      timestamp: payload.timestamp,
    };

    // Broadcast to all connected clients
    this.server.emit('image-event-3d', eventData);
    console.log(`Broadcasted 3D image event: ${payload.filename}`);
  }

  /**
   * Legacy: Listen for generic image events (backward compatibility)
   */
  @OnEvent('image.event')
  handleImageEvent(payload: { filename: string; timestamp: Date }) {
    const eventData = {
      type: 'image-event',
      filename: payload.filename,
      timestamp: payload.timestamp,
    };

    // Broadcast to all connected clients
    this.server.emit('image-event', eventData);
    console.log(`Broadcasted image event: ${payload.filename}`);
  }

  /**
   * Manual method to send image event (for testing)
   */
  sendImageEvent(filename: string) {
    this.handleImageEvent({
      filename,
      timestamp: new Date(),
    });
  }
}
