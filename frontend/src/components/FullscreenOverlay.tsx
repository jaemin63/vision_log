import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../services/api';
import type { ImageMetadata } from '../types/image';
import './FullscreenOverlay.css';

interface FullscreenOverlayProps {
  imageFilename: string | null;
  onClose: () => void;
  allowClose?: boolean; // Allow closing overlay (default: true)
  allImages?: ImageMetadata[]; // All images for navigation
  onImageChange?: (filename: string) => void; // Callback when image changes
}

export function FullscreenOverlay({
  imageFilename,
  onClose,
  allowClose = true,
  allImages = [],
  onImageChange,
}: FullscreenOverlayProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (imageFilename) {
      setImageError(false);
      setImageLoading(true);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Set timeout to detect if image fails to load
      timeoutRef.current = setTimeout(() => {
        console.warn('Image load timeout:', imageFilename);
        setImageError(true);
        setImageLoading(false);
      }, 10000); // 10 second timeout
      
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }
  }, [imageFilename]);

  // Navigation functions
  const getCurrentImageIndex = useCallback(() => {
    if (!imageFilename || allImages.length === 0) return -1;
    return allImages.findIndex((img) => img.filename === imageFilename);
  }, [imageFilename, allImages]);

  const handlePreviousImage = useCallback(() => {
    if (!imageFilename || allImages.length === 0) return;
    const currentIndex = allImages.findIndex((img) => img.filename === imageFilename);
    if (currentIndex > 0) {
      const previousImage = allImages[currentIndex - 1];
      onImageChange?.(previousImage.filename);
    }
  }, [imageFilename, allImages, onImageChange]);

  const handleNextImage = useCallback(() => {
    if (!imageFilename || allImages.length === 0) return;
    const currentIndex = allImages.findIndex((img) => img.filename === imageFilename);
    if (currentIndex >= 0 && currentIndex < allImages.length - 1) {
      const nextImage = allImages[currentIndex + 1];
      onImageChange?.(nextImage.filename);
    }
  }, [imageFilename, allImages, onImageChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && allowClose) {
        onClose();
      } else if (event.key === 'ArrowLeft') {
        handlePreviousImage();
      } else if (event.key === 'ArrowRight') {
        handleNextImage();
      }
    };

    if (imageFilename) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent body scroll when overlay is open
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [imageFilename, onClose, allowClose, handlePreviousImage, handleNextImage]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Clear timeout when image loads successfully
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const img = e.currentTarget;
    console.log('Image loaded successfully:', {
      filename: imageFilename,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      complete: img.complete,
    });
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    // Clear timeout when image fails
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setImageLoading(false);
    setImageError(true);
  };

  // Calculate image URL (before early return to maintain hook order)
  const imageUrl = imageFilename ? api.getImageUrl(imageFilename) : '';

  // Debug: Log image URL (must be before early return)
  useEffect(() => {
    if (imageFilename) {
      console.log('Loading image:', imageFilename);
      console.log('Image URL:', imageUrl);
    }
  }, [imageFilename, imageUrl]);

  // Early return after all hooks
  if (!imageFilename) {
    return null;
  }

  const currentIndex = getCurrentImageIndex();
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < allImages.length - 1;

  return (
    <div
      className="fullscreen-overlay"
      onClick={onClose}
      style={{ cursor: 'pointer' }}
    >
      <div className="fullscreen-overlay-content" onClick={(e) => e.stopPropagation()}>
        {/* Previous Image Button */}
        {hasPrevious && (
          <button
            className="fullscreen-nav-button fullscreen-nav-prev"
            onClick={(e) => {
              e.stopPropagation();
              handlePreviousImage();
            }}
            title="Previous image (←)"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}

        {/* Always render image so browser can load it */}
        <img
          key={imageFilename} // Force re-render when filename changes
          src={imageUrl}
          alt={imageFilename || ''}
          onLoad={handleImageLoad}
          onError={(e) => {
            console.error('Image load error:', e);
            console.error('Failed URL:', imageUrl);
            console.error('Failed filename:', imageFilename);
            handleImageError();
          }}
          className={`fullscreen-overlay-img ${imageLoading ? 'loading' : ''}`}
          loading="eager"
        />

        {/* Next Image Button */}
        {hasNext && (
          <button
            className="fullscreen-nav-button fullscreen-nav-next"
            onClick={(e) => {
              e.stopPropagation();
              handleNextImage();
            }}
            title="Next image (→)"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}

        {/* Show loading overlay */}
        {imageLoading && !imageError && (
          <div className="fullscreen-overlay-loading">
            <p>Loading image...</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.6 }}>
              {imageFilename}
            </p>
          </div>
        )}
        {/* Show error overlay */}
        {imageError && (
          <div className="fullscreen-overlay-error">
            <p>Failed to load image</p>
            <p className="error-filename">{imageFilename}</p>
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', opacity: 0.6 }}>
              URL: {imageUrl}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
