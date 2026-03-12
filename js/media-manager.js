/**
 * media-manager.js - Device enumeration and media stream management.
 * Handles getUserMedia, device listing, source switching, and mute controls.
 */

class MediaManager {
  constructor(constraints) {
    this.mediaStream = null;
    this.constraints = constraints || {
      audio: {
        echoCancellation: true,
        channelCount: { ideal: 6 },
        sampleRate: 48000,
      },
      video: true,
    };
  }

  /** Get the active video track */
  get videoInput() {
    return this._getInput('video');
  }

  /** Get the active audio track */
  get audioInput() {
    return this._getInput('audio');
  }

  _getInput(kind) {
    if (!this.mediaStream) return null;
    for (const track of this.mediaStream.getTracks()) {
      if (track.kind === kind) return track;
    }
    return null;
  }

  /** Acquire user media with current constraints */
  async getMedia() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(this.constraints);
      return this.mediaStream;
    } catch (error) {
      console.error('Could not get media:', error, this.constraints);
      throw error;
    }
  }

  /** Enumerate all media devices, grouped by kind */
  async getDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      throw new Error('enumerateDevices not supported in this browser.');
    }
    const items = { audioinput: [], videoinput: [], audiooutput: [] };
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const device of devices) {
      if (device.deviceId !== 'default' && items[device.kind]) {
        items[device.kind].push(device);
      }
    }
    return items;
  }

  /** Switch to a different video device */
  async changeVideo(deviceId) {
    return this._changeSource(deviceId, 'video');
  }

  /** Switch to a different audio device */
  async changeAudio(deviceId) {
    return this._changeSource(deviceId, 'audio');
  }

  async _changeSource(deviceId, type) {
    if (!deviceId) throw new Error('Device ID required');
    this.constraints[type] = {
      ...this.constraints[type],
      deviceId: { exact: deviceId },
    };
    return this.getMedia();
  }

  /** Mute/unmute video */
  muteVideo(muted = true) {
    if (!this.mediaStream) return false;
    const track = this.mediaStream.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !muted;
    return true;
  }

  /** Mute/unmute audio */
  muteAudio(muted = true) {
    if (!this.mediaStream) return false;
    const track = this.mediaStream.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !muted;
    return true;
  }

  /** Stop all tracks and clear the stream */
  destroy() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
  }
}

export default MediaManager;
