import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export interface ImageEvent {
  filename: string;
  timestamp: Date;
}

type ImageEventHandler = (event: ImageEvent) => void;

/**
 * Hook for handling image events
 * Currently uses mock events for testing
 * Future: Will connect to WebSocket for real-time events
 */
export function useImageEvents(onEvent: ImageEventHandler) {
  const handlerRef = useRef<ImageEventHandler>(onEvent);

  // Update handler ref when callback changes
  useEffect(() => {
    handlerRef.current = onEvent;
  }, [onEvent]);

  // Mock event emitter for testing
  const emitMockEvent = useCallback((filename: string) => {
    const event: ImageEvent = {
      filename,
      timestamp: new Date(),
    };
    handlerRef.current(event);
  }, []);

  // Socket.IO connection setup
  useEffect(() => {
    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
    console.log('Connecting to Socket.IO:', `${serverUrl}/events`);
    
    const socket: Socket = io(`${serverUrl}/events`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    
    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket.id);
    });
    
    socket.on('connected', (data: any) => {
      console.log('Socket.IO connection confirmed:', data.message);
    });
    
    socket.on('image-event', (data: { type: string; filename: string; timestamp: string }) => {
      console.log('Image event received:', data);
      handlerRef.current({
        filename: data.filename,
        timestamp: new Date(data.timestamp),
      });
    });
    
    socket.on('disconnect', (reason: string) => {
      console.log('Socket.IO disconnected:', reason);
    });
    
    socket.on('connect_error', (error: Error) => {
      console.error('Socket.IO connection error:', error);
    });
    
    return () => {
      console.log('Closing Socket.IO connection');
      socket.disconnect();
    };
  }, []);

  return {
    emitMockEvent, // For testing - remove in production
  };
}
