/**
 * stats.js — Live stats overlay for Dolby.io Publisher
 *
 * Displays packet loss, bitrate, jitter, and available outgoing bandwidth
 * in a transparent overlay positioned under the LIVE badge (top-left).
 *
 * Dual approach:
 *   1. Primary: SDK built-in stats event (publisher.webRTCPeer.on('stats'))
 *   2. Fallback: Manual RTCPeerConnection.getStats() polling every 1s
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
    var manualPollTimer = null;
    var sdkStatsReceived = false;
    var prevBytesSentVideo = 0;
    var prevBytesSentAudio = 0;
    var prevTimestamp = 0;

    function getOverlay() {
        var el = document.getElementById('statsOverlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'statsOverlay';
            el.style.cssText = 'position:absolute;top:52px;left:20px;width:220px;background:transparent;' +
                'color:#0f0;font-family:Courier New,monospace;font-size:11px;padding:4px 8px;' +
                'border-radius:4px;z-index:200;pointer-events:none;line-height:1.5;' +
                'text-shadow:0 0 4px rgba(0,0,0,0.9),0 0 8px rgba(0,0,0,0.7);display:none;';
            var airView = document.getElementById('airIndicatorView');
            if (airView && airView.parentNode) {
                airView.parentNode.insertBefore(el, airView.nextSibling);
            } else {
                document.body.appendChild(el);
            }
            // Inject CSS for stats rows if not already present
            if (!document.getElementById('statsOverlayCSS')) {
                var style = document.createElement('style');
                style.id = 'statsOverlayCSS';
                style.textContent =
                    '#statsOverlay .stats-row{display:flex;justify-content:space-between;padding:1px 0}' +
                    '#statsOverlay .stats-label{color:#ccc}' +
                    '#statsOverlay .stats-value.stats-ok{color:#00ff00;font-weight:bold}' +
                    '#statsOverlay .stats-value.stats-bad{color:#ff2222;font-weight:bold}';
                document.head.appendChild(style);
            }
            console.log('[Stats] Created statsOverlay div dynamically');
        }
        return el;
    }

    function renderOverlay(videoBitrate, audioBitrate, videoWidth, videoHeight, videoFps, availBw, rtt, jitter, packetsLost) {
        var overlay = getOverlay();
        if (!overlay) return;

        // Ensure visible
        overlay.style.display = 'block';

        overlay.innerHTML =
            '<div class="stats-row"><span class="stats-label">Video:</span> <span class="stats-value ' + (videoBitrate < 100 ? 'stats-bad' : 'stats-ok') + '">' + videoBitrate + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Audio:</span> <span class="stats-value stats-ok">' + audioBitrate + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Res:</span> <span class="stats-value stats-ok">' + videoWidth + 'x' + videoHeight + ' @' + videoFps + 'fps</span></div>' +
            '<div class="stats-row"><span class="stats-label">Avail BW:</span> <span class="stats-value ' + (availBw > 0 && availBw < 1000 ? 'stats-bad' : 'stats-ok') + '">' + availBw + ' kbps</span></div>' +
            '<div class="stats-row"><span class="stats-label">RTT:</span> <span class="stats-value ' + (rtt > 200 ? 'stats-bad' : 'stats-ok') + '">' + rtt + ' ms</span></div>' +
            '<div class="stats-row"><span class="stats-label">Jitter:</span> <span class="stats-value ' + (jitter > 30 ? 'stats-bad' : 'stats-ok') + '">' + jitter + ' ms</span></div>' +
            '<div class="stats-row"><span class="stats-label">Pkt Loss:</span> <span class="stats-value ' + (packetsLost > 0 ? 'stats-bad' : 'stats-ok') + '">' + packetsLost + '</span></div>';
    }

    function renderFromSDKStats(stats) {
        var videoBitrate = 0, audioBitrate = 0;
        var videoWidth = 0, videoHeight = 0, videoFps = 0;
        var rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;

        try {
            // Actual SDK format (confirmed from live logs):
            // {
            //   currentRoundTripTime: 0.052,
            //   availableOutgoingBitrate: 300000,
            //   video: { outbounds: [{ bitrateBitsPerSecond, frameWidth, frameHeight, ... }] },
            //   audio: { outbounds: [{ bitrateBitsPerSecond, ... }] },
            //   raw: {}
            // }

            // Top-level transport stats
            if (stats.currentRoundTripTime) rtt = Math.round(stats.currentRoundTripTime * 1000);
            if (stats.availableOutgoingBitrate) availBw = Math.round(stats.availableOutgoingBitrate / 1000);

            // Video outbound stats
            if (stats.video && stats.video.outbounds && stats.video.outbounds.length > 0) {
                var v = stats.video.outbounds[0];
                videoBitrate = Math.round((v.bitrateBitsPerSecond || v.bitrate || 0) / 1000);
                videoWidth = v.frameWidth || 0;
                videoHeight = v.frameHeight || 0;
                videoFps = v.framesPerSecond || 0;
                if (v.qualityLimitationReason && v.qualityLimitationReason !== 'none') {
                    // Could display this info too
                }
            }

            // Audio outbound stats
            if (stats.audio && stats.audio.outbounds && stats.audio.outbounds.length > 0) {
                var a = stats.audio.outbounds[0];
                audioBitrate = Math.round((a.bitrateBitsPerSecond || a.bitrate || 0) / 1000);
            }

            // Video inbound stats (for jitter/packetsLost from remote)
            if (stats.video && stats.video.inbounds && stats.video.inbounds.length > 0) {
                var vi = stats.video.inbounds[0];
                if (vi.jitter) jitter = Math.round(vi.jitter * 1000);
                if (vi.packetsLost) packetsLost = vi.packetsLost;
            }

            // Audio inbound stats (fallback jitter/loss)
            if (stats.audio && stats.audio.inbounds && stats.audio.inbounds.length > 0) {
                var ai = stats.audio.inbounds[0];
                if (!jitter && ai.jitter) jitter = Math.round(ai.jitter * 1000);
                if (!packetsLost && ai.packetsLost) packetsLost = ai.packetsLost;
            }

            // raw RTCStatsReport (fallback for jitter/loss from remote-inbound-rtp)
            if (stats.raw && typeof stats.raw.forEach === 'function') {
                stats.raw.forEach(function (stat) {
                    if (stat.type === 'remote-inbound-rtp') {
                        if (!jitter && stat.jitter) jitter = Math.round(stat.jitter * 1000);
                        if (!packetsLost && stat.packetsLost) packetsLost = stat.packetsLost;
                    }
                });
            }
        } catch (e) {
            console.warn('[Stats] Error parsing SDK stats:', e.message);
        }

        renderOverlay(videoBitrate, audioBitrate, videoWidth, videoHeight, videoFps, availBw, rtt, jitter, packetsLost);
    }

    function renderFromRawStats(report) {
        var videoBitrate = 0, audioBitrate = 0;
        var videoWidth = 0, videoHeight = 0, videoFps = 0;
        var rtt = 0, jitter = 0, packetsLost = 0, availBw = 0;
        var nowBytesSentVideo = 0, nowBytesSentAudio = 0, nowTimestamp = 0;

        report.forEach(function (stat) {
            if (stat.type === 'outbound-rtp' && stat.kind === 'video') {
                nowBytesSentVideo = stat.bytesSent || 0;
                nowTimestamp = stat.timestamp || Date.now();
                videoWidth = stat.frameWidth || 0;
                videoHeight = stat.frameHeight || 0;
                videoFps = stat.framesPerSecond || 0;
            }
            if (stat.type === 'outbound-rtp' && stat.kind === 'audio') {
                nowBytesSentAudio = stat.bytesSent || 0;
                if (!nowTimestamp) nowTimestamp = stat.timestamp || Date.now();
            }
            if (stat.type === 'remote-inbound-rtp') {
                if (stat.jitter) jitter = Math.round(stat.jitter * 1000);
                if (stat.packetsLost) packetsLost = stat.packetsLost;
                if (stat.roundTripTime) rtt = Math.round(stat.roundTripTime * 1000);
            }
            if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                if (stat.currentRoundTripTime) rtt = Math.round(stat.currentRoundTripTime * 1000);
                if (stat.availableOutgoingBitrate) availBw = Math.round(stat.availableOutgoingBitrate / 1000);
            }
        });

        if (prevTimestamp > 0 && nowTimestamp > prevTimestamp) {
            var elapsed = (nowTimestamp - prevTimestamp) / 1000;
            videoBitrate = Math.round(((nowBytesSentVideo - prevBytesSentVideo) * 8) / elapsed / 1000);
            audioBitrate = Math.round(((nowBytesSentAudio - prevBytesSentAudio) * 8) / elapsed / 1000);
            if (videoBitrate < 0) videoBitrate = 0;
            if (audioBitrate < 0) audioBitrate = 0;
        }
        prevBytesSentVideo = nowBytesSentVideo;
        prevBytesSentAudio = nowBytesSentAudio;
        prevTimestamp = nowTimestamp;

        renderOverlay(videoBitrate, audioBitrate, videoWidth, videoHeight, videoFps, availBw, rtt, jitter, packetsLost);
    }

    var loggedSDKOnce = false;
    var loggedManualOnce = false;

    function onSDKStats(stats) {
        sdkStatsReceived = true;
        if (!loggedSDKOnce) {
            loggedSDKOnce = true;
            console.log('[Stats] First SDK stats event received. Keys:', Object.keys(stats));
            try {
                console.log('[Stats] SDK stats sample:', JSON.stringify(stats, null, 2).substring(0, 2000));
            } catch (e) {
                console.log('[Stats] SDK stats (non-serializable):', stats);
            }
        }
        if (manualPollTimer) {
            clearInterval(manualPollTimer);
            manualPollTimer = null;
            console.log('[Stats] SDK stats working, stopped manual fallback');
        }
        renderFromSDKStats(stats);
    }

    function getRTCPeerConnection() {
        var pub = window._publisher || window.millicastPublish;
        if (!pub) return null;

        if (typeof pub.getRTCPeerConnection === 'function') {
            try { var pc = pub.getRTCPeerConnection(); if (pc) return pc; } catch (e) {}
        }

        var peer = pub.webRTCPeer;
        if (peer) {
            if (typeof peer.getRTCPeer === 'function') {
                try { var pc = peer.getRTCPeer(); if (pc) return pc; } catch (e) {}
            }
            if (typeof peer.getRTCPeerConnection === 'function') {
                try { var pc = peer.getRTCPeerConnection(); if (pc) return pc; } catch (e) {}
            }
            if (peer.peer && peer.peer instanceof RTCPeerConnection) return peer.peer;
            if (peer.pc && peer.pc instanceof RTCPeerConnection) return peer.pc;
        }

        return null;
    }

    function manualStatsPoll() {
        if (sdkStatsReceived) return;
        var pc = getRTCPeerConnection();
        if (!pc) {
            console.log('[Stats] Manual fallback: RTCPeerConnection not available yet');
            return;
        }
        if (!loggedManualOnce) {
            loggedManualOnce = true;
            console.log('[Stats] Manual fallback active: polling RTCPeerConnection.getStats()');
        }
        pc.getStats(null).then(function (report) {
            if (!isCollecting) return;
            renderFromRawStats(report);
        }).catch(function (err) {
            console.warn('[Stats] Manual getStats() error:', err.message);
        });
    }

    function startStats() {
        if (isCollecting) return;
        isCollecting = true;
        sdkStatsReceived = false;
        loggedSDKOnce = false;
        loggedManualOnce = false;
        prevBytesSentVideo = 0;
        prevBytesSentAudio = 0;
        prevTimestamp = 0;
        var overlay = getOverlay();
        if (overlay) overlay.style.display = 'block';
        console.log('[Stats] Starting stats collection');
        attachStatsListener();
    }

    function attachStatsListener() {
        if (statsListenerAttached) return;
        var pub = window._publisher || window.millicastPublish;
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

        // Primary: SDK's built-in stats event
        peer.on('stats', onSDKStats);
        statsListenerAttached = true;
        console.log('[Stats] Attached SDK stats listener to webRTCPeer');

        if (typeof peer.initStats === 'function') {
            try {
                peer.initStats();
                console.log('[Stats] Called initStats() on webRTCPeer');
            } catch (e) {
                console.log('[Stats] initStats() skipped (may already be active)');
            }
        }

        // Fallback: Start manual getStats() polling after 3s if SDK event hasn't fired
        setTimeout(function () {
            if (!sdkStatsReceived && isCollecting) {
                console.log('[Stats] SDK stats event not received after 3s, starting manual fallback');
                manualPollTimer = setInterval(manualStatsPoll, 1000);
            }
        }, 3000);
    }

    function stopStats() {
        isCollecting = false;
        sdkStatsReceived = false;

        if (statsListenerAttached) {
            var pub = window._publisher || window.millicastPublish;
            if (pub && pub.webRTCPeer) {
                try { pub.webRTCPeer.removeListener('stats', onSDKStats); } catch (e) {}
            }
            statsListenerAttached = false;
        }

        if (manualPollTimer) {
            clearInterval(manualPollTimer);
            manualPollTimer = null;
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
