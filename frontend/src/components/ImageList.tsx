import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { ImageMetadata } from '../types/image';
import './ImageList.css';

interface ImageListProps {
  onImageSelect: (image: ImageMetadata | null) => void;
  onImagesLoaded?: (images: ImageMetadata[]) => void;
}

export function ImageList({ onImageSelect, onImagesLoaded }: ImageListProps) {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      setLoading(true);
      setError(null);
      const imageList = await api.getImages();
      setImages(imageList);
      onImagesLoaded?.(imageList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load images');
      console.error('Error loading images:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (image: ImageMetadata) => {
    setSelectedFilename(image.filename);
    onImageSelect(image);
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

  if (images.length === 0) {
    return (
      <div className="image-list-empty">
        <p>No images found</p>
        <button onClick={loadImages} className="retry-button">
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="image-list">
      {images.map((image) => (
        <div
          key={image.filename}
          className={`image-list-item ${
            selectedFilename === image.filename ? 'selected' : ''
          }`}
          onClick={() => handleImageClick(image)}
        >
          <div className="image-list-item-filename">{image.filename}</div>
          <div className="image-list-item-timestamp">
            {formatTimestamp(image.timestamp)}
          </div>
        </div>
      ))}
    </div>
  );
}
