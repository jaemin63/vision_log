import type { ImageMetadata } from '../types/image';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = {
  /**
   * Get list of images
   */
  async getImages(): Promise<ImageMetadata[]> {
    const response = await fetch(`${API_URL}/api/images`);
    if (!response.ok) {
      throw new Error(`Failed to fetch images: ${response.statusText}`);
    }
    const data = await response.json();
    // Convert timestamp strings to Date objects
    return data.map((img: any) => ({
      ...img,
      timestamp: new Date(img.timestamp),
    }));
  },

  /**
   * Get image URL
   */
  getImageUrl(filename: string): string {
    return `${API_URL}/api/images/${encodeURIComponent(filename)}`;
  },

  /**
   * Start polling service
   */
  async startPolling(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/events/polling/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to start polling: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Stop polling service
   */
  async stopPolling(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/events/polling/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to stop polling: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get polling configuration
   */
  async getPollingConfig(): Promise<any> {
    const response = await fetch(`${API_URL}/api/config/polling`);
    if (!response.ok) {
      throw new Error(`Failed to get config: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Update polling configuration
   */
  async updatePollingConfig(config: any): Promise<any> {
    const response = await fetch(`${API_URL}/api/config/polling`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      throw new Error(`Failed to update config: ${response.statusText}`);
    }
    return response.json();
  },
};
