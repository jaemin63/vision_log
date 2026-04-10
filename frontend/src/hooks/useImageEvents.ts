import { useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getApiBaseUrl } from '../services/api';

export interface ImageEvent {
  filename: string;
  timestamp: Date;
  type: '2d' | '3d';
  stats?: {
    coveragePercent: number;
    depthScore: number;
    orientationStats: {
      hubUp: number;
      flangeUp: number;
      tilted: number;
    };
  };
  forced?: boolean; // Test button에서 강제 트리거 시 true
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
  const emitMockEvent = useCallback((filename: string, type: '2d' | '3d' = '3d') => {
    const event: ImageEvent = {
      filename,
      timestamp: new Date(),
      type,
    };
    handlerRef.current(event);
  }, []);

  // Socket.IO connection setup
  useEffect(() => {
    const serverUrl = getApiBaseUrl();
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
    
    socket.on('image-event-2d', (data: { type: string; filename: string; timestamp: string }) => {
      console.log('2D Image event received:', data);
      handlerRef.current({
        filename: data.filename,
        timestamp: new Date(data.timestamp),
        type: '2d',
      });
    });

    socket.on('image-event-3d', (data: { type: string; filename: string; timestamp: string; forced?: boolean; stats?: { coveragePercent: number; depthScore: number; orientationStats: { hubUp: number; flangeUp: number; tilted: number } } }) => {
      console.log('3D Image event received:', data);
      handlerRef.current({
        filename: data.filename,
        timestamp: new Date(data.timestamp),
        type: '3d',
        forced: data.forced ?? false,
        stats: data.stats,
      });
    });

    // Legacy: handle generic image-event (default to 3D)
    socket.on('image-event', (data: { type: string; filename: string; timestamp: string }) => {
      console.log('Image event received (legacy):', data);
      handlerRef.current({
        filename: data.filename,
        timestamp: new Date(data.timestamp),
        type: '3d',
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

  const forceTrigger = useCallback((filename: string) => {
    handlerRef.current({
      filename,
      timestamp: new Date(),
      type: '3d',
      forced: true,
    });
  }, []);

  return {
    emitMockEvent, // For testing - remove in production
    forceTrigger,
  };
}
