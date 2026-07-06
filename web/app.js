// app.js - Frontend interactions and PyWebView bindings

let currentDownloadDir = 'Downloads';
let activeDownloadsCount = 0;
const downloadsStore = {}; // In-memory store for all download tasks

// Wait for PyWebView to inject its API
window.addEventListener('pywebviewready', () => {
    initApp();
});

// App Initialization
function initApp() {
    console.log("PyWebView API is ready");
    
    // Fetch default download directory
    window.pywebview.api.get_default_download_dir().then(path => {
        updateDownloadDirDisplay(path);
    });

    // Check FFmpeg status
    window.pywebview.api.check_ffmpeg().then(status => {
        updateFfmpegStatus(status);
    });

    // Fetch engine version
    window.pywebview.api.get_engine_version().then(version => {
        const label = document.getElementById('settings-engine-label');
        if (label) label.innerText = `Version: ${version}`;
    });

    // Fetch default concurrency limit
    window.pywebview.api.get_max_concurrent_downloads().then(val => {
        const select = document.getElementById('settings-concurrency');
        if (select) select.value = val.toString();
    });

    // Fetch default speed limit setting
    window.pywebview.api.get_speed_limit().then(val => {
        const select = document.getElementById('settings-speed-limit');
        if (select) select.value = val;
    });

    // Fetch default concurrent fragments setting
    window.pywebview.api.get_concurrent_fragments().then(val => {
        const select = document.getElementById('settings-fragments');
        if (select) select.value = val.toString();
    });

    // Fetch default theme setting
    window.pywebview.api.get_theme().then(theme => {
        applyTheme(theme);
        const select = document.getElementById('settings-theme');
        if (select) select.value = theme;
    });

    // Fetch embedding settings
    window.pywebview.api.get_embed_metadata().then(enabled => {
        const chk = document.getElementById('settings-embed-metadata');
        if (chk) chk.checked = enabled;
    });
    window.pywebview.api.get_embed_thumbnail().then(enabled => {
        const chk = document.getElementById('settings-embed-thumbnail');
        if (chk) chk.checked = enabled;
    });

    // Fetch embedding settings
    window.pywebview.api.get_embed_metadata().then(enabled => {
        const chk = document.getElementById('settings-embed-metadata');
        if (chk) chk.checked = enabled;
    });
    window.pywebview.api.get_embed_thumbnail().then(enabled => {
        const chk = document.getElementById('settings-embed-thumbnail');
        if (chk) chk.checked = enabled;
    });

    // Version 1.2 Settings Fetch
    window.pywebview.api.get_clipboard_auto_detect().then(enabled => {
        const chk = document.getElementById('settings-clipboard-auto');
        if (chk) chk.checked = enabled;
    });
    updateCookiesFileDisplay();
    loadDownloadHistory();
    loadSavedPlaylists();

    // Register clipboard checker on focus
    window.addEventListener('focus', () => {
        checkClipboardForLink();
    });
    let videoDebounceTimeout = null;
    let playlistDebounceTimeout = null;

    const videoInput = document.getElementById('video-url-input');
    if (videoInput) {
        videoInput.addEventListener('input', (e) => {
            clearTimeout(videoDebounceTimeout);
            const url = e.target.value.trim();
            videoDebounceTimeout = setTimeout(() => {
                validateLinkInput(url, 'video');
            }, 350);
        });
    }

    const playlistInput = document.getElementById('playlist-url-input');
    if (playlistInput) {
        playlistInput.addEventListener('input', (e) => {
            clearTimeout(playlistDebounceTimeout);
            const url = e.target.value.trim();
            playlistDebounceTimeout = setTimeout(() => {
                validateLinkInput(url, 'playlist');
            }, 350);
        });
    }
}

// Real-time Link Validation Function
function validateLinkInput(url, type) {
    const statusElement = document.getElementById(`${type}-url-status`);
    if (!statusElement) return;

    if (!url) {
        statusElement.innerText = '';
        statusElement.className = 'url-status-message';
        return;
    }

    statusElement.innerText = 'Checking compatibility...';
    statusElement.className = 'url-status-message active status-checking';

    window.pywebview.api.check_link_support(url).then(res => {
        if (res.success) {
            if (res.supported) {
                statusElement.innerHTML = `✓ Link recognized: <strong>${res.extractor}</strong>`;
                statusElement.className = 'url-status-message active status-supported';
            } else {
                if (res.reason && res.reason.includes('http')) {
                    statusElement.innerHTML = `✗ ${res.reason}`;
                    statusElement.className = 'url-status-message active status-invalid';
                } else {
                    statusElement.innerHTML = `⚠ ${res.reason}`;
                    statusElement.className = 'url-status-message active status-unsupported';
                }
            }
        } else {
            statusElement.innerText = '✗ Error parsing link';
            statusElement.className = 'url-status-message active status-invalid';
        }
    }).catch(err => {
        statusElement.innerText = '✗ Error validating link';
        statusElement.className = 'url-status-message active status-invalid';
    });
}

// Tab Switching Logic
function switchTab(tabId) {
    // Hide all panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    
    // Remove active class from nav buttons
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected panel
    const targetPanel = document.getElementById(`tab-${tabId}`);
    if (targetPanel) {
        targetPanel.classList.add('active');
    }

    // Highlight selected nav button
    const targetBtn = document.getElementById(`btn-nav-${tabId}`);
    if (targetBtn) {
        targetBtn.classList.add('active');
    }

    // Update Header Title
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) {
        switch(tabId) {
            case 'video': pageTitle.innerText = "Single Video Downloader"; break;
            case 'playlist': pageTitle.innerText = "Playlist Downloader"; break;
            case 'downloads': pageTitle.innerText = "Active & Completed Downloads"; break;
            case 'settings': pageTitle.innerText = "Settings & Info"; break;
        }
    }
}

// Update Download Directory UI
function updateDownloadDirDisplay(path) {
    currentDownloadDir = path;
    const headerDisplay = document.getElementById('current-dir-display');
    const settingsDisplay = document.getElementById('settings-dir-label');
    
    if (headerDisplay) headerDisplay.innerText = getBasename(path);
    if (settingsDisplay) settingsDisplay.innerText = path;
}

function getBasename(path) {
    const parts = path.split(/[\\/]/);
    return parts[parts.length - 1] || path;
}

