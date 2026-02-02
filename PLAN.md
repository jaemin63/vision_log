# Image Logger - Project Plan

## 1. OVERALL PLAN

### System Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Robot PC      │         │   NestJS Backend │         │  React Frontend │
│                 │         │                  │         │                 │
│  Image Files    │────────▶│  Image Service   │────────▶│  Image List     │
│  (Local Dir)    │  Poll   │  File Watcher    │  HTTP   │  Image Preview  │
│                 │         │  REST API        │         │  Fullscreen     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                      │
                                      │ WebSocket (Future)
                                      │ Event Notifications
                                      ▼
                            ┌──────────────────┐
                            │  Modbus/TCP      │
                            │  Polling Service │
                            │  (Future)        │
                            └──────────────────┘
```

### Image Flow

**Current Phase (Phase 1):**
1. **Backend**: NestJS service scans a local directory for image files
2. **Backend**: Returns list of images with metadata (filename, timestamp)
3. **Backend**: Serves image files via HTTP static endpoint
4. **Frontend**: Fetches image list on mount
5. **Frontend**: Displays list in left panel
6. **Frontend**: User clicks image → preview in right panel
7. **Frontend**: Event-based fullscreen overlay (triggered by future WebSocket events)

**Future Phase (Phase 2+):**
1. **Backend**: Modbus/TCP client connects to Robot PC (server)
2. **Backend**: Polls specific Modbus registers/signals periodically
3. **Backend**: When condition is met → fetches image file from Robot PC folder (network share/SMB)
4. **Backend**: Downloads image to local directory or serves directly
5. **Backend**: WebSocket emits "new image event" to frontend
6. **Frontend**: Receives event → automatically opens fullscreen overlay
7. **Frontend**: Next event replaces current fullscreen image

### Fullscreen Image Overlay Events

**Behavior:**
- Fullscreen overlay is triggered by events (initially manual for testing, later via WebSocket)
- No close button visible
- ESC key closes the overlay
- When a new event arrives, it automatically replaces the current fullscreen image
- Overlay covers entire viewport with dark background
- Image is centered and scaled to fit viewport while maintaining aspect ratio

**Event Flow:**
```
Event Trigger → Frontend receives event → Check if overlay is open
    ├─ Overlay closed → Open overlay with new image
    └─ Overlay open → Replace current image (no close/reopen animation)
```

---

## 2. IMPLEMENTATION STEPS

### Step 1: Backend Foundation
**Goal**: Set up NestJS project with basic structure
**Output**: 
- NestJS project initialized with TypeScript
- Basic module structure (AppModule, ImageModule)
- Health check endpoint
- Project runs on port 3000

**What to test**: `GET http://localhost:3000/health` returns OK

---

### Step 2: Image Directory Service
**Goal**: Create service to scan and list image files from local directory
**Output**:
- `ImageService` that reads files from a configurable directory
- Returns array of `{ filename: string, timestamp: Date }`
- Filters for image file extensions (.jpg, .jpeg, .png, .gif, .bmp, .webp)
- Sorts by timestamp (newest first)

**What to test**: Service returns correct file list from test directory

---

### Step 3: Image List API Endpoint
**Goal**: Expose REST endpoint to get image list
**Output**:
- `GET /api/images` endpoint
- Returns JSON array of image metadata
- Error handling for missing/invalid directory

**What to test**: `GET http://localhost:3000/api/images` returns image list

---

### Step 4: Image File Serving
**Goal**: Serve image files via HTTP
**Output**:
- Static file serving for image directory
- `GET /api/images/:filename` endpoint
- Proper MIME types and headers
- Security: only serves files from configured directory

**What to test**: `GET http://localhost:3000/api/images/image.jpg` returns image

---

### Step 5: Frontend Foundation
**Goal**: Set up React project with TypeScript and basic structure
**Output**:
- React + TypeScript project (Vite or Create React App)
- Dark theme CSS setup
- Basic layout structure (left panel + right panel)
- API client utility for backend communication

