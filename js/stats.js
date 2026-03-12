/**
 * stats.js - WebRTC stats collection and overlay display.
 * Ported from the React publisher's shared.js getStats implementation.
 * Shows packet loss, available bandwidth, jitter, RTT, and bitrates.
 */

import { getPublisher, isBroadcasting } from './publisher-core.js';

// Delta tracking for rate calculations
let lastAudioBytes = 0;
let lastAudioTs = 0;
let lastVideoBySSRC = {};
let lastVideoFrames = 0;
let lastVideoFramesTs = 0;

let statsInterval = null;
let statsVisible = false;

function ensureNumber(n, def) {
  n = Number(n);
  return isFinite(n) ? n : def;
}

/**
 * Collect WebRTC stats from the peer connection.
 * Returns an object with audio/video bitrates, jitter, packet loss, AOB, RTT.
 */
async function getStats() {
  const publisher = getPublisher();
  if (!publisher || typeof publisher.getRTCPeerConnection !== 'function') {
    return null;
  }

  const pc = publisher.getRTCPeerConnection();
  if (!pc) return null;

  const statsReport = await pc.getStats();

  let audioKbps = 0, videoKbps = 0, aobKbps = 0, rttMs = 0, jitterMs = 0, packetsLost = 0;
  let vWidth = 0, vHeight = 0, vFps = 0;

  // Transport / AOB / RTT
  let selectedPairId = null;
  statsReport.forEach(r => {
    if (r.type === 'transport' && r.selectedCandidatePairId) {
      selectedPairId = r.selectedCandidatePairId;
    }
  });

  if (selectedPairId) {
    const pair = statsReport.get(selectedPairId);
    if (pair && pair.type === 'candidate-pair') {
      aobKbps = (pair.availableOutgoingBitrate || 0) / 1000;
      if (typeof pair.currentRoundTripTime === 'number') rttMs = pair.currentRoundTripTime * 1000;
    }
  } else {
    statsReport.forEach(r => {
      if (r.type === 'candidate-pair' && (r.selected || r.nominated)) {
        aobKbps = (r.availableOutgoingBitrate || 0) / 1000;
        if (typeof r.currentRoundTripTime === 'number') rttMs = r.currentRoundTripTime * 1000;
      }
    });
  }

  // outbound-rtp
  statsReport.forEach(report => {
    if (report.type !== 'outbound-rtp') return;

    if (report.kind === 'audio') {
      if (report.bytesSent != null && report.timestamp != null) {
        if (lastAudioTs) {
          const dt = (report.timestamp - lastAudioTs) / 1000;
          const db = report.bytesSent - lastAudioBytes;
          audioKbps = (db * 8) / 1000 / Math.max(0.2, dt);
        }
        lastAudioBytes = report.bytesSent;
        lastAudioTs = report.timestamp;
      }

      const ra = report.remoteId ? statsReport.get(report.remoteId) : null;
      if (ra && ra.type === 'remote-inbound-rtp') {
        if (typeof ra.jitter === 'number') jitterMs = ra.jitter * 1000;
        if (typeof ra.fractionLost === 'number') {
          packetsLost = Math.round(ra.fractionLost * (report.packetsSent || 0));
        } else if (typeof ra.packetsLost === 'number') {
          packetsLost = ra.packetsLost;
        }
      }
    } else if (report.kind === 'video') {
      if (report.bytesSent != null && report.timestamp != null) {
        const ssrc = report.ssrc || report.id || 'default';
        const prev = lastVideoBySSRC[ssrc];
        if (prev) {
          const dtv = (report.timestamp - prev.ts) / 1000;
          const dbv = report.bytesSent - prev.bytes;
          videoKbps += (dbv * 8) / 1000 / Math.max(0.2, dtv);
        }
        lastVideoBySSRC[ssrc] = { bytes: report.bytesSent, ts: report.timestamp };
      }

      if (typeof report.frameWidth === 'number') vWidth = report.frameWidth;
      if (typeof report.frameHeight === 'number') vHeight = report.frameHeight;

      if (typeof report.framesEncoded === 'number' && typeof report.timestamp === 'number') {
        if (lastVideoFramesTs) {
          const dtf = (report.timestamp - lastVideoFramesTs) / 1000;
          const df = report.framesEncoded - lastVideoFrames;
          if (dtf > 0) vFps = df / dtf;
        }
        lastVideoFrames = report.framesEncoded;
        lastVideoFramesTs = report.timestamp;
      } else if (typeof report.framesPerSecond === 'number') {
        vFps = report.framesPerSecond;
      }
    }
  });

  return {
    audioBitrateKbps: Math.round(audioKbps * 10) / 10,
    videoBitrateKbps: Math.round(videoKbps * 10) / 10,
    videoWidth: vWidth,
    videoHeight: vHeight,
    videoFps: Math.round(vFps * 10) / 10,
    aobKbps: Math.round(aobKbps),
    rttMs: Math.round(rttMs * 10) / 10,
    jitterMs: Math.round(jitterMs * 100) / 100,
    packetsLost,
  };
}