// Browse folder
function browseFolder() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.select_download_dir().then(path => {
            if (path) {
                updateDownloadDirDisplay(path);
                showToast("Download path updated successfully", "success");
            }
        });
    }
}

// FFmpeg status updater
function updateFfmpegStatus(status) {
    const dot = document.getElementById('ffmpeg-dot');
    const text = document.getElementById('ffmpeg-text');
    const settingsLabel = document.getElementById('settings-ffmpeg-label');

    if (status.available) {
        if (dot) {
            dot.className = "status-dot active";
        }
        if (text) text.innerText = "FFmpeg Active";
        if (settingsLabel) settingsLabel.innerHTML = `<span style="color:#10b981; font-weight:600;">Available</span><br><span style="font-size:0.8rem; color:#9ca3af;">Path: ${status.path}</span>`;
    } else {
        if (dot) {
            dot.className = "status-dot danger";
        }
        if (text) text.innerText = "FFmpeg Missing";
        if (settingsLabel) settingsLabel.innerHTML = `<span style="color:#ef4444; font-weight:600;">Not Found</span><br><span style="font-size:0.8rem; color:#9ca3af;">Please note: downloads are limited to max 720p without FFmpeg.</span>`;
    }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    toast.innerHTML = `
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
        dismissToast(toast);
    });

    container.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => {
        dismissToast(toast);
    }, 4500);
}

function dismissToast(toast) {
    if (toast.style.animationName === 'toastFadeOut') return;
    toast.style.animation = 'toastFadeOut 0.25s ease-in forwards';
    setTimeout(() => {
        toast.remove();
    }, 250);
}

// --- SINGLE VIDEO LOGIC ---
let currentVideoData = null;

function fetchVideo() {
    const urlInput = document.getElementById('video-url-input');
    const url = urlInput.value.trim();
    if (!url) {
        showToast("Please enter a valid YouTube URL", "warning");
        return;
    }

    const loader = document.getElementById('video-loading');
    const details = document.getElementById('video-details');
    
    loader.style.display = 'flex';
    details.style.display = 'none';

    window.pywebview.api.fetch_video_details(url).then(response => {
        loader.style.display = 'none';
        
        if (response.success) {
            currentVideoData = response.data;
            renderVideoDetails(response.data);
            showToast("Video analyzed successfully", "success");
        } else {
            showToast(`Error: ${response.error}`, "error");
        }
    }).catch(err => {
        loader.style.display = 'none';
        showToast(`Unexpected error: ${err}`, "error");
    });
}

function renderVideoDetails(data) {
    const details = document.getElementById('video-details');
    
    document.getElementById('v-thumbnail').src = data.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600';
    document.getElementById('v-duration').innerText = formatDuration(data.duration);
    document.getElementById('v-title').innerText = data.title;
    document.getElementById('v-author').innerText = data.uploader || 'Unknown Channel';

    // Filter out 'bestaudio/best' from qualities if it exists
    const videoQualities = data.quality_options.filter(opt => opt.id !== 'bestaudio/best');
    
    // Populate Qualities
    const qualitySelect = document.getElementById('video-quality');
    qualitySelect.innerHTML = '';
    videoQualities.forEach((opt, idx) => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.innerText = opt.label;
        if (idx === 0) option.selected = true; // Pre-select highest quality
        qualitySelect.appendChild(option);
    });

    // Reset and populate format selector based on format type
    onMediaTypeChange();

    // Populate Subtitles
    const subtitleSelect = document.getElementById('video-subtitle');
    subtitleSelect.innerHTML = '<option value="">None (No subtitles)</option>';
    if (data.subtitles && data.subtitles.length > 0) {
        data.subtitles.forEach(sub => {
            const option = document.createElement('option');
            option.value = sub.code;
            option.innerText = sub.name;
            // Pre-select English subtitles
            if (sub.code === 'en' || sub.code.startsWith('en-') || sub.name.toLowerCase().includes('english')) {
                option.selected = true;
            }
            subtitleSelect.appendChild(option);
        });
    }

    details.style.display = 'block';
    details.scrollIntoView({ behavior: 'smooth' });
}

function formatDuration(seconds) {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const h = Math.floor(m / 60);
    const mins = m % 60;
    
    const formattedSecs = s < 10 ? `0${s}` : s;
    if (h > 0) {
        const formattedMins = mins < 10 ? `0${mins}` : mins;
        return `${h}:${formattedMins}:${formattedSecs}`;
    }
    return `${m}:${formattedSecs}`;
}

function downloadVideo() {
    if (!currentVideoData) return;

    const mediaTypeSelect = document.getElementById('video-media-type');
    const isAudio = mediaTypeSelect ? mediaTypeSelect.value === 'audio' : false;
    
    const qualitySelect = document.getElementById('video-quality');
    // If it's audio, quality is passed as bestaudio/best for yt-dlp backend
    const quality = isAudio ? 'bestaudio/best' : (qualitySelect ? qualitySelect.value : '');
    
    const subtitleSelect = document.getElementById('video-subtitle');
    const formatSelect = document.getElementById('video-format');
    
    const subtitle = subtitleSelect.value;
    const outFormat = formatSelect ? formatSelect.value : (isAudio ? 'mp3' : 'mp4');

    const bitrateSelect = document.getElementById('video-audio-bitrate');
    const audioBitrate = bitrateSelect ? bitrateSelect.value : '192';

    const randSuffix = Math.random().toString(36).substr(2, 5);
    const downloadId = `dl_vid_${Date.now()}_${randSuffix}`;
    const task = {
        id: downloadId,
        title: currentVideoData.title,
        thumbnail: currentVideoData.thumbnail,
        url: currentVideoData.url,
        quality: quality,
        format_type: isAudio ? 'audio' : 'video',
        out_format: outFormat,
        subtitle: subtitle,
        status: 'queued',
        progress: 0,
        speed: 'Pending...',
        eta: '--:--',
        error: null
    };

    downloadsStore[downloadId] = task;
    
    createDownloadCardUI(task);
    switchTab('downloads');

    window.pywebview.api.start_download(downloadId, task.url, {
        quality: quality,
        subtitle: subtitle || null,
        audio_bitrate: audioBitrate,
        format_type: isAudio ? 'audio' : 'video',
        out_format: outFormat,
        title: task.title,
        thumbnail: task.thumbnail
    }).then(res => {
        if (!res.success) {
            updateDownloadProgress(downloadId, 0, 'Error', '00:00', 'error', res.error);
            showToast("Failed to start download", "error");
        } else {
            updateBadgeCount(1);
            showToast("Download started", "info");
        }
    });
}

// --- PLAYLIST LOGIC ---
let currentPlaylistData = null;

function fetchPlaylist() {
    const urlInput = document.getElementById('playlist-url-input');
    const url = urlInput.value.trim();
    if (!url) {
        showToast("Please enter a valid Playlist URL", "warning");
        return;
    }

    const loader = document.getElementById('playlist-loading');
    const details = document.getElementById('playlist-details');
    
    loader.style.display = 'flex';
    details.style.display = 'none';

    window.pywebview.api.fetch_playlist_details(url).then(response => {
        loader.style.display = 'none';
        
        if (response.success) {
            currentPlaylistData = response.data;
            renderPlaylistDetails(response.data);
            showToast("Playlist loaded successfully", "success");
        } else {
            showToast(`Error: ${response.error}`, "error");
        }
    }).catch(err => {
        loader.style.display = 'none';
        showToast(`Unexpected error: ${err}`, "error");
    });
}

function renderPlaylistDetails(data) {
    const details = document.getElementById('playlist-details');
    
    document.getElementById('p-title').innerText = data.title;
    document.getElementById('p-author').innerText = data.uploader || 'Unknown Channel';
    document.getElementById('p-count').innerText = `${data.video_count} Videos`;

    // Save original videos order for default sorting
    if (!data.originalVideos) {
        data.originalVideos = [...data.videos];
    }
    
    // Reset sort select to default
    const sortSelect = document.getElementById('playlist-sort-select');
    if (sortSelect) sortSelect.value = 'default';

    renderPlaylistRows(data.videos);

    details.style.display = 'block';
    details.scrollIntoView({ behavior: 'smooth' });
}

function renderPlaylistRows(videos) {
    const listContainer = document.getElementById('playlist-items-list');
    listContainer.innerHTML = '';

    videos.forEach((video, index) => {
        // Try to preserve current checkbox status when sorting
        let isChecked = true;
        const existingChk = document.getElementById(`chk-v-${video.id}`);
        if (existingChk) {
            isChecked = existingChk.checked;
        }

        const row = document.createElement('div');
        row.className = 'playlist-row';
        row.innerHTML = `
            <input type="checkbox" class="row-check" id="chk-v-${video.id}" value="${video.url}" data-title="${video.title.replace(/"/g, '&quot;')}" ${isChecked ? 'checked' : ''} />
            <span class="row-index">${index + 1}</span>
            <span class="row-title" title="${video.title.replace(/"/g, '&quot;')}">${video.title}</span>
            <span class="row-duration">${formatDuration(video.duration)}</span>
        `;
        listContainer.appendChild(row);
    });
}

function sortPlaylist(criteria) {
    if (!currentPlaylistData || !currentPlaylistData.videos) return;

    let sortedVideos = [...currentPlaylistData.videos];

    switch (criteria) {
        case 'default':
            if (currentPlaylistData.originalVideos) {
                sortedVideos = [...currentPlaylistData.originalVideos];
            }
            break;
        case 'title-asc':
            sortedVideos.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title-desc':
            sortedVideos.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'duration-asc':
            sortedVideos.sort((a, b) => (a.duration || 0) - (b.duration || 0));
            break;
        case 'duration-desc':
            sortedVideos.sort((a, b) => (b.duration || 0) - (a.duration || 0));
            break;
    }

    currentPlaylistData.videos = sortedVideos;
    renderPlaylistRows(sortedVideos);
    showToast(`Playlist sorted by ${getCriteriaLabel(criteria)}`, "info");
}

function getCriteriaLabel(criteria) {
    switch (criteria) {
        case 'default': return "default order";
        case 'title-asc': return "Title (A-Z)";
        case 'title-desc': return "Title (Z-A)";
        case 'duration-asc': return "Duration (shortest)";
        case 'duration-desc': return "Duration (longest)";
        default: return criteria;
    }
}

function toggleAllPlaylist(checked) {
    document.querySelectorAll('.row-check').forEach(chk => {
        chk.checked = checked;
    });
}

function downloadSelectedPlaylistVideos() {
    if (!currentPlaylistData) return;

    const checkedBoxes = document.querySelectorAll('.row-check:checked');
    if (checkedBoxes.length === 0) {
        showToast("Please select at least one video to download", "warning");
        return;
    }

    const mediaTypeSelect = document.getElementById('p-media-type');
    const isAudio = mediaTypeSelect ? mediaTypeSelect.value === 'audio' : false;

    const qualitySelect = document.getElementById('p-quality');
    const quality = isAudio ? 'bestaudio/best' : (qualitySelect ? qualitySelect.value : 'bestvideo+bestaudio');
    
    const formatSelect = document.getElementById('p-format');
    const outFormat = formatSelect ? formatSelect.value : (isAudio ? 'mp3' : 'mp4');
    
    const subtitle = document.getElementById('p-subtitle').value;

    const bitrateSelect = document.getElementById('p-audio-bitrate');
    const audioBitrate = bitrateSelect ? bitrateSelect.value : '192';

    switchTab('downloads');
    showToast(`Queued ${checkedBoxes.length} downloads`, "info");

    checkedBoxes.forEach((chk, idx) => {
        const url = chk.value;
        const title = chk.getAttribute('data-title');
        const randSuffix = Math.random().toString(36).substr(2, 5);
        const downloadId = `dl_play_${Date.now()}_${idx}_${randSuffix}`;

        const task = {
            id: downloadId,
            title: title,
            thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600',
            url: url,
            quality: quality,
            format_type: isAudio ? 'audio' : 'video',
            out_format: outFormat,
            subtitle: subtitle,
            status: 'queued',
            progress: 0,
            speed: 'Queued...',
            eta: '--:--',
            error: null
        };

        downloadsStore[downloadId] = task;
        createDownloadCardUI(task);

        window.pywebview.api.start_download(downloadId, url, {
            quality: quality,
            subtitle: subtitle || null,
            audio_bitrate: audioBitrate,
            format_type: isAudio ? 'audio' : 'video',
            out_format: outFormat,
            title: title,
            thumbnail: task.thumbnail
        }).then(res => {
            if (!res.success) {
                updateDownloadProgress(downloadId, 0, 'Error', '00:00', 'error', res.error);
            } else {
                updateBadgeCount(1);
            }
        });
    });
}

// --- ACTIVE DOWNLOADS UI AND BINDINGS ---

function createDownloadCardUI(task) {
    const emptyState = document.getElementById('downloads-empty');
    if (emptyState) emptyState.style.display = 'none';

    const list = document.getElementById('active-downloads-list');
    if (document.getElementById(`card-${task.id}`)) return;

    const card = document.createElement('div');
    card.className = 'download-task-card';
    card.id = `card-${task.id}`;
    
    card.innerHTML = `
        <img class="task-thumb" src="${task.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300'}" alt="Thumbnail" />
        <div class="task-info">
            <div class="task-header" style="align-items: center;">
                <span class="task-title" title="${task.title.replace(/"/g, '&quot;')}">${task.title}</span>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <span class="task-badge badge-dl" id="badge-${task.id}">Queued</span>
                    <button class="btn-cancel" id="btn-cancel-${task.id}" onclick="cancelDownload('${task.id}')" title="Cancel Download">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <button class="btn-retry" id="btn-retry-${task.id}" onclick="retryDownload('${task.id}')" title="Retry Download" style="display: none; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); cursor: pointer; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 4px; padding: 3px; transition: all 0.2s;">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 4v6h-6"></path>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="progress-container">
                <div class="progress-bar" id="bar-${task.id}" style="width: 0%"></div>
            </div>
            <div class="task-meta">
                <span id="speed-${task.id}">${task.speed}</span>
                <div class="meta-stats">
                    <span id="percent-${task.id}">0%</span>
                    <span style="color: rgba(255,255,255,0.15)">|</span>
                    <span>ETA: <span id="eta-${task.id}">${task.eta}</span></span>
                </div>
            </div>
            <div class="raw-log-line" id="raw-log-${task.id}" style="font-family: monospace; color: rgba(255,255,255,0.45); font-size: 0.7rem; margin-top: 0.35rem; letter-spacing: -0.01em; white-space: pre; overflow: hidden; text-overflow: ellipsis; padding: 2px 6px; background: rgba(0,0,0,0.2); border-radius: 4px; border: 1px solid rgba(255,255,255,0.03);">[download] Queued...</div>
            <div class="error-msg-box" id="error-box-${task.id}" style="display: none; color: #ef4444; font-size: 0.75rem; margin-top: 0.25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
        </div>
    `;
    
    list.insertBefore(card, list.firstChild);
}

function cancelDownload(downloadId) {
    const cancelBtn = document.getElementById(`btn-cancel-${downloadId}`);
    if (cancelBtn) {
        cancelBtn.disabled = true;
        cancelBtn.style.opacity = 0.5;
    }
    
    window.pywebview.api.cancel_download(downloadId).then(res => {
        if (res.success) {
            showToast("Cancellation request sent", "warning");
        } else {
            showToast(`Cancellation error: ${res.error}`, "error");
        }
    });
}

function retryDownload(downloadId) {
    const task = downloadsStore[downloadId];
    if (!task) return;

    const retryBtn = document.getElementById(`btn-retry-${downloadId}`);
    const cancelBtn = document.getElementById(`btn-cancel-${downloadId}`);
    if (retryBtn) retryBtn.style.display = 'none';
    if (cancelBtn) {
        cancelBtn.style.display = 'flex';
        cancelBtn.disabled = false;
        cancelBtn.style.opacity = 1;
    }

    // Reset task state
    task.status = 'queued';
    task.progress = 0;
    task.speed = 'Pending...';
    task.eta = '--:--';
    task.error = null;

    updateDownloadProgress(downloadId, 0, 'Pending...', '--:--', 'queued');

    // Get current bitrate settings from video configuration if available
    const bitrateSelect = document.getElementById('video-audio-bitrate');
    const audioBitrate = bitrateSelect ? bitrateSelect.value : '192';

    window.pywebview.api.start_download(downloadId, task.url, {
        quality: task.quality,
        subtitle: task.subtitle || null,
        audio_bitrate: audioBitrate,
        format_type: task.format_type,
        out_format: task.out_format,
        title: task.title,
        thumbnail: task.thumbnail
    }).then(res => {
        if (!res.success) {
            updateDownloadProgress(downloadId, 0, 'Error', '00:00', 'error', res.error);
        } else {
            updateBadgeCount(1);
        }
    });
}

function updateDownloadProgress(downloadId, percent, speed, eta, status, errorMsg = '', sizeRatio = '', rawLog = '') {
    if (downloadsStore[downloadId]) {
        downloadsStore[downloadId].progress = percent;
        downloadsStore[downloadId].speed = speed;
        downloadsStore[downloadId].eta = eta;
        downloadsStore[downloadId].status = status;
        if (errorMsg) downloadsStore[downloadId].error = errorMsg;
        if (sizeRatio) downloadsStore[downloadId].sizeRatio = sizeRatio;
        if (rawLog) downloadsStore[downloadId].rawLog = rawLog;
    }

    let card = document.getElementById(`card-${downloadId}`);
    if (!card && downloadsStore[downloadId]) {
        createDownloadCardUI(downloadsStore[downloadId]);
        card = document.getElementById(`card-${downloadId}`);
    }

    const bar = document.getElementById(`bar-${downloadId}`);
    const speedTxt = document.getElementById(`speed-${downloadId}`);
    const percentTxt = document.getElementById(`percent-${downloadId}`);
    const etaTxt = document.getElementById(`eta-${downloadId}`);
    const badge = document.getElementById(`badge-${downloadId}`);
    const errBox = document.getElementById(`error-box-${downloadId}`);
    const cancelBtn = document.getElementById(`btn-cancel-${downloadId}`);
    const rawLogTxt = document.getElementById(`raw-log-${downloadId}`);

    if (bar) bar.style.width = `${percent}%`;
    if (percentTxt) percentTxt.innerText = `${percent}%`;
    
    if (speedTxt) {
        if (sizeRatio && status === 'downloading') {
            speedTxt.innerText = `${sizeRatio} @ ${speed}`;
        } else {
            speedTxt.innerText = speed;
        }
    }
    if (etaTxt) etaTxt.innerText = eta;

    if (rawLogTxt) {
        if (rawLog) {
            rawLogTxt.innerText = rawLog;
        } else if (status === 'completed') {
            rawLogTxt.innerText = '[download] 100% completed successfully';
        } else if (status === 'cancelled') {
            rawLogTxt.innerText = '[download] Cancelled by user';
        } else if (status === 'error') {
            rawLogTxt.innerText = `[download] Error: ${errorMsg}`;
        } else if (status === 'processing') {
            rawLogTxt.innerText = '[download] Finalizing/Merging...';
        }
    }

    if (errBox && status !== 'error') {
        errBox.style.display = 'none';
    }

    // Hide cancel button if download is finalized
    if (['completed', 'error', 'cancelled'].includes(status)) {
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        // Show retry button for failed downloads
        const retryBtn = document.getElementById(`btn-retry-${downloadId}`);
        if (retryBtn) {
            retryBtn.style.display = status === 'error' ? 'flex' : 'none';
        }
    }

    if (badge) {
        badge.innerText = status;
        badge.className = "task-badge";
        
        switch (status) {
            case 'downloading':
                badge.classList.add('badge-dl');
                badge.innerText = "Downloading";
                break;
            case 'processing':
                badge.classList.add('badge-proc');
                badge.innerText = "Merging";
                break;
            case 'completed':
                badge.classList.add('badge-comp');
                badge.innerText = "Finished";
                if (downloadsStore[downloadId] && downloadsStore[downloadId].active !== false) {
                    downloadsStore[downloadId].active = false;
                    updateBadgeCount(-1);
                    showToast(`"${downloadsStore[downloadId].title}" finished!`, "success");
                    loadDownloadHistory(); // Reload history ledger
                }
                break;
            case 'cancelled':
                badge.classList.add('badge-cancel');
                badge.innerText = "Cancelled";
                if (speedTxt) speedTxt.innerText = "Stopped";
                if (etaTxt) etaTxt.innerText = "--:--";
                if (downloadsStore[downloadId] && downloadsStore[downloadId].active !== false) {
                    downloadsStore[downloadId].active = false;
                    updateBadgeCount(-1);
                    showToast("Download cancelled", "warning");
                }
                break;
            case 'error':
                badge.classList.add('badge-err');
                badge.innerText = "Failed";
                if (downloadsStore[downloadId] && downloadsStore[downloadId].active !== false) {
                    downloadsStore[downloadId].active = false;
                    updateBadgeCount(-1);
                    showToast("Download failed", "error");
                }
                if (errBox) {
                    errBox.innerText = `Reason: ${errorMsg}`;
                    errBox.style.display = 'block';
                    errBox.title = errorMsg;
                }
                break;
        }
    }
}

function updateBadgeCount(diff) {
    activeDownloadsCount += diff;
    if (activeDownloadsCount < 0) activeDownloadsCount = 0;

    const badge = document.getElementById('downloads-badge');
    if (badge) {
        if (activeDownloadsCount > 0) {
            badge.innerText = activeDownloadsCount;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

function clearCompletedDownloads() {
    Object.keys(downloadsStore).forEach(id => {
        const task = downloadsStore[id];
        if (['completed', 'error', 'cancelled'].includes(task.status)) {
            const card = document.getElementById(`card-${id}`);
            if (card) card.remove();
            delete downloadsStore[id];
        }
    });

    const list = document.getElementById('active-downloads-list');
    const cards = list.querySelectorAll('.download-task-card');
    if (cards.length === 0) {
        const emptyState = document.getElementById('downloads-empty');
        if (emptyState) emptyState.style.display = 'flex';
    }
}

// --- ENGINE UPDATE LOGIC ---
function updateEngine() {
    const btn = document.getElementById('btn-update-engine');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Updating...";
    }
    window.pywebview.api.update_ytdlp().then(res => {
        if (!res.success) {
            showToast("Failed to initiate update process", "error");
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Update Engine";
            }
        }
    });
}

// Python-exposed engine update callback
function updateEngineStatus(status, message) {
    const label = document.getElementById('settings-engine-label');
    const btn = document.getElementById('btn-update-engine');
    
    if (label) label.innerText = message;
    
    if (status === 'success') {
        showToast("Downloader engine updated successfully!", "success");
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Update Engine";
        }
    } else if (status === 'error') {
        showToast(`Update Failed: ${message}`, "error");
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Update Engine";
        }
    } else if (status === 'updating') {
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Updating...";
        }
    }
}

// Handle Download Concurrency Change
function changeConcurrency(val) {
    window.pywebview.api.set_max_concurrent_downloads(parseInt(val)).then(res => {
        if (res.success) {
            const limitName = parseInt(val) === 1 ? 'Serial (1 at a time)' : `Parallel (${val} at a time)`;
            showToast(`Download concurrency set to: ${limitName}`, "success");
        } else {
            showToast(`Failed to set concurrency: ${res.error}`, "error");
        }
    });
}

// Handle Download Speed Limit Change
function changeSpeedLimit(val) {
    window.pywebview.api.set_speed_limit(val).then(res => {
        if (res.success) {
            const limitName = val === 'unlimited' ? 'Unlimited' : (val.endsWith('k') ? `${val.slice(0, -1)} KB/s` : `${val.slice(0, -1).toUpperCase()} MB/s`);
            showToast(`Download speed limit set to: ${limitName}`, "success");
        } else {
            showToast(`Failed to set speed limit: ${res.error}`, "error");
        }
    });
}

// Handle Concurrent Fragments Change
function changeConcurrentFragments(val) {
    window.pywebview.api.set_concurrent_fragments(parseInt(val)).then(res => {
        if (res.success) {
            const boostName = parseInt(val) === 1 ? 'Standard (1 fragment)' : (parseInt(val) === 3 ? 'Fast (3 fragments)' : 'Turbo (5 fragments)');
            showToast(`Speed boost set to: ${boostName}`, "success");
        } else {
            showToast(`Failed to set speed boost: ${res.error}`, "error");
        }
    });
}

// Check format and show/hide bitrate selector
function onMediaTypeChange() {
    const mediaTypeSelect = document.getElementById('video-media-type');
    const isAudio = mediaTypeSelect ? mediaTypeSelect.value === 'audio' : false;
    
    const formatSelect = document.getElementById('video-format');
    const audioGroup = document.getElementById('audio-bitrate-group');
    const qualityGroup = document.getElementById('video-quality-group');

    if (formatSelect) {
        formatSelect.innerHTML = '';
        if (isAudio) {
            // Audio options
            const options = [
                { value: 'mp3', text: 'MP3 (Universal)' },
                { value: 'm4a', text: 'M4A (High Quality)' },
                { value: 'flac', text: 'FLAC (Lossless Studio)' },
                { value: 'wav', text: 'WAV (Uncompressed)' }
            ];
            options.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.value;
                el.innerText = opt.text;
                formatSelect.appendChild(el);
            });
            // Show bitrate if MP3/M4A selected
            if (audioGroup) audioGroup.style.display = (formatSelect.value === 'mp3' || formatSelect.value === 'm4a') ? 'block' : 'none';
            if (qualityGroup) qualityGroup.style.display = 'none';
        } else {
            // Video options
            const options = [
                { value: 'mp4', text: 'MP4 (Universal)' },
                { value: 'mkv', text: 'MKV (Matroska)' },
                { value: 'webm', text: 'WebM (Open Video)' }
            ];
            options.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.value;
                el.innerText = opt.text;
                formatSelect.appendChild(el);
            });
            if (audioGroup) audioGroup.style.display = 'none';
            if (qualityGroup) qualityGroup.style.display = 'block';
        }
    }
}

function onVideoFormatChange() {
    const mediaTypeSelect = document.getElementById('video-media-type');
    const isAudio = mediaTypeSelect ? mediaTypeSelect.value === 'audio' : false;
    const formatSelect = document.getElementById('video-format');
    const group = document.getElementById('audio-bitrate-group');
    
    if (isAudio && group && formatSelect) {
        group.style.display = (formatSelect.value === 'mp3' || formatSelect.value === 'm4a') ? 'block' : 'none';
    }
}

function onPlaylistMediaTypeChange() {
    const mediaTypeSelect = document.getElementById('p-media-type');
    const isAudio = mediaTypeSelect ? mediaTypeSelect.value === 'audio' : false;
    
    const formatSelect = document.getElementById('p-format');
    const audioGroup = document.getElementById('p-audio-bitrate-group');
    const qualityGroup = document.getElementById('p-quality-group');

    if (formatSelect) {
        formatSelect.innerHTML = '';
        if (isAudio) {
            // Audio options
            const options = [
                { value: 'mp3', text: 'MP3' },
                { value: 'm4a', text: 'M4A' },
                { value: 'flac', text: 'FLAC' },
                { value: 'wav', text: 'WAV' }
            ];
            options.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.value;
                el.innerText = opt.text;
                formatSelect.appendChild(el);
            });
            if (audioGroup) audioGroup.style.display = (formatSelect.value === 'mp3' || formatSelect.value === 'm4a') ? 'block' : 'none';
            if (qualityGroup) qualityGroup.style.display = 'none';
        } else {
            // Video options
            const options = [
                { value: 'mp4', text: 'MP4' },
                { value: 'mkv', text: 'MKV' },
                { value: 'webm', text: 'WebM' }
            ];
            options.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.value;
                el.innerText = opt.text;
                formatSelect.appendChild(el);
            });
            if (audioGroup) audioGroup.style.display = 'none';
            if (qualityGroup) qualityGroup.style.display = 'block';
        }
    }
}

function onPlaylistFormatChange() {
    const mediaTypeSelect = document.getElementById('p-media-type');
    const isAudio = mediaTypeSelect ? mediaTypeSelect.value === 'audio' : false;
    const formatSelect = document.getElementById('p-format');
    const group = document.getElementById('p-audio-bitrate-group');

    if (isAudio && group && formatSelect) {
        group.style.display = (formatSelect.value === 'mp3' || formatSelect.value === 'm4a') ? 'block' : 'none';
    }
}

// Handle Theme Customization
function changeTheme(theme) {
    applyTheme(theme);
    window.pywebview.api.set_theme(theme).then(res => {
        if (res.success) {
            showToast(`Theme switched to: ${theme.charAt(0).toUpperCase() + theme.slice(1)}`, "success");
        }
    });
}

function applyTheme(theme) {
    document.body.className = `theme-${theme}`;
}

// Handle embedding tags toggles
function toggleEmbedMetadata(checked) {
    window.pywebview.api.set_embed_metadata(checked).then(res => {
        if (res.success) {
            showToast(checked ? "Metadata tags embedding enabled" : "Metadata tags embedding disabled", "success");
        }
    });
}

// Handle embedding cover thumbnail toggles
function toggleEmbedThumbnail(checked) {
    window.pywebview.api.set_embed_thumbnail(checked).then(res => {
        if (res.success) {
            showToast(checked ? "Cover thumbnail embedding enabled" : "Cover thumbnail embedding disabled", "success");
        }
    });
}

// Version 1.2 Settings Event Handlers
function toggleClipboardAuto(checked) {
    window.pywebview.api.set_clipboard_auto_detect(checked).then(res => {
        if (res.success) {
            showToast(checked ? "Clipboard monitoring enabled" : "Clipboard monitoring disabled", "success");
        }
    });
}

function updateCookiesFileDisplay() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.get_cookies_file().then(path => {
            const statusDiv = document.getElementById('settings-cookies-status');
            const clearBtn = document.getElementById('btn-clear-cookies');
            if (statusDiv) {
                if (path) {
                    statusDiv.innerText = `Active file: ${path}`;
                    statusDiv.style.color = "var(--accent)";
                    if (clearBtn) clearBtn.style.display = "inline-block";
                } else {
                    statusDiv.innerText = "No cookies file loaded.";
                    statusDiv.style.color = "rgba(255, 255, 255, 0.5)";
                    if (clearBtn) clearBtn.style.display = "none";
                }
            }
        });
    }
}

function browseCookiesFile() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.select_cookies_file().then(path => {
            updateCookiesFileDisplay();
            if (path) showToast("Cookies file loaded successfully", "success");
        });
    }
}

function clearCookiesFile() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.clear_cookies_file().then(() => {
            updateCookiesFileDisplay();
            showToast("Cookies file removed", "info");
        });
    }
}

// Clipboard Monitoring Functions
let lastClipboardCheckedUrl = "";
function checkClipboardForLink() {
    const chk = document.getElementById('settings-clipboard-auto');
    if (chk && !chk.checked) return; // Disabled

    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.get_clipboard_text().then(text => {
            if (!text) return;
            text = text.trim();
            if (text === lastClipboardCheckedUrl) return; // Already seen/analyzed/dismissed

            // Simple fast URL validation
            if (text.startsWith('http://') || text.startsWith('https://')) {
                // Check if it's supported
                window.pywebview.api.check_link_support(text).then(res => {
                    if (res && res.supported) {
                        showClipboardBanner(text);
                    }
                });
            }
        });
    }
}

function showClipboardBanner(url) {
    const banner = document.getElementById('clipboard-banner');
    const urlText = document.getElementById('clipboard-detected-url');
    if (banner && urlText) {
        urlText.innerText = url;
        banner.style.display = "block";
    }
}

function dismissClipboardBanner() {
    const banner = document.getElementById('clipboard-banner');
    if (banner) {
        banner.style.display = "none";
    }
    // Remember last url to not prompt again
    const urlText = document.getElementById('clipboard-detected-url');
    if (urlText) {
        lastClipboardCheckedUrl = urlText.innerText;
    }
}

function analyzeClipboardLink() {
    const urlText = document.getElementById('clipboard-detected-url');
    if (urlText) {
        const url = urlText.innerText;
        dismissClipboardBanner();
        // Detect if it is a playlist or video
        if (url.includes('playlist') || url.includes('list=')) {
            switchTab('playlist');
            document.getElementById('playlist-url-input').value = url;
            fetchPlaylist();
        } else {
            switchTab('video');
            document.getElementById('video-url-input').value = url;
            fetchVideo();
        }
    }
}

// Playlist Filters & Ranges
function togglePlaylistFiltersPanel() {
    const panel = document.getElementById('playlist-filters-panel');
    if (panel) {
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    }
}

function applyPlaylistFilters() {
    const startInput = document.getElementById('filter-range-start');
    const endInput = document.getElementById('filter-range-end');
    const textInput = document.getElementById('filter-title-text');

    const startVal = startInput && startInput.value ? parseInt(startInput.value) : 1;
    const endVal = endInput && endInput.value ? parseInt(endInput.value) : null;
    const searchText = textInput ? textInput.value.trim().toLowerCase() : "";

    const rows = document.querySelectorAll('#playlist-items-list .playlist-row');
    let matchedCount = 0;

    rows.forEach((row, idx) => {
        const checkbox = row.querySelector('.row-check');
        if (!checkbox) return;

        const indexSpan = row.querySelector('.row-index');
        const rowIndex = indexSpan ? parseInt(indexSpan.innerText) : (idx + 1);

        const titleSpan = row.querySelector('.row-title');
        const titleText = titleSpan ? titleSpan.innerText.toLowerCase() : "";

        // Check index range criteria
        let indexMatches = true;
        if (rowIndex < startVal) {
            indexMatches = false;
        }
        if (endVal !== null && rowIndex > endVal) {
            indexMatches = false;
        }

        // Check text search criteria
        let textMatches = true;
        if (searchText && !titleText.includes(searchText)) {
            textMatches = false;
        }

        const isMatch = indexMatches && textMatches;
        checkbox.checked = isMatch;
        if (isMatch) matchedCount++;
    });

    showToast(`Applied filters. Selected ${matchedCount} videos`, "success");
}

function resetPlaylistFilters() {
    const startInput = document.getElementById('filter-range-start');
    const endInput = document.getElementById('filter-range-end');
    const textInput = document.getElementById('filter-title-text');

    if (startInput) startInput.value = "";
    if (endInput) endInput.value = "";
    if (textInput) textInput.value = "";

    // Re-check all
    document.querySelectorAll('.row-check').forEach(chk => {
        chk.checked = true;
    });

    showToast("Filters reset. Selected all videos", "info");
}

// Saved Playlists Functions
function loadSavedPlaylists() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.get_saved_playlists().then(playlists => {
            renderSavedPlaylists(playlists);
        });
    }
}

function renderSavedPlaylists(playlists) {
    const container = document.getElementById('saved-playlists-list');
    if (!container) return;
    container.innerHTML = "";

    if (!playlists || playlists.length === 0) {
        container.innerHTML = `<p class="empty-state" style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No saved playlists yet. Analyze a playlist and click "Save Playlist" to store it here.</p>`;
        return;
    }

    playlists.forEach(p => {
        const row = document.createElement('div');
        row.className = "saved-playlist-row";
        row.onclick = () => {
            document.getElementById('playlist-url-input').value = p.url;
            switchTab('playlist');
            fetchPlaylist();
        };

        row.innerHTML = `
            <div class="saved-playlist-info">
                <span class="p-row-title">${escapeHTML(p.title)}</span>
                <span class="p-row-meta">${p.video_count} videos • by ${escapeHTML(p.uploader || 'Unknown')}</span>
            </div>
            <button class="btn btn-secondary btn-small" onclick="deleteSavedPlaylist(event, '${encodeURIComponent(p.url)}')" style="padding: 0.25rem 0.5rem; display: flex; align-items: center; justify-content: center;">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
        container.appendChild(row);
    });
}