**What to test**: Frontend runs on port 3001, displays dark theme layout

---

### Step 6: Image List Component
**Goal**: Display list of images in left panel
**Output**:
- Left panel component showing image list
- Fetches data from `/api/images` on mount
- Displays filename and formatted timestamp
- Click handler on each item (stores selected image)

**What to test**: Left panel shows image list, clicking items works

---

### Step 7: Image Preview Component
**Goal**: Display selected image in right panel
**Output**:
- Right panel component showing image preview
- Displays image from `/api/images/:filename`
- Shows loading state while fetching
- Handles image load errors

**What to test**: Clicking image in left panel shows preview in right panel

---

### Step 8: Fullscreen Overlay Component
**Goal**: Create fullscreen overlay for event images
**Output**:
- Fullscreen overlay component (covers entire viewport)
- Dark background with centered image
- ESC key handler to close overlay
- State management for overlay visibility
- Image scaling (fit viewport, maintain aspect ratio)

**What to test**: Manual trigger opens overlay, ESC closes it, image displays correctly

---

### Step 9: Event System Integration
**Goal**: Connect event system to fullscreen overlay
**Output**:
- Event handler that triggers fullscreen overlay
- Logic to replace current image when new event arrives
- Manual trigger button for testing (remove in production)
- Proper state management (overlay state + current image)

**What to test**: Triggering event opens overlay, new event replaces image

---

### Step 10: Code Structure for Future Modbus/TCP
**Goal**: Prepare architecture for Modbus/TCP integration
**Output**:
- Service interface/abstract class for polling service
- Event emitter pattern for image events
- WebSocket gateway structure (commented/stubbed)
- Documentation on integration points

**What to test**: Code structure allows easy addition of Modbus/TCP service

---

## 3. TECHNOLOGY & DESIGN DECISIONS

### Why NestJS + React?

**NestJS (Backend):**
- **Modular Architecture**: Perfect for adding Modbus/TCP service later as a separate module
- **TypeScript**: Type safety across the stack
- **Dependency Injection**: Clean separation of concerns
- **Built-in WebSocket Support**: Ready for real-time event notifications
- **Enterprise-Ready**: Suitable for industrial applications
- **File System APIs**: Native Node.js support for directory scanning

**React (Frontend):**
- **Component-Based**: Perfect for panel-based UI (list, preview, overlay)
- **State Management**: React hooks for managing overlay state and image selection
- **TypeScript**: Type safety and better developer experience
- **Modern Tooling**: Vite for fast development
- **Event Handling**: Native keyboard events for ESC key

### How Images Are Served

**Approach**: Hybrid static + API serving
- **Static Files**: Use NestJS `ServeStaticModule` for efficient file serving
- **API Endpoint**: `/api/images/:filename` for controlled access
- **Security**: Only serve files from configured directory (path validation)
- **Caching**: HTTP cache headers for performance
- **MIME Types**: Proper content-type headers for each image format

**Directory Structure**:
```
backend/
  src/
    images/          # Watched directory (configurable)
      image1.jpg
      image2.png
      ...
```

### How Future Modbus/TCP Polling Will Be Integrated

**Architecture Pattern**: Client Service + Event Emitter

**Key Points**:
- **Robot PC**: Modbus/TCP **Server** (listens on port, exposes registers)
- **Our Backend**: Modbus/TCP **Client** (connects to robot, polls registers)
- **Polling**: Periodically reads specific register(s) to check condition
- **Image Fetching**: When condition met → fetch image from Robot PC folder (via SMB/network share)

