import { useEffect, useState, useRef, useCallback } from 'react';
import type { ImageMetadata } from '../types/image';
import { api } from '../services/api';
import './ImagePreview.css';

interface ImagePreviewProps {
  image: ImageMetadata | null;
  onFullscreenClick?: () => void;
}

export function ImagePreview({ image, onFullscreenClick }: ImagePreviewProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate the scale that fits the image within the container
  const calculateFitScale = useCallback(() => {
    if (!imageRef.current || !containerRef.current) return 1;
    const img = imageRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    if (img.naturalWidth === 0 || img.naturalHeight === 0) return 1;
    const scaleX = rect.width / img.naturalWidth;
    const scaleY = rect.height / img.naturalHeight;
    return Math.min(scaleX, scaleY, 1);
  }, []);

  // Calculate pan values that center the image at a given scale
  const calculateCenteredPan = useCallback((s: number) => {
    if (!imageRef.current || !containerRef.current) return { x: 0, y: 0 };
    const img = imageRef.current;
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (rect.width - img.naturalWidth * s) / 2,
      y: (rect.height - img.naturalHeight * s) / 2,
    };
  }, []);

  // Reset state when image changes
  useEffect(() => {
    if (image) {
      setImageError(false);
      setImageLoading(true);
      setScale(1);
      setPan({ x: 0, y: 0 });
      setFitScale(1);
    }
  }, [image]);

  // Fit and center when image finishes loading
  useEffect(() => {
    if (!imageLoading && imageRef.current && containerRef.current) {
      const fs = calculateFitScale();
      setFitScale(fs);
      setScale(fs);
      setPan(calculateCenteredPan(fs));
    }
  }, [imageLoading, calculateFitScale, calculateCenteredPan]);

  // Wheel zoom toward mouse cursor position
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !image || imageLoading) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;

      setScale((prev) => {
        const next = Math.max(fitScale * 0.5, Math.min(10, prev * zoomFactor));
        const ratio = next / prev;
        setPan((p) => ({
          x: mouseX - (mouseX - p.x) * ratio,
          y: mouseY - (mouseY - p.y) * ratio,
        }));
        return next;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [image, imageLoading, fitScale]);

  // Mouse drag - start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Mouse drag - move & release (global listeners)
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const dx = e.clientX - lastPointerRef.current.x;
      const dy = e.clientY - lastPointerRef.current.y;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Touch drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    setIsDragging(true);
    lastPointerRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - lastPointerRef.current.x;
    const dy = t.clientY - lastPointerRef.current.y;
    lastPointerRef.current = { x: t.clientX, y: t.clientY };
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => setIsDragging(false), []);

  // Reset to fit view
  const handleReset = useCallback(() => {
    setScale(fitScale);
    setPan(calculateCenteredPan(fitScale));
  }, [fitScale, calculateCenteredPan]);

  // Zoom toward container center (for +/- buttons)
  const zoomToCenter = useCallback((factor: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    setScale((prev) => {
      const next = Math.max(fitScale * 0.5, Math.min(10, prev * factor));
      const ratio = next / prev;
      setPan((p) => ({
        x: cx - (cx - p.x) * ratio,
        y: cy - (cy - p.y) * ratio,
      }));
      return next;
    });
  }, [fitScale]);

  const handleZoomIn = useCallback(() => zoomToCenter(1.25), [zoomToCenter]);
  const handleZoomOut = useCallback(() => zoomToCenter(1 / 1.25), [zoomToCenter]);

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const formatTimestamp = (timestamp: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(timestamp);
  };

  if (!image) {
    return (
      <div className="image-preview-empty">
        <p>Select an image to preview</p>
      </div>
    );
  }

  const imageUrl = api.getImageUrl(image.filename);
  const zoomPercent = Math.round(scale * 100);

  return (
    <div className="image-preview">
      <div className="image-preview-header">
        <div className="image-preview-filename">{image.filename}</div>
        <div className="image-preview-timestamp">
          {formatTimestamp(image.timestamp)}
        </div>
      </div>
      <div
        ref={containerRef}
        className="image-preview-container"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        {imageLoading && (
          <div className="image-preview-loading">
            <p>Loading image...</p>
          </div>
        )}
        {imageError ? (
          <div className="image-preview-error">
            <p>Failed to load image</p>
            <p className="error-details">{image.filename}</p>
          </div>
        ) : (
          <img
            ref={imageRef}
            src={imageUrl}
            alt={image.filename}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className={`image-preview-img ${imageLoading ? 'loading' : ''}`}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: '0 0',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
            draggable={false}
          />
        )}

        {/* Zoom Controls - stopPropagation on mousedown to prevent drag */}
        {!imageLoading && !imageError && (
          <div
            className="image-preview-zoom-controls"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              className="zoom-button"
              onClick={handleZoomOut}
              disabled={scale <= fitScale * 0.5}
              title="Zoom Out"
            >
              −
            </button>
            <span className="zoom-level">{zoomPercent}%</span>
            <button
              className="zoom-button"
              onClick={handleZoomIn}
              disabled={scale >= 10}
              title="Zoom In"
            >
              +
            </button>
            {Math.abs(scale - fitScale) > 0.01 && (
              <button
                className="zoom-reset-button"
                onClick={handleReset}
                title="Reset Zoom"
              >
                Reset
              </button>
            )}
            {onFullscreenClick && (
              <button
                className="zoom-fullscreen-button"
                onClick={onFullscreenClick}
                title="Open in fullscreen"
              >
                Fullscreen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