/**
 * Update the stats overlay UI with current data.
 */
function updateStatsOverlay(stats) {
  const overlay = document.getElementById('statsOverlay');
  if (!overlay || !stats) return;

  const html = `
    <div class="stats-row"><span class="stats-label">Video:</span> <span class="stats-value">${stats.videoBitrateKbps} kbps</span></div>
    <div class="stats-row"><span class="stats-label">Audio:</span> <span class="stats-value">${stats.audioBitrateKbps} kbps</span></div>
    <div class="stats-row"><span class="stats-label">Resolution:</span> <span class="stats-value">${stats.videoWidth}x${stats.videoHeight} @ ${stats.videoFps} fps</span></div>
    <div class="stats-row"><span class="stats-label">Avail BW:</span> <span class="stats-value ${stats.aobKbps < 1000 ? 'stats-warn' : ''}">${stats.aobKbps} kbps</span></div>
    <div class="stats-row"><span class="stats-label">RTT:</span> <span class="stats-value ${stats.rttMs > 200 ? 'stats-warn' : ''}">${stats.rttMs} ms</span></div>
    <div class="stats-row"><span class="stats-label">Jitter:</span> <span class="stats-value ${stats.jitterMs > 30 ? 'stats-warn' : ''}">${stats.jitterMs} ms</span></div>
    <div class="stats-row"><span class="stats-label">Pkt Loss:</span> <span class="stats-value ${stats.packetsLost > 0 ? 'stats-warn' : ''}">${stats.packetsLost}</span></div>
  `;
  overlay.innerHTML = html;
}

/**
 * Start polling stats every second and updating the overlay.
 */
function startStatsPolling() {
  resetDeltas();
  stopStatsPolling();

  statsInterval = setInterval(async () => {
    if (!isBroadcasting()) return;
    const stats = await getStats();
    if (stats) updateStatsOverlay(stats);
  }, 1000);
}

/**
 * Stop stats polling.
 */
function stopStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

/**
 * Toggle stats overlay visibility.
 */
function toggleStatsOverlay() {
  const overlay = document.getElementById('statsOverlay');
  if (!overlay) return;

  statsVisible = !statsVisible;
  overlay.style.display = statsVisible ? 'block' : 'none';

  if (statsVisible && isBroadcasting()) {
    startStatsPolling();
  } else if (!statsVisible) {
    stopStatsPolling();
  }
}

/**
 * Reset delta tracking (call when starting a new broadcast).
 */
function resetDeltas() {
  lastAudioBytes = 0;
  lastAudioTs = 0;
  lastVideoBySSRC = {};
  lastVideoFrames = 0;
  lastVideoFramesTs = 0;
}

export {
  getStats,
  startStatsPolling,
  stopStatsPolling,
  toggleStatsOverlay,
  resetDeltas,
  updateStatsOverlay,
};
