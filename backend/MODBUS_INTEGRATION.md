# Modbus/TCP Integration Guide

This document describes how to integrate Modbus/TCP polling for image events.

## Architecture Overview

```
Robot PC (Modbus/TCP Server)
    ↓ (Polling)
ModbusImageEventService (Client)
    ↓ (EventEmitter)
ImageEventsGateway (WebSocket)
    ↓ (WebSocket)
Frontend (React)
```

## Current Implementation

- **MockImageEventService**: Used for development/testing
- **ModbusImageEventService**: Stub implementation ready for Modbus/TCP integration
- **ImageEventsGateway**: WebSocket gateway for real-time events

## Integration Steps

### 1. Install Modbus Library

```bash
npm install modbus-serial
# or
npm install jsmodbus
```

### 2. Configure Environment Variables

Add to `.env`:

```env
MODBUS_ENABLED=true
MODBUS_HOST=192.168.1.100
MODBUS_PORT=502
MODBUS_REGISTER=1001
MODBUS_CONDITION_VALUE=1
ROBOT_IMAGE_PATH=\\192.168.1.100\images
POLL_INTERVAL_MS=1000
```

### 3. Implement ModbusImageEventService

Edit `backend/src/image/services/modbus-image-event.service.ts`:

1. Import Modbus library
2. Implement `connectToModbusServer()` method
3. Implement `startPolling()` method
4. Implement `fetchImageFromRobotPC()` method
5. Handle connection errors and reconnection

### 4. Switch to Modbus Service

The service is automatically selected when `MODBUS_ENABLED=true` is set.

Alternatively, manually change in `image.module.ts`:

```typescript
{
  provide: 'ImageEventService',
  useClass: ModbusImageEventService, // Change from MockImageEventService
}
```

### 5. Test Integration

1. Start backend: `npm run start:dev`
2. Check service status: `GET http://localhost:3000/api/events/status`
3. Monitor logs for Modbus connection and polling
4. Test with frontend WebSocket connection

## Image Fetching from Robot PC

When Modbus condition is met, the service should:

1. **Access Robot PC folder**: Use SMB/network share or file copy
2. **Get latest image**: List files, sort by timestamp, get newest
3. **Copy to local**: Download/copy image to `IMAGE_DIRECTORY`
4. **Emit event**: Trigger `image.event` via EventEmitter

### Network Share Access

For Windows network shares:

```typescript
// Option 1: Use SMB2 library
import SMB2 from 'smb2';
const smb2Client = new SMB2({
  share: '\\\\192.168.1.100\\images',
  domain: 'WORKGROUP',
  username: 'user',
  password: 'pass',
});

// Option 2: Use Windows file system (if running on Windows)
import { promises as fs } from 'fs';
const files = await fs.readdir('\\\\192.168.1.100\\images');
```

## WebSocket Connection

Frontend connects to: `ws://localhost:3000/events`

Event format:
```json
{
  "type": "image-event",
  "filename": "image.jpg",
  "timestamp": "2024-02-02T10:30:00.000Z"
}
```

## Testing

### Manual Event Trigger (Mock Service)

```bash
POST http://localhost:3000/api/events/trigger
Content-Type: application/json

{
  "filename": "test.jpg"
}
```

### Check Service Status

```bash
GET http://localhost:3000/api/events/status
```

## Troubleshooting

1. **Modbus connection fails**: Check IP, port, and network connectivity
2. **Image fetch fails**: Verify network share path and permissions
3. **Events not received**: Check WebSocket connection in frontend
4. **Service not starting**: Check environment variables and logs

## Future Enhancements

- Automatic reconnection on Modbus disconnect
- Image caching to avoid duplicate downloads
- Event history/logging
- Multiple Modbus device support
- Configurable polling strategies
