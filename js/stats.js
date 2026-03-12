/**
 * stats.js — Live stats overlay for Dolby.io Publisher
 *
 * Displays packet loss, bitrate, jitter, and available outgoing bandwidth
 * in a transparent overlay positioned under the LIVE badge (top-left).
 *
 * Hooks into publisher_multi.js via:
 *   - window._publisher  (the MillicastPublishUserMedia instance)
 *   - window events: 'publisherBroadcastStart' / 'publisherBroadcastStop'
 *   - Fallback: polls LIVE badge visibility to auto-detect broadcast state
 */

(function () {
    'use strict';

    var statsInterval = null;
    var pollInterval = null;
    var prevVideoBytes = 0;
    var prevAudioBytes = 0;
    var prevTimestamp = 0;
    var isCollecting = false;
    var peerFound = false;

    function getOverlay() {
        return document.getElementById('statsOverlay');
    }

    /**
     * Try every known access pattern to get the underlying RTCPeerConnection
     * from the Millicast SDK's Publish / PeerConnection wrapper.
     */
    function getRTCPeerConnection() {
        var pub = window._publisher;
        if (!pub) {
            if (!peerFound) console.log('[Stats] window._publisher not set yet');
            return null;
        }

        var peer = pub.webRTCPeer;
        if (!peer) {
            if (!peerFound) console.log('[Stats] webRTCPeer not available yet');
            return null;
        }

        // Log available properties once for debugging
        if (!peerFound) {
            console.log('[Stats] webRTCPeer found, type:', typeof peer);
            console.log('[Stats] webRTCPeer keys:', Object.keys(peer));
            if (peer.peer) console.log('[Stats] webRTCPeer.peer found, type:', typeof peer.peer);
            if (peer.pc) console.log('[Stats] webRTCPeer.pc found, type:', typeof peer.pc);
            if (peer.peerConnection) console.log('[Stats] webRTCPeer.peerConnection found');
            console.log('[Stats] getRTCPeerConnection exists:', typeof peer.getRTCPeerConnection);
            console.log('[Stats] getStats exists:', typeof peer.getStats);
            console.log('[Stats] getSenders exists:', typeof peer.getSenders);
        }

        var pc = null;

        // Pattern 1: Millicast SDK getRTCPeerConnection() method
        if (typeof peer.getRTCPeerConnection === 'function') {
            pc = peer.getRTCPeerConnection();
        }
        // Pattern 2: Direct .peer property (Millicast PeerConnection wrapper)
        if (!pc && peer.peer) {
            pc = peer.peer;
        }
        // Pattern 3: .pc property
        if (!pc && peer.pc) {
            pc = peer.pc;
        }
        // Pattern 4: .peerConnection property
        if (!pc && peer.peerConnection) {
            pc = peer.peerConnection;
        }
        // Pattern 5: webRTCPeer itself is the RTCPeerConnection
        if (!pc && typeof peer.getStats === 'function' && typeof peer.getSenders === 'function') {
            pc = peer;
        }
        // Pattern 6: Check all own properties for an RTCPeerConnection instance
        if (!pc) {
            var keys = Object.keys(peer);
            for (var i = 0; i < keys.length; i++) {
                var val = peer[keys[i]];
                if (val && typeof val === 'object' && typeof val.getStats === 'function' && typeof val.getSenders === 'function') {
                    if (!peerFound) console.log('[Stats] Found RTCPeerConnection at webRTCPeer.' + keys[i]);
                    pc = val;
                    break;
                }
            }
        }

        if (pc && !peerFound) {
            peerFound = true;
            console.log('[Stats] RTCPeerConnection acquired successfully');
        }
        if (!pc && !peerFound) {
            console.log('[Stats] Could not find RTCPeerConnection from webRTCPeer');
        }

        return pc;
    }

    function startStats() {
        if (isCollecting) return;
        isCollecting = true;
        peerFound = false;
        var overlay = getOverlay();
        if (!overlay) return;

        prevVideoBytes = 0;
        prevAudioBytes = 0;
        prevTimestamp = 0;

        overlay.style.display = 'block';
        console.log('[Stats] Starting stats collection');

        statsInterval = setInterval(async function () {
            try {
                var pc = getRTCPeerConnection();
                if (!pc || typeof pc.getStats !== 'function') return;

                var report = await pc.getStats();
                var videoBytes = 0, audioBytes = 0, timestamp = 0;
                var videoWidth = 0, videoHeight = 0, videoFps = 0;
                var rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;

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

                var videoBitrate = 0, audioBitrate = 0;
                if (prevTimestamp > 0 && timestamp > prevTimestamp) {
                    var dtSec = (timestamp - prevTimestamp) / 1000;
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
        isCollecting = false;
        peerFound = false;
        prevVideoBytes = 0;
        prevAudioBytes = 0;
        prevTimestamp = 0;
        var overlay = getOverlay();
        if (overlay) {
            overlay.style.display = 'none';
            overlay.innerHTML = '';
        }
        console.log('[Stats] Stopped stats collection');
    }

    // Listen for broadcast lifecycle events from publisher_multi.js
    window.addEventListener('publisherBroadcastStart', startStats);
    window.addEventListener('publisherBroadcastStop', stopStats);

    // Fallback: poll the LIVE badge visibility every 2s to detect broadcast state.
    function pollLiveBadge() {
        var liveBadge = document.getElementById('liveBadge');
        if (!liveBadge) return;
        var isLive = !liveBadge.classList.contains('hidden');
        if (isLive && !isCollecting) {
            console.log('[Stats] Detected LIVE badge visible - starting stats (fallback)');
            startStats();
        } else if (!isLive && isCollecting) {
            console.log('[Stats] Detected LIVE badge hidden - stopping stats (fallback)');
            stopStats();
        }
    }

    // Start polling after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            pollInterval = setInterval(pollLiveBadge, 2000);
        });
    } else {
        pollInterval = setInterval(pollLiveBadge, 2000);
    }

})();
