import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { ImageMetadata } from '../types/image';
import './ImageList.css';

interface ImageListProps {
  onImageSelect2d: (image: ImageMetadata | null) => void;
  onImageSelect3d: (image: ImageMetadata | null) => void;
  onImagesLoaded2d?: (images: ImageMetadata[]) => void;
  onImagesLoaded3d?: (images: ImageMetadata[]) => void;
  onRefreshRef?: (refreshFn: () => Promise<void>) => void;
}

export function ImageList({
  onImageSelect2d,
  onImageSelect3d,
  onImagesLoaded2d,
  onImagesLoaded3d,
  onRefreshRef,
}: ImageListProps) {
  const [images2d, setImages2d] = useState<ImageMetadata[]>([]);
  const [images3d, setImages3d] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilename2d, setSelectedFilename2d] = useState<string | null>(
    null
  );
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

      // Load both 2D and 3D images in parallel
      const [list2d, list3d] = await Promise.all([
        api.getImages2d(),
        api.getImages3d(),
      ]);

      setImages2d(list2d);
      setImages3d(list3d);
      onImagesLoaded2d?.(list2d);
      onImagesLoaded3d?.(list3d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
      console.error('Error loading images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick2d = (image: ImageMetadata) => {
    setSelectedFilename2d(image.filename);
    onImageSelect2d(image);
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
      {/* 2D Image Section */}
      <div className="image-list-section">
        <div className="image-list-section-header">2D Images</div>
        <div className="image-list">
          {images2d.length === 0 ? (
            <div className="image-list-section-empty">No 2D images</div>
          ) : (
            images2d.map((image) => (
              <div
                key={image.filename}
                className={`image-list-item ${
                  selectedFilename2d === image.filename ? 'selected' : ''
                }`}
                onClick={() => handleImageClick2d(image)}
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
