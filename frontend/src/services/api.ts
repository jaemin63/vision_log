import type { ImageMetadata } from '../types/image';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = {
  /**
   * Get list of 2D images
   */
  async getImages2d(): Promise<ImageMetadata[]> {
    const response = await fetch(`${API_URL}/api/images/2d`);
    if (!response.ok) {
      throw new Error(`Failed to fetch 2D images: ${response.statusText}`);
    }
    const data = await response.json();
    return data.map((img: any) => ({
      ...img,
      timestamp: new Date(img.timestamp),
    }));
  },

  /**
   * Get list of 3D images
   */
  async getImages3d(): Promise<ImageMetadata[]> {
    const response = await fetch(`${API_URL}/api/images/3d`);
    if (!response.ok) {
      throw new Error(`Failed to fetch 3D images: ${response.statusText}`);
    }
    const data = await response.json();
    return data.map((img: any) => ({
      ...img,
      timestamp: new Date(img.timestamp),
    }));
  },

  /**
   * Legacy: Get list of images (defaults to 3D)
   */
  async getImages(): Promise<ImageMetadata[]> {
    return this.getImages3d();
  },

  /**
   * Get image URL
   */
  getImageUrl(filename: string, type: '2d' | '3d' = '3d'): string {
    return `${API_URL}/api/images/${type}/${encodeURIComponent(filename)}`;
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

  /**
   * Demo: demo_raw 폴더의 고정 파일로 합성 (파일 삭제 없음)
   */
  async demoMerge(): Promise<{ success: boolean; filename: string; message: string }> {
    const response = await fetch(`${API_URL}/api/demo/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to demo merge: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Test: Merge 3D images
   * 3d_raw_data 폴더의 이미지를 합쳐서 3d_image에 저장
   */
  async mergeTestImages(): Promise<{ success: boolean; filename: string; message: string }> {
    const response = await fetch(`${API_URL}/api/test/merge-images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || `Failed to merge images: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get raw data folder status
   */
  async getRawDataStatus(): Promise<{ count: number; files: string[] }> {
    const response = await fetch(`${API_URL}/api/test/raw-data-status`);
    if (!response.ok) {
      throw new Error(`Failed to get raw data status: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get viewer configuration
   */
  async getViewerConfig(): Promise<{ initialZoomPercent: number }> {
    const response = await fetch(`${API_URL}/api/config/viewer`);
    if (!response.ok) {
      throw new Error(`Failed to get viewer config: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get latest raw image set (color, depth, edge filenames)
   */
  async getLatestRawSet(): Promise<{
    color: string | null;
    depth: string | null;
    edge: string | null;
    rawDataDir: string;
  }> {
    const response = await fetch(`${API_URL}/api/images/3d-raw/latest`);
    if (!response.ok) {
      throw new Error(`Failed to get latest raw set: ${response.statusText}`);
    }
    return response.json();
  },

  /**
   * Get URL for a raw image file (role 지정 시 sharp로 PNG 변환)
   */
  getRawImageUrl(filename: string, role?: 'color' | 'depth' | 'edge'): string {
    const base = `${API_URL}/api/images/3d-raw/${encodeURIComponent(filename)}`;
    return role ? `${base}?role=${role}` : base;
  },

  /**
   * Get latest merged 3D image filename
   */
  async getLatestMergedImage(): Promise<ImageMetadata | null> {
    const images = await this.getImages3d();
    return images.length > 0 ? images[0] : null;
  },
};
