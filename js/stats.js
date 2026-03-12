/**
 * stats.js — Live stats overlay for Dolby.io Publisher
 *
 * Displays packet loss, bitrate, jitter, and available outgoing bandwidth
 * in a transparent overlay positioned under the LIVE badge (top-left).
 *
 * Hooks into publisher_multi.js via:
 *   - window._publisher  (the MillicastPublishUserMedia instance)
 *   - window events: 'publisherBroadcastStart' / 'publisherBroadcastStop'
 */

(function () {
    'use strict';

    let statsInterval = null;
    let prevVideoBytes = 0;
    let prevAudioBytes = 0;
    let prevTimestamp = 0;

    function getOverlay() {
        return document.getElementById('statsOverlay');
    }

    /**
     * Try multiple access patterns to get the underlying RTCPeerConnection.
     */
    function getRTCPeerConnection() {
        const pub = window._publisher;
        if (!pub) return null;
        const peer = pub.webRTCPeer;
        if (!peer) return null;
        if (typeof peer.getRTCPeerConnection === 'function') return peer.getRTCPeerConnection();
        if (peer.peer) return peer.peer;
        if (typeof peer.getStats === 'function' && typeof peer.getSenders === 'function') return peer;
        return null;
    }

    function startStats() {
        if (statsInterval) return;
        const overlay = getOverlay();
        if (!overlay) return;

        // Reset cumulative counters
        prevVideoBytes = 0;
        prevAudioBytes = 0;
        prevTimestamp = 0;

        overlay.style.display = 'block';

        statsInterval = setInterval(async () => {
            try {
                const pc = getRTCPeerConnection();
                if (!pc || typeof pc.getStats !== 'function') return;

                const report = await pc.getStats();
                let videoBytes = 0, audioBytes = 0, timestamp = 0;
                let videoWidth = 0, videoHeight = 0, videoFps = 0;
                let rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;

                report.forEach(function (stat) {
                    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                        videoBytes = stat.bytesSent || 0;
                        timestamp = stat.timestamp || 0;
                        videoWidth = stat.frameWidth || 0;
                        videoHeight = stat.frameHeight || 0;
                        videoFps = stat.framesPerSecond || 0;
                        packetsLost = stat.packetsLost || 0;
                    }
                    if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
                        audioBytes = stat.bytesSent || 0;
                    }
                    if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                        rtt = Math.round((stat.currentRoundTripTime || 0) * 1000);
                        availBw = Math.round((stat.availableOutgoingBitrate || 0) / 1000);
                    }
                    if (stat.type === 'remote-inbound-rtp') {
                        jitter = Math.round((stat.jitter || 0) * 1000);
                        if (stat.packetsLost) packetsLost = stat.packetsLost;
                    }
                });

                // Calculate bitrate from cumulative byte counters
                let videoBitrate = 0, audioBitrate = 0;
                if (prevTimestamp > 0 && timestamp > prevTimestamp) {
                    const dtSec = (timestamp - prevTimestamp) / 1000;
                    videoBitrate = Math.round(((videoBytes - prevVideoBytes) * 8) / dtSec / 1000);
                    audioBitrate = Math.round(((audioBytes - prevAudioBytes) * 8) / dtSec / 1000);
                }
                prevVideoBytes = videoBytes;
                prevAudioBytes = audioBytes;
                prevTimestamp = timestamp;

                overlay.innerHTML =
                    '<div class="stats-row"><span class="stats-label">Video:</span> <span class="stats-value ' + (videoBitrate < 100 && prevTimestamp > 0 ? 'stats-bad' : 'stats-ok') + '">' + videoBitrate + ' kbps</span></div>' +
                    '<div class="stats-row"><span class="stats-label">Audio:</span> <span class="stats-value stats-ok">' + audioBitrate + ' kbps</span></div>' +
                    '<div class="stats-row"><span class="stats-label">Res:</span> <span class="stats-value stats-ok">' + videoWidth + 'x' + videoHeight + ' @' + videoFps + 'fps</span></div>' +
                    '<div class="stats-row"><span class="stats-label">Avail BW:</span> <span class="stats-value ' + (availBw > 0 && availBw < 1000 ? 'stats-bad' : 'stats-ok') + '">' + availBw + ' kbps</span></div>' +
                    '<div class="stats-row"><span class="stats-label">RTT:</span> <span class="stats-value ' + (rtt > 200 ? 'stats-bad' : 'stats-ok') + '">' + rtt + ' ms</span></div>' +
                    '<div class="stats-row"><span class="stats-label">Jitter:</span> <span class="stats-value ' + (jitter > 30 ? 'stats-bad' : 'stats-ok') + '">' + jitter + ' ms</span></div>' +
                    '<div class="stats-row"><span class="stats-label">Pkt Loss:</span> <span class="stats-value ' + (packetsLost > 0 ? 'stats-bad' : 'stats-ok') + '">' + packetsLost + '</span></div>';

            } catch (e) {
                console.warn('[Stats] Error collecting stats:', e.message);
            }
        }, 1000);
    }

    function stopStats() {
        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }
        prevVideoBytes = 0;
        prevAudioBytes = 0;
        prevTimestamp = 0;
        var overlay = getOverlay();
        if (overlay) overlay.style.display = 'none';
    }

    // Listen for broadcast lifecycle events from publisher_multi.js
    window.addEventListener('publisherBroadcastStart', startStats);
    window.addEventListener('publisherBroadcastStop', stopStats);

})();
