/**
 * Interface for image event services
 * 
 * This interface defines the contract for services that detect image events
 * (e.g., from Modbus/TCP polling, file watchers, etc.)
 * 
 * Implementation examples:
 * - MockImageEventService: For testing/development
 * - ModbusImageEventService: Polls Modbus/TCP device and triggers events
 */
export interface ImageEventService {
  /**
   * Start the event service (e.g., start polling, connect to device)
   */
  start(): Promise<void> | void;

  /**
   * Stop the event service (e.g., stop polling, disconnect from device)
   */
  stop(): Promise<void> | void;

  /**
   * Check if the service is currently running
   */
  isRunning(): boolean;

  /**
   * Get service status information
   */
  getStatus(): {
    running: boolean;
    lastEvent?: Date;
    error?: string;
  };
}
