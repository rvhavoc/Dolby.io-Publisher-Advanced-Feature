/**
 * stats.js — Live stats overlay for Dolby.io Publisher
 *
 * Displays packet loss, bitrate, jitter, and available outgoing bandwidth
 * in a transparent overlay positioned under the LIVE badge (top-left).
 *
 * Uses the Millicast SDK's built-in stats event:
 *   publisher.webRTCPeer.on('stats', callback)
 * which fires every second with parsed WebRTC statistics.
 *
 * Hooks into publisher_multi.js via:
 *   - window._publisher  (the MillicastPublishUserMedia instance)
 *   - Fallback: polls LIVE badge visibility to auto-detect broadcast state
 */

(function () {
    'use strict';

    var isCollecting = false;
    var pollInterval = null;
    var statsListenerAttached = false;

    function getOverlay() {
        return document.getElementById('statsOverlay');
    }

    /**
     * Render stats data into the overlay.
     * Accepts the parsed stats object emitted by the SDK's 'stats' event.
     */
    function renderStats(stats) {
        var overlay = getOverlay();
        if (!overlay) return;

        // Extract values from SDK stats object
        var videoBitrate = 0, audioBitrate = 0;
        var videoWidth = 0, videoHeight = 0, videoFps = 0;
        var rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;

        try {
            // The SDK stats object structure varies by version.
            // Try multiple known formats.

            // Format 1: stats.video / stats.audio arrays (parsed format)
            if (stats.video && stats.video.length > 0) {
                var v = stats.video[0];
                videoBitrate = Math.round((v.bitrate || 0) / 1000);
                videoWidth = v.frameWidth || v.width || 0;
                videoHeight = v.frameHeight || v.height || 0;
                videoFps = v.framesPerSecond || v.fps || 0;
                packetsLost = v.packetsLost || v.totalPacketsLost || 0;
                jitter = Math.round((v.jitter || 0) * 1000);
            }
            if (stats.audio && stats.audio.length > 0) {
                var a = stats.audio[0];
                audioBitrate = Math.round((a.bitrate || 0) / 1000);
                if (!jitter && a.jitter) jitter = Math.round(a.jitter * 1000);
                if (!packetsLost && a.packetsLost) packetsLost = a.packetsLost;
            }

            // Format 2: stats.totalRoundTripTime or stats.currentRoundTripTime
            if (stats.candidatePair || stats.selectedCandidatePair) {
                var cp = stats.candidatePair || stats.selectedCandidatePair;
                rtt = Math.round((cp.currentRoundTripTime || 0) * 1000);
                availBw = Math.round((cp.availableOutgoingBitrate || 0) / 1000);
            }

            // Format 3: Flat stats properties
            if (!rtt && stats.roundTripTime) rtt = Math.round(stats.roundTripTime * 1000);
            if (!rtt && stats.currentRoundTripTime) rtt = Math.round(stats.currentRoundTripTime * 1000);
            if (!availBw && stats.availableOutgoingBitrate) availBw = Math.round(stats.availableOutgoingBitrate / 1000);

            // Format 4: raw stats with totalBitrate
            if (!videoBitrate && stats.totalBitrate) videoBitrate = Math.round(stats.totalBitrate / 1000);
            if (!videoBitrate && stats.bitrate) videoBitrate = Math.round(stats.bitrate / 1000);

            // Format 5: output.video / output.audio (another SDK version format)
            if (stats.output) {
                if (stats.output.video && stats.output.video.length > 0) {
                    var ov = stats.output.video[0];
                    if (!videoBitrate) videoBitrate = Math.round((ov.bitrate || 0) / 1000);
                    if (!videoWidth) videoWidth = ov.frameWidth || 0;
                    if (!videoHeight) videoHeight = ov.frameHeight || 0;
                    if (!videoFps) videoFps = ov.framesPerSecond || 0;
                }
                if (stats.output.audio && stats.output.audio.length > 0) {
                    var oa = stats.output.audio[0];
                    if (!audioBitrate) audioBitrate = Math.round((oa.bitrate || 0) / 1000);
                }
            }

            // Format 6: raw property (contains the raw RTCStatsReport data)
            if (stats.raw && typeof stats.raw.forEach === 'function') {
                stats.raw.forEach(function (stat) {
                    if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                        if (!videoWidth) videoWidth = stat.frameWidth || 0;
                        if (!videoHeight) videoHeight = stat.frameHeight || 0;
                        if (!videoFps) videoFps = stat.framesPerSecond || 0;
                    }
                    if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                        if (!rtt) rtt = Math.round((stat.currentRoundTripTime || 0) * 1000);
                        if (!availBw) availBw = Math.round((stat.availableOutgoingBitrate || 0) / 1000);
                    }
                    if (stat.type === 'remote-inbound-rtp') {
                        if (!jitter) jitter = Math.round((stat.jitter || 0) * 1000);
                        if (!packetsLost && stat.packetsLost) packetsLost = stat.packetsLost;
                    }
                });
            }
        } catch (e) {
            console.warn('[Stats] Error parsing stats:', e.message);
        }

        overlay.innerHTML =
            '<div class="stats-row"><span class="stats-label">Video:</span> <span class="stats-value ' + (videoBitrate < 100 ? 'stats-bad' : 'stats-ok') + '">' + videoBitrate + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Audio:</span> <span class="stats-value stats-ok">' + audioBitrate + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Res:</span> <span class="stats-value stats-ok">' + videoWidth + 'x' + videoHeight + ' @' + videoFps + 'fps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Avail BW:</span> <span class="stats-value ' + (availBw > 0 && availBw < 1000 ? 'stats-bad' : 'stats-ok') + '">' + availBw + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">RTT:</span> <span class="stats-value ' + (rtt > 200 ? 'stats-bad' : 'stats-ok') + '">' + rtt + ' ms</span></div>' +
            '<div class="stats-row"><span class="stats-label">Jitter:</span> <span class="stats-value ' + (jitter > 30 ? 'stats-bad' : 'stats-ok') + '">' + jitter + ' ms</span></div>' +
            '<div class="stats-row"><span class="stats-label">Pkt Loss:</span> <span class="stats-value ' + (packetsLost > 0 ? 'stats-bad' : 'stats-ok') + '">' + packetsLost + '</span></div>';
    }

    /**
     * Log the stats object structure once for debugging.
     */
    var loggedOnce = false;
    function onStats(stats) {
        if (!loggedOnce) {
            loggedOnce = true;
            console.log('[Stats] First stats event received. Keys:', Object.keys(stats));
            console.log('[Stats] Full stats object:', JSON.stringify(stats, null, 2).substring(0, 2000));
        }
        renderStats(stats);
    }

    function startStats() {
        if (isCollecting) return;
        isCollecting = true;
        loggedOnce = false;
        var overlay = getOverlay();
        if (overlay) overlay.style.display = 'block';
        console.log('[Stats] Starting stats collection');
        attachStatsListener();
    }

    function attachStatsListener() {
        if (statsListenerAttached) return;
        var pub = window._publisher;
        if (!pub) {
            console.log('[Stats] window._publisher not available, retrying in 1s...');
            setTimeout(attachStatsListener, 1000);
            return;
        }
        var peer = pub.webRTCPeer;
        if (!peer) {
            console.log('[Stats] webRTCPeer not available, retrying in 1s...');
            setTimeout(attachStatsListener, 1000);
            return;
        }

        // Use SDK's built-in stats event
        // Per SDK docs: publisher.webRTCPeer.on('stats', callback)
        peer.on('stats', onStats);
        statsListenerAttached = true;
        console.log('[Stats] Attached stats listener to webRTCPeer');

        // If stats are not auto-initialized, try to start them
        if (typeof peer.initStats === 'function') {
            try {
                peer.initStats();
                console.log('[Stats] Called initStats() on webRTCPeer');
            } catch (e) {
                // Already initialized, ignore
            }
        }
    }

    function stopStats() {
        isCollecting = false;
        loggedOnce = false;

        // Remove stats listener
        if (statsListenerAttached) {
            var pub = window._publisher;
            if (pub && pub.webRTCPeer) {
                pub.webRTCPeer.removeListener('stats', onStats);
            }
            statsListenerAttached = false;
        }

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
