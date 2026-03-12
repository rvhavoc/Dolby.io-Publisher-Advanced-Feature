# Dolby.io Publisher - Advanced Feature

A modular, feature-rich real-time streaming publisher built on the [Dolby.io / Millicast](https://dolby.io/) SDK.

## Features

- **Modular Architecture** - Clean separation of concerns across 9 focused JavaScript modules (replaces monolithic `publisher_multi.js`)
- **Recording Detection** - Automatically detects recording capability from the publishing token on page load and shows record controls
- **Live Stats Overlay** - Real-time WebRTC stats display including packet loss, available bandwidth, jitter, RTT, and bitrates
- **Ambisonic / Spatial Audio** - Multi-channel Opus (multiopus) support for First, Second, and Third Order Ambisonics plus 5.1 surround
- **Single WebSocket Connection** - Fixes duplicate WebSocket bug from original publisher
- **Screen Sharing** - Multiple modes: screen-only, screen+camera composite, camera+screen PiP, dual camera
- **Adaptive Media Controls** - Bitrate, codec, FPS, aspect ratio, resolution, and simulcast controls

## Module Structure

```
js/
  config.js          - URL parameters, stream configuration, constants
  media-manager.js   - Device enumeration, getUserMedia, source switching
  publisher-core.js  - Single Publish instance, WebSocket management
  screen-share.js    - Screen sharing modes with canvas compositing
  media-controls.js  - Bitrate, codec, FPS, resolution, simulcast
  stats.js           - WebRTC stats collection and overlay display
  recording.js       - Recording detection and control
  ambisonic.js       - Ambisonic/multiopus SDP munging and configuration
  ui.js              - UI wiring, device dropdowns, broadcast handler
  main.js            - Entry point, initializes all modules
```

## Usage

1. Open `index.html` in a browser (or serve via any static file server)
2. Enter your **Stream ID** (`accountId/streamName`) and **Publishing Token**
3. Click **Apply** to configure
4. Click **Go Live** to start broadcasting
5. Use the **Settings cog** to adjust bitrate, codec, FPS, resolution, simulcast, and spatial audio
6. Click **Stats** to toggle the live stats overlay

### URL Parameters

You can pre-configure via URL:
```
?streamId=accountId/streamName&token=yourPublishToken
```

## Dependencies

- [Millicast SDK](https://cdn.jsdelivr.net/npm/@millicast/sdk@latest/dist/millicast.umd.js) (loaded via CDN)
- [Bootstrap 4.1.3](https://getbootstrap.com/) (loaded via CDN)
- [FontAwesome 5.3.1](https://fontawesome.com/) (loaded via CDN)

No build step required - pure vanilla JavaScript with ES modules.

## Based On

- Original publisher: [Dolby.io-Advanced-Publisher](https://github.com/rnkvogel/Dolby.io-Advanced-Publisher)
- Stats implementation ported from: [react-multisource-dolbyio-publisher](https://github.com/rvhavoc/react-multisource-dolbyio-publisher)