function saveCurrentPlaylist() {
    if (!currentPlaylistData) return;
    if (window.pywebview && window.pywebview.api) {
        const playlistItem = {
            url: currentPlaylistData.url,
            title: currentPlaylistData.title,
            video_count: currentPlaylistData.video_count,
            uploader: currentPlaylistData.uploader || 'Unknown'
        };
        window.pywebview.api.save_playlist(playlistItem).then(res => {
            if (res.success) {
                showToast("Playlist saved to library", "success");
                loadSavedPlaylists();
            } else {
                showToast("Failed to save playlist", "error");
            }
        });
    }
}

function deleteSavedPlaylist(event, urlEncoded) {
    event.stopPropagation(); // Prevent loading the playlist
    const url = decodeURIComponent(urlEncoded);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.delete_saved_playlist(url).then(res => {
            if (res.success) {
                showToast("Playlist removed from library", "info");
                loadSavedPlaylists();
            }
        });
    }
}

// Download History Functions
function loadDownloadHistory() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.get_download_history().then(history => {
            renderDownloadHistory(history);
        });
    }
}

function renderDownloadHistory(history) {
    const container = document.getElementById('history-downloads-list');
    const emptyState = document.getElementById('history-empty');
    if (!container) return;
    
    container.innerHTML = "";

    if (!history || history.length === 0) {
        if (emptyState) {
            container.appendChild(emptyState);
            emptyState.style.display = "block";
        } else {
            container.innerHTML = `
                <div class="empty-state" id="history-empty">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M12 8v4l3 3" />
                        <circle cx="12" cy="12" r="10" />
                    </svg>
                    <h3>Library is empty</h3>
                    <p>Your completed downloads will appear here persistently.</p>
                </div>`;
        }
        return;
    }

    history.forEach(item => {
        const row = document.createElement('div');
        row.className = "history-row";

        const formattedTime = new Date(item.timestamp * 1000).toLocaleString();
        const thumbnail = item.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=200';
        
        row.innerHTML = `
            <img src="${thumbnail}" class="history-thumbnail" onerror="this.src='https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=200'" />
            <div class="history-meta">
                <span class="history-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
                <span class="history-meta-sub">${item.format.toUpperCase()} • ${item.file_size || 'Unknown size'} • ${formattedTime}</span>
            </div>
            <div class="history-actions">
                <button class="btn btn-primary btn-small" onclick="openHistoryFile('${encodeURIComponent(item.filepath)}')" title="Play / Open File" style="padding: 0.35rem 0.5rem; display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </button>
                <button class="btn btn-secondary btn-small" onclick="showHistoryFileInFolder('${encodeURIComponent(item.filepath)}')" title="Show in Folder" style="padding: 0.35rem 0.5rem; display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
                <button class="btn btn-secondary btn-small" onclick="deleteHistoryItem(event, '${encodeURIComponent(item.filepath)}')" title="Remove from list" style="padding: 0.35rem 0.5rem; display: flex; align-items: center; justify-content: center;">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;
        container.appendChild(row);
    });
}

function openHistoryFile(filepathEncoded) {
    const filepath = decodeURIComponent(filepathEncoded);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.open_file(filepath).then(res => {
            if (!res.success) showToast(res.error, "error");
        });
    }
}

function showHistoryFileInFolder(filepathEncoded) {
    const filepath = decodeURIComponent(filepathEncoded);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.show_in_folder(filepath).then(res => {
            if (!res.success) showToast(res.error, "error");
        });
    }
}

function deleteHistoryItem(event, filepathEncoded) {
    event.stopPropagation();
    const filepath = decodeURIComponent(filepathEncoded);
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.delete_history_item(filepath).then(res => {
            if (res.success) {
                showToast("Removed from history", "info");
                loadDownloadHistory();
            }
        });
    }
}

function clearHistoryLedger() {
    if (confirm("Are you sure you want to clear your download library history? (This will not delete the actual files on your disk)")) {
        if (window.pywebview && window.pywebview.api) {
            window.pywebview.api.clear_history().then(res => {
                if (res.success) {
                    showToast("Library history cleared", "info");
                    loadDownloadHistory();
                }
            });
        }
    }
}

// Helper to escape HTML characters
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Live Bandwidth Graphing Code
const speedHistory = [];
const maxHistoryPoints = 30;

// Initialize speed history with zeros
for (let i = 0; i < maxHistoryPoints; i++) {
    speedHistory.push(0);
}

function parseSpeedString(speedStr) {
    if (!speedStr) return 0;
    speedStr = speedStr.trim().toLowerCase();
    if (speedStr.includes('pending') || speedStr.includes('queued') || speedStr.includes('stopped') || speedStr.includes('merging') || speedStr.includes('completed')) return 0;
    
    const match = speedStr.match(/([0-9.]+)\s*(kb\/s|mb\/s|b\/s)/);
    if (!match) return 0;
    
    const value = parseFloat(match[1]);
    const unit = match[2];
    
    if (unit === 'mb/s') {
        return value * 1024 * 1024;
    } else if (unit === 'kb/s') {
        return value * 1024;
    } else {
        return value;
    }
}

function formatSpeedLocal(speed_bytes) {
    if (!speed_bytes) return "0 KB/s";
    if (speed_bytes < 1024) {
        return `${speed_bytes.toFixed(0)} B/s`;
    } else if (speed_bytes < 1024 * 1024) {
        return `${(speed_bytes / 1024).toFixed(1)} KB/s`;
    } else {
        return `${(speed_bytes / (1024 * 1024)).toFixed(1)} MB/s`;
    }
}

function drawBandwidthChart() {
    const canvas = document.getElementById('bandwidth-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.parentElement.clientWidth;
    const height = canvas.height = canvas.parentElement.clientHeight;

    ctx.clearRect(0, 0, width, height);

    const maxVal = Math.max(...speedHistory, 1024 * 1024); // min 1MB/s scale

    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7f00ff';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(127, 0, 255, 0.12)');
    gradient.addColorStop(1, 'rgba(127, 0, 255, 0)');

    ctx.beginPath();
    
    const step = width / (maxHistoryPoints - 1);
    
    for (let i = 0; i < maxHistoryPoints; i++) {
        const x = i * step;
        const y = height - (speedHistory[i] / maxVal) * (height - 6) - 3;
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw compact informative speed overlays
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '9px system-ui, -apple-system, sans-serif';
    ctx.textBaseline = 'top';
    
    const currentSpeed = speedHistory[speedHistory.length - 1];
    const peakSpeed = Math.max(...speedHistory);
    
    ctx.fillText(`Live: ${formatSpeedLocal(currentSpeed)}`, 4, 2);
    ctx.fillText(`Peak: ${formatSpeedLocal(peakSpeed)}`, width - 68, 2);
}

// Bandwidth check interval
setInterval(() => {
    let totalSpeed = 0;
    Object.keys(downloadsStore).forEach(id => {
        const task = downloadsStore[id];
        if (task.status === 'downloading') {
            totalSpeed += parseSpeedString(task.speed);
        }
    });

    speedHistory.push(totalSpeed);
    if (speedHistory.length > maxHistoryPoints) {
        speedHistory.shift();
    }
    
    drawBandwidthChart();
}, 800);

// Window control API wrappers
function minimizeWindow() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.minimize_window();
    }
}

function toggleMaximizeWindow() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.toggle_maximize_window();
    }
}

function closeWindow() {
    if (window.pywebview && window.pywebview.api) {
        window.pywebview.api.close_window();
    }
}