```
ImageEventService (Abstract/Interface)
    │
    ├─ MockImageEventService (Current - for testing)
    │   └─ Manual trigger or file watcher
    │
    └─ ModbusImageEventService (Future)
        ├─ Modbus/TCP Client (connects to Robot PC server)
        ├─ Polls specific register(s) (e.g., register 1001)
        ├─ Condition check (e.g., register value == 1)
        ├─ On condition met:
        │   ├─ Fetch image from Robot PC folder (\\robot-pc\images\image.jpg)
        │   ├─ Download to local directory or cache
        │   └─ Emit 'image-event' → WebSocket → Frontend
        └─ Continue polling
```

**Integration Points**:
1. **Service Layer**: `ImageEventService` interface in `ImageModule`
2. **Modbus Client**: Use library like `modbus-serial` or `jsmodbus` (Node.js)
3. **Network Share**: Use `smb2` or Windows network share access for image fetching
4. **Event Emitter**: NestJS `EventEmitter2` for internal events
5. **WebSocket Gateway**: `ImageEventsGateway` for frontend communication
6. **Dependency Injection**: Swap mock service for real service via config

**Configuration (Future)**:
- `MODBUS_HOST`: Robot PC IP address
- `MODBUS_PORT`: Modbus/TCP port (default: 502)
- `MODBUS_REGISTER`: Register address to poll
- `MODBUS_CONDITION_VALUE`: Value that triggers image fetch
- `ROBOT_IMAGE_PATH`: Network path to Robot PC image folder (e.g., `\\192.168.1.100\images`)
- `POLL_INTERVAL_MS`: Polling interval in milliseconds

### How Frontend Will React to "New Image Event"

**Current (Step 9)**: Manual trigger for testing
**Future (Phase 2)**: WebSocket connection

**Flow**:
1. Frontend establishes WebSocket connection on mount
2. Backend emits `{ type: 'image-event', filename: 'image.jpg' }` on event
3. Frontend receives event → updates overlay state
4. If overlay closed → open with new image
5. If overlay open → replace current image (smooth transition)

**State Management**:
```typescript
interface OverlayState {
  isOpen: boolean;
  currentImage: string | null;
  eventQueue: string[]; // For handling rapid events
}
```

**Event Handling**:
- Single source of truth: WebSocket event stream
- Debounce/throttle if events arrive too rapidly
- Error handling: Reconnect on connection loss

---

## 4. PROJECT STRUCTURE

```
image_logger/
├── backend/
│   ├── src/
│   │   ├── app.module.ts
│   │   ├── main.ts
│   │   └── image/
│   │       ├── image.module.ts
│   │       ├── image.controller.ts
│   │       ├── image.service.ts
│   │       └── dto/
│   │           └── image-metadata.dto.ts
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── ImageList.tsx
│   │   │   ├── ImagePreview.tsx
│   │   │   └── FullscreenOverlay.tsx
│   │   ├── services/
│   │   │   └── api.ts
│   │   └── types/
│   │       └── image.ts
│   ├── package.json
│   └── vite.config.ts (or similar)
│
└── PLAN.md (this file)
```

---

## 5. CONFIGURATION

**Backend Environment Variables**:
- `IMAGE_DIRECTORY`: Path to image directory (default: `./images`)
- `PORT`: Server port (default: 3000)
- `CORS_ORIGIN`: Frontend URL (default: `http://localhost:3001`)

**Frontend Environment Variables**:
- `VITE_API_URL`: Backend API URL (default: `http://localhost:3000`)

---

## 6. TESTING STRATEGY

**Backend**:
- Unit tests for `ImageService` (file scanning logic)
- Integration tests for API endpoints
- Manual testing with sample images

**Frontend**:
- Component tests for UI interactions
- Manual testing of fullscreen overlay
- Manual testing of event triggers

---

## READY FOR IMPLEMENTATION

This plan provides:
- ✅ Clear architecture overview
- ✅ Step-by-step implementation guide
- ✅ Technology justifications
- ✅ Future integration points
- ✅ Project structure

**Next Action**: Wait for user confirmation, then proceed with Step 1 when instructed.
