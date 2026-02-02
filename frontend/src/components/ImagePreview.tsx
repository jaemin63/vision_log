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
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (image) {
      setImageError(false);
      setImageLoading(true);
      // Reset zoom and pan when image changes
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [image]);

  // Constrain pan to keep image within bounds
  const constrainPan = useCallback((panX: number, panY: number, currentZoom: number) => {
    if (!imageRef.current || !containerRef.current) return { x: panX, y: panY };
    
    const container = containerRef.current;
    const img = imageRef.current;
    
    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const containerHeight = containerRect.height;
    
    // Get image natural dimensions
    const imgNaturalWidth = img.naturalWidth;
    const imgNaturalHeight = img.naturalHeight;
    
    // Calculate displayed image size
    const imgDisplayWidth = imgNaturalWidth * currentZoom;
    const imgDisplayHeight = imgNaturalHeight * currentZoom;
    
    // Calculate bounds
    const minX = Math.min(0, containerWidth - imgDisplayWidth);
    const maxX = 0;
    const minY = Math.min(0, containerHeight - imgDisplayHeight);
    const maxY = 0;
    
    return {
      x: Math.max(minX, Math.min(maxX, panX)),
      y: Math.max(minY, Math.min(maxY, panY)),
    };
  }, []);

  // Handle wheel zoom with passive: false - zoom towards mouse cursor
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !image) return;

    const handleWheel = (e: WheelEvent) => {
      if (!imageRef.current || !container) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      
      // Get current zoom and pan using functional updates
      setZoom((currentZoom) => {
        const newZoom = Math.max(0.5, Math.min(5, currentZoom + delta));
        
        // Get container bounds
        const containerRect = container.getBoundingClientRect();
        
        // Get mouse position relative to container
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;
        
        // Get current pan
        setPan((currentPan) => {
          // Calculate the point on the image that the mouse is pointing at
          // This is in the image's coordinate system before zoom
          const imageX = (mouseX - currentPan.x) / currentZoom;
          const imageY = (mouseY - currentPan.y) / currentZoom;
          
          // After zoom, we want this same point to be under the mouse
          // So we adjust the pan
          const newPanX = mouseX - imageX * newZoom;
          const newPanY = mouseY - imageY * newZoom;
          
          // Constrain pan to keep image visible
          const constrained = constrainPan(newPanX, newPanY, newZoom);
          return constrained;
        });
        
        return newZoom;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [image, constrainPan]);

  // Handle mouse drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return; // Only allow drag when zoomed in
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  }, [zoom, pan]);

  // Handle mouse drag - use global mouse move
  useEffect(() => {
    if (!isDragging || zoom <= 1) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newPanX = e.clientX - dragStart.x;
      const newPanY = e.clientY - dragStart.y;
      
      // Constrain pan to keep image visible
      const constrained = constrainPan(newPanX, newPanY, zoom);
      setPan(constrained);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStart, zoom, constrainPan]);

  // Handle mouse drag end - now handled in useEffect

  // Handle touch start (for mobile swipe)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (zoom <= 1) return;
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - pan.x, y: touch.clientY - pan.y });
    }
  }, [zoom, pan]);

  // Handle touch move (for mobile swipe)
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || zoom <= 1 || e.touches.length !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    setPan({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  }, [isDragging, dragStart, zoom]);

  // Handle touch end
  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Reset zoom and pan
  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Constrain pan when zoom changes (e.g., from button clicks)
  useEffect(() => {
    if (zoom <= 1) {
      setPan({ x: 0, y: 0 });
      return;
    }
    
    setPan((currentPan) => {
      return constrainPan(currentPan.x, currentPan.y, zoom);
    });
  }, [zoom, constrainPan]);

  // Zoom in
  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(5, prev + 0.25));
  }, []);

  // Zoom out
  const handleZoomOut = useCallback(() => {
    setZoom((prev) => {
      const newZoom = Math.max(0.5, prev - 0.25);
      if (newZoom <= 1) {
        setPan({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

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
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
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
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            className={`image-preview-img ${imageLoading ? 'loading' : ''}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'top left',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            }}
            draggable={false}
          />
        )}
        
        {/* Zoom Controls */}
        {!imageLoading && !imageError && (
          <div className="image-preview-zoom-controls">
            <button
              className="zoom-button"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              title="Zoom Out"
            >
              −
            </button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button
              className="zoom-button"
              onClick={handleZoomIn}
              disabled={zoom >= 5}
              title="Zoom In"
            >
              +
            </button>
            {zoom > 1 && (
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
