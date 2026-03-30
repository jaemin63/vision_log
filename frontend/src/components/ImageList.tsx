import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { ImageMetadata } from '../types/image';
import './ImageList.css';

interface ImageListProps {
  onImageSelect3d: (image: ImageMetadata | null) => void;
  onImagesLoaded3d?: (images: ImageMetadata[]) => void;
  onRefreshRef?: (refreshFn: () => Promise<void>) => void;
}

export function ImageList({
  onImageSelect3d,
  onImagesLoaded3d,
  onRefreshRef,
}: ImageListProps) {
  const [images3d, setImages3d] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilename3d, setSelectedFilename3d] = useState<string | null>(
    null
  );

  useEffect(() => {
    loadImages();
  }, []);

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshRef) {
      onRefreshRef(loadImages);
    }
  }, [onRefreshRef]);

  const loadImages = async () => {
    try {
      setLoading(true);
      setError(null);

      const list3d = await api.getImages3d();
      setImages3d(list3d);
      onImagesLoaded3d?.(list3d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
      console.error('Error loading images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick3d = (image: ImageMetadata) => {
    setSelectedFilename3d(image.filename);
    onImageSelect3d(image);
  };

  const formatTimestamp = (timestamp: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(timestamp);
  };

  if (loading) {
    return (
      <div className="image-list-loading">
        <p>Loading images...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="image-list-error">
        <p>Error: {error}</p>
        <button onClick={loadImages} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="image-list-container">
      {/* 3D Image Section */}
      <div className="image-list-section">
        <div className="image-list-section-header">3D Images</div>
        <div className="image-list">
          {images3d.length === 0 ? (
            <div className="image-list-section-empty">No 3D images</div>
          ) : (
            images3d.map((image) => (
              <div
                key={image.filename}
                className={`image-list-item ${
                  selectedFilename3d === image.filename ? 'selected' : ''
                }`}
                onClick={() => handleImageClick3d(image)}
              >
                <div className="image-list-item-filename">{image.filename}</div>
                <div className="image-list-item-timestamp">
                  {formatTimestamp(image.timestamp)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
