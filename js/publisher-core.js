/**
 * publisher-core.js - Core publishing logic using Millicast SDK.
 * Manages a SINGLE publisher instance and WebSocket connection.
 * Fixes the duplicate WebSocket bug from the original publisher_multi.js.
 */

import MediaManager from './media-manager.js';
import { config } from './config.js';

const Director = millicast.Director;
const Publish = millicast.Publish;

let publisherInstance = null;
let mediaManager = null;
let _isBroadcasting = false;

/** Event listeners registered by other modules */
const broadcastListeners = [];

/**
 * Initialize the publisher (called once on page load).
 * Creates a single MediaManager and Publish instance.
 */
async function initPublisher() {
  mediaManager = new MediaManager({
    audio: !config.disableAudio ? {
      echoCancellation: true,
      channelCount: { ideal: 6 },
      sampleRate: 48000,
    } : false,
    video: !config.disableVideo ? {
      height: { min: 180, ideal: config.resolution, max: 2160 },
      aspectRatio: config.aspect,
      frameRate: config.fps,
    } : false,
  });

  // Build the token generator (single function, no duplicate instances)
  const tokenGenerator = () => {
    const sourceIdInput = document.getElementById('sourceId');
    const sourceIdValue = sourceIdInput?.value.trim() || '';
    const validatedSourceId = (sourceIdValue && sourceIdValue !== 'SourceId') ? sourceIdValue : '';
    return Director.getPublisher(config.publishToken, config.streamName, validatedSourceId);
  };

  // Create ONE Publish instance - this is the single WebSocket connection
  publisherInstance = new Publish(config.streamName, tokenGenerator, true);

  // Set up broadcast event forwarding
  publisherInstance.on('broadcastEvent', (event) => {
    _handleBroadcastEvent(event);
  });

  return { publisherInstance, mediaManager };
}

/**
 * Get the current media stream from the media manager.
 */
async function getMediaStream() {
  return mediaManager.getMedia();
}

/**
 * Connect and start broadcasting.
 * Uses the single publisher instance - no duplicate connections.
 */
async function startBroadcast(options = {}) {
  if (!publisherInstance) {
    throw new Error('Publisher not initialized. Call initPublisher() first.');
  }

  const activeStream = options.mediaStream;
  if (!activeStream) {
    throw new Error('No active media stream available for broadcasting.');
  }

  const sourceIdInput = document.getElementById('sourceId');
  let srcVal = sourceIdInput?.value.trim() || '';
  if (srcVal === 'SourceId') srcVal = '';

  const codec = options.codec || config.codec;
  const simulcast = options.simulcast !== undefined ? options.simulcast : config.simulcast;
  const bandwidth = options.bandwidth || config.bandwidth || 2500;

  try {
    await publisherInstance.connect({
      codec,
      simulcast,
      sourceId: srcVal,
      bandwidth,
      mediaStream: activeStream,
      events: ['active', 'inactive', 'viewercount', 'stopped'],
    });

    _isBroadcasting = true;
    console.log(`Broadcast started: ${config.streamName}`);

    // Replace video track to ensure it's active
    const vTracks = activeStream.getVideoTracks();
    if (vTracks.length && publisherInstance.webRTCPeer) {
      await publisherInstance.webRTCPeer.replaceTrack(vTracks[0]);
    }

    return true;
  } catch (err) {
    console.error('Broadcast failed:', err);
    _isBroadcasting = false;
    _notifyListeners({ name: 'publishStop', data: {} });
    return false;
  }
}

/**
 * Stop the current broadcast.
 */
function stopBroadcast() {
  if (publisherInstance) {
    try {
      publisherInstance.stop();
    } catch (e) {
      console.warn('Error stopping publisher:', e);
    }
  }
  _isBroadcasting = false;
}

/** Check if currently broadcasting */
function isBroadcasting() {
  return _isBroadcasting;
}

/** Set broadcasting state (used by UI/broadcast handler) */
function setBroadcasting(val) {
  _isBroadcasting = val;
}

/** Get the publisher instance */
function getPublisher() {
  return publisherInstance;
}

/** Get the media manager */
function getMediaManager() {
  return mediaManager;
}

/** Get the WebRTC peer connection */
function getPeerConnection() {
  return publisherInstance?.webRTCPeer || null;
}

/** Register a broadcast event listener */
function onBroadcast(callback) {
  broadcastListeners.push(callback);
}

/** Internal: handle broadcast events and forward to listeners */
function _handleBroadcastEvent(event) {
  const { name, data } = event;

  switch (name) {
    case 'active':
      _notifyListeners({ name: 'publishStart', data });
      break;
    case 'inactive':
    case 'stopped':
      _notifyListeners({ name: 'publishStop', data });
      break;
    case 'viewercount':
      _notifyListeners({ name: 'viewercount', data });
      break;
  }
}

function _notifyListeners(event) {
  broadcastListeners.forEach(cb => {
    try { cb(event); } catch (e) { console.error('Broadcast listener error:', e); }
  });
}

/**
 * Replace a track on the live WebRTC connection.
 */
async function replaceTrack(track) {
  if (!publisherInstance?.webRTCPeer) return;
  try {
    await publisherInstance.webRTCPeer.replaceTrack(track);
  } catch (e) {
    console.warn('replaceTrack failed:', e);
  }
}

/**
 * Update the media stream on both manager and live connection.
 */
async function updateMediaStream(type, deviceId) {
  if (!mediaManager) return null;

  let stream;
  if (type === 'audio') {
    stream = await mediaManager.changeAudio(deviceId);
  } else if (type === 'video') {
    stream = await mediaManager.changeVideo(deviceId);
  } else {
    throw new Error(`Invalid type: ${type}`);
  }

  // If broadcasting, replace the track live
  if (_isBroadcasting && publisherInstance?.webRTCPeer) {
    const tracks = type === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks();
    if (tracks[0]) {
      await publisherInstance.webRTCPeer.replaceTrack(tracks[0]);
    }
  }

  return stream;
}

export {
  initPublisher,
  getMediaStream,
  startBroadcast,
  stopBroadcast,
  isBroadcasting,
  setBroadcasting,
  getPublisher,
  getMediaManager,
  getPeerConnection,
  onBroadcast,
  replaceTrack,
  updateMediaStream,
};
