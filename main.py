import os
import sys
import subprocess

# Patch subprocess.Popen globally on Windows to prevent console windows from flashing/opening
if sys.platform == 'win32':
    _original_popen_init = subprocess.Popen.__init__
    def _patched_popen_init(self, *args, **kwargs):
        creationflags = kwargs.get('creationflags', 0)
        kwargs['creationflags'] = creationflags | subprocess.CREATE_NO_WINDOW
        _original_popen_init(self, *args, **kwargs)
    subprocess.Popen.__init__ = _patched_popen_init

# Hide console window immediately on Windows startup if frozen as a PyInstaller executable
if sys.platform == 'win32' and getattr(sys, 'frozen', False):
    try:
        import ctypes
        kernel32 = ctypes.WinDLL('kernel32')
        user32 = ctypes.WinDLL('user32')
        hWnd = kernel32.GetConsoleWindow()
        if hWnd:
            # SW_HIDE = 0
            user32.ShowWindow(hWnd, 0)
    except Exception:
        pass

# Safely stub stdin/stdout/stderr if they are None or invalid (typical for Windows windowed apps using console=False)
class DummyStream:
    def write(self, *args, **kwargs): pass
    def flush(self, *args, **kwargs): pass
    def read(self, *args, **kwargs): return ""
    def readline(self, *args, **kwargs): return ""
    def isatty(self): return False
    @property
    def encoding(self): return "utf-8"

if sys.stdout is None or getattr(sys.stdout, 'write', None) is None:
    sys.stdout = DummyStream()
if sys.stderr is None or getattr(sys.stderr, 'write', None) is None:
    sys.stderr = DummyStream()
if sys.stdin is None or getattr(sys.stdin, 'read', None) is None:
    sys.stdin = DummyStream()

# Prepend updates directory to sys.path if it exists to load dynamic yt-dlp upgrades
updates_dir = os.path.join(os.path.expanduser('~'), '.btk_ytube_downloader', 'updates')
if os.path.exists(updates_dir):
    sys.path.insert(0, updates_dir)

import json
import time
import webview
import threading
import subprocess
from downloader import YTDownloader

# Custom Exception for Cancellation
class DownloadCancelled(Exception):
    pass

# API class that will be exposed to JavaScript
class YTDownloaderAPI:
    def __init__(self):
        self._downloader = YTDownloader()
        self._window = None
        self._active_downloads = {} # key: download_id, value: thread
        self._cancelled_downloads = set() # key: download_id
        
        # Concurrency queue state
        self._download_queue = []
        self._running_downloads = {}
        self._queue_lock = threading.Lock()
        self._max_concurrent_downloads = 1 # Default: Serial queue
        self._speed_limit = 'unlimited'
        self._concurrent_fragments = 3
        
        # Version 1.1 Custom Settings
        self._embed_metadata = False
        self._embed_thumbnail = False
        self._theme = 'cyberpunk'
        
        # Version 1.2 Custom Settings
        self._cookies_file = ''
        self._clipboard_auto_detect = True
        
        # Resolve application directory (works for both source run and PyInstaller bundle)
        if getattr(sys, 'frozen', False):
            self._app_dir = os.path.dirname(sys.executable)
        else:
            self._app_dir = os.path.dirname(os.path.abspath(__file__))
            
        # Resolve config directory in user profile for permission-safe storage
        self._config_dir = os.path.join(os.path.expanduser('~'), '.btk_ytube_downloader')
        try:
            os.makedirs(self._config_dir, exist_ok=True)
        except Exception:
            pass
            
        self._config_path = os.path.join(self._config_dir, 'config.json')
        self._download_dir = os.path.join(os.path.expanduser('~'), 'Downloads', 'BTK YTube Downloader')
        self.load_config()
        
        # Ensure default download directory exists
        try:
            if not os.path.exists(self._download_dir):
                os.makedirs(self._download_dir, exist_ok=True)
        except Exception:
            pass

        # Pre-cache yt-dlp extractors in background to eliminate UI lag during validation
        self._extractors = []
        threading.Thread(target=self._load_extractors, daemon=True).start()

    def _load_extractors(self):
        try:
            import yt_dlp
            from yt_dlp.extractor import gen_extractors
            self._extractors = list(gen_extractors())
        except Exception as e:
            print(f"Error loading extractors: {e}")

    def set_window(self, window):
        self._window = window

    def _evaluate_js(self, script):
        if self._window:
            try:
                self._window.evaluate_js(script)
            except Exception as e:
                print(f"Error evaluating JS: {e}")

    def load_config(self):
        """
        Loads configuration from config.json.
        """
        # Migrate old config if present in app_dir and not in config_dir
        old_config_path = os.path.join(self._app_dir, 'config.json')
        if not os.path.exists(self._config_path) and os.path.exists(old_config_path):
            try:
                import shutil
                shutil.copy(old_config_path, self._config_path)
            except Exception:
                pass

        if os.path.exists(self._config_path):
            try:
                with open(self._config_path, 'r', encoding='utf-8') as f:
                    config = json.load(f)
                    self._download_dir = config.get('download_dir', self._download_dir)
                    self._max_concurrent_downloads = config.get('max_concurrent_downloads', self._max_concurrent_downloads)
                    self._speed_limit = config.get('speed_limit', self._speed_limit)
                    self._concurrent_fragments = config.get('concurrent_fragments', self._concurrent_fragments)
                    self._embed_metadata = config.get('embed_metadata', self._embed_metadata)
                    self._embed_thumbnail = config.get('embed_thumbnail', self._embed_thumbnail)
                    self._theme = config.get('theme', self._theme)
                    self._cookies_file = config.get('cookies_file', '')
                    self._clipboard_auto_detect = config.get('clipboard_auto_detect', True)
            except Exception as e:
                print(f"Error loading config: {e}")

    def save_config(self):
        """
        Saves current configuration to config.json.
        """
        try:
            with open(self._config_path, 'w', encoding='utf-8') as f:
                json.dump({
                    'download_dir': self._download_dir,
                    'max_concurrent_downloads': self._max_concurrent_downloads,
                    'speed_limit': self._speed_limit,
                    'concurrent_fragments': self._concurrent_fragments,
                    'embed_metadata': self._embed_metadata,
                    'embed_thumbnail': self._embed_thumbnail,
                    'theme': self._theme,
                    'cookies_file': self._cookies_file,
                    'clipboard_auto_detect': self._clipboard_auto_detect
                }, f, indent=4)
        except Exception as e:
            print(f"Error saving config: {e}")

    def get_max_concurrent_downloads(self):
        return self._max_concurrent_downloads

    def set_max_concurrent_downloads(self, val):
        try:
            self._max_concurrent_downloads = int(val)
            self.save_config()
            self._process_queue()
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_speed_limit(self):
        return self._speed_limit

    def set_speed_limit(self, val):
        self._speed_limit = str(val)
        self.save_config()
        return {'success': True}

    def get_concurrent_fragments(self):
        return self._concurrent_fragments

    def set_concurrent_fragments(self, val):
        try:
            self._concurrent_fragments = int(val)
            self.save_config()
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def get_embed_metadata(self):
        return self._embed_metadata

    def set_embed_metadata(self, val):
        self._embed_metadata = bool(val)
        self.save_config()
        return {'success': True}

    def get_embed_thumbnail(self):
        return self._embed_thumbnail

    def set_embed_thumbnail(self, val):
        self._embed_thumbnail = bool(val)
        self.save_config()
        return {'success': True}

    def get_theme(self):
        return self._theme

    def set_theme(self, val):
        self._theme = str(val)
        self.save_config()
        return {'success': True}

    def get_default_download_dir(self):
        return self._download_dir

    def select_download_dir(self):
        """
        Opens a folder selection dialog, saves it, and returns the path.
        """
        if not self._window:
            return self._download_dir
            
        result = self._window.create_file_dialog(webview.FileDialog.FOLDER)
        if result and len(result) > 0:
            self._download_dir = result[0]
            self.save_config()
            return self._download_dir
        return self._download_dir

    def check_ffmpeg(self):
        """
        Checks if ffmpeg is available.
        """
        path = self._downloader.get_ffmpeg_path()
        return {
            'available': path is not None,
            'path': path if path else "Not Found"
        }

    def check_link_support(self, url):
        """
        Performs a fast local check to see if the URL is supported by a specific yt-dlp extractor.
        """
        if not url:
            return {
                'success': True,
                'supported': False,
                'extractor': None,
                'reason': ''
            }
            
        url = url.strip()
        if not (url.startswith('http://') or url.startswith('https://')):
            return {
                'success': True,
                'supported': False,
                'extractor': None,
                'reason': 'Link must start with http:// or https://'
            }
            
        try:
            # If extractors are not loaded yet, load them synchronously
            extractors = self._extractors
            if not extractors:
                import yt_dlp
                from yt_dlp.extractor import gen_extractors
                extractors = list(gen_extractors())
                self._extractors = extractors
            
            for extractor in extractors:
                if extractor.suitable(url) and extractor.IE_NAME != 'generic':
                    # Friendly name formatting
                    friendly_name = extractor.IE_NAME.replace('IE', '').capitalize()
                    return {
                        'success': True,
                        'supported': True,
                        'extractor': friendly_name,
                        'reason': f"Link recognized: {friendly_name}"
                    }
            
            return {
                'success': True,
                'supported': False,
                'extractor': None,
                'reason': "Unsupported website link. (Downloads may fail)"
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def get_engine_version(self):
        """
        Retrieves the version of yt-dlp.
        """
        try:
            import yt_dlp
            return yt_dlp.version.__version__
        except Exception:
            return "Unknown"

    def fetch_video_details(self, url):
        """
        Fetches single video details.
        """
        try:
            return {
                'success': True,
                'data': self._downloader.fetch_video_details(url)
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def fetch_playlist_details(self, url):
        """
        Fetches playlist details.
        """
        try:
            info = self._downloader.fetch_info(url)
            if not info:
                return {
                    'success': False,
                    'error': 'Could not extract playlist information.'
                }
            if 'entries' not in info:
                return {
                    'success': False,
                    'error': 'This URL appears to be a single video, not a playlist.'
                }
            
            videos = []
            for entry in info['entries']:
                if entry:
                    videos.append({
                        'id': entry.get('id'),
                        'title': entry.get('title', 'Unknown Title'),
                        'duration': entry.get('duration'),
                        'url': entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id')}"
                    })
            
            return {
                'success': True,
                'data': {
                    'title': info.get('title'),
                    'uploader': info.get('uploader') or info.get('playlist_uploader'),
                    'video_count': len(videos),
                    'videos': videos,
                    'url': url
                }
            }
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }

    def start_download(self, download_id, url, options):
        """
        Adds a video download task to the queue and processes it.
        """
        with self._queue_lock:
            # Check if already active or queued
            if download_id in self._running_downloads or any(item[0] == download_id for item in self._download_queue):
                return {'success': False, 'error': 'Download already active or queued.'}
                
            options['download_dir'] = self._download_dir
            options['speed_limit'] = self._speed_limit
            options['concurrent_fragments'] = self._concurrent_fragments
            options['embed_metadata'] = self._embed_metadata
            options['embed_thumbnail'] = self._embed_thumbnail
            options['cookies_file'] = self._cookies_file
            
            if download_id in self._cancelled_downloads:
                self._cancelled_downloads.remove(download_id)

            # Append to the queue
            self._download_queue.append((download_id, url, options))

        self._process_queue()
        return {'success': True}

    def cancel_download(self, download_id):
        """
        Cancels a running or queued download task.
        """
        with self._queue_lock:
            # 1. Check if running
            if download_id in self._running_downloads:
                self._cancelled_downloads.add(download_id)
                return {'success': True}

            # 2. Check if in queue
            for item in self._download_queue:
                if item[0] == download_id:
                    self._download_queue.remove(item)
                    # Notify frontend immediately
                    self._evaluate_js(f"updateDownloadProgress({json.dumps(download_id)}, 0, 'Stopped', '00:00', 'cancelled', '', '', {json.dumps('[download] Cancelled by user')})")
                    return {'success': True}
                    
        return {'success': False, 'error': 'Download task not found.'}

    def _process_queue(self):
        """
        Processes queued downloads up to the max concurrency limit.
        """
        with self._queue_lock:
            while len(self._running_downloads) < self._max_concurrent_downloads and self._download_queue:
                download_id, url, options = self._download_queue.pop(0)
                
                thread = threading.Thread(
                    target=self._download_worker,
                    args=(download_id, url, options),
                    daemon=True
                )
                self._running_downloads[download_id] = thread
                self._active_downloads[download_id] = thread # Keep for UI callbacks
                thread.start()

    def _download_worker(self, download_id, url, options):
        """
        Worker thread for download.
        """
        last_file_path = [None] # Mutable container to share with hook

        def format_speed(speed_bytes):
            if not speed_bytes:
                return "0 KB/s"
            if speed_bytes < 1024:
                return f"{speed_bytes:.0f} B/s"
            elif speed_bytes < 1024 * 1024:
                return f"{speed_bytes / 1024:.1f} KB/s"
            else:
                return f"{speed_bytes / (1024 * 1024):.1f} MB/s"

        def format_bytes_local(bytes_num):
            if not bytes_num:
                return "0.0 MB"
            if bytes_num < 1024 * 1024:
                return f"{bytes_num / 1024:.1f} KB"
            elif bytes_num < 1024 * 1024 * 1024:
                return f"{bytes_num / (1024 * 1024):.1f} MB"
            else:
                return f"{bytes_num / (1024 * 1024 * 1024):.1f} GB"

        def format_eta(eta_secs):
            if not eta_secs:
                return "--:--"
            m, s = divmod(int(eta_secs), 60)
            h, m = divmod(m, 60)
            if h > 0:
                return f"{h:02d}:{m:02d}:{s:02d}"
            return f"{m:02d}:{s:02d}"

        def progress_hook(d):
            # Check for cancellation first
            if download_id in self._cancelled_downloads:
                raise DownloadCancelled("Download cancelled by user")

            status = d.get('status')
            
            # Track file path for cleanup
            if d.get('filename'):
                last_file_path[0] = d.get('filename')

            if status == 'downloading':
                total = d.get('total_bytes') or d.get('total_bytes_estimate') or 0
                downloaded = d.get('downloaded_bytes', 0)
                percent = (downloaded / total * 100) if total > 0 else 0
                
                speed = d.get('speed')
                speed_str = format_speed(speed)
                
                eta = d.get('eta')
                eta_str = format_eta(eta)
                
                # Format size ratio
                downloaded_str = format_bytes_local(downloaded)
                total_str = format_bytes_local(total) if total > 0 else "Unknown"
                size_ratio_str = f"{downloaded_str} of {total_str}" if downloaded > 0 else ""
                
                # Format raw yt-dlp log line
                percent_str_raw = d.get('_percent_str')
                if not percent_str_raw:
                    percent_str_raw = f" {percent:5.1f}%"
                
                total_str_raw = d.get('_total_bytes_str') or d.get('_total_bytes_estimate_str') or total_str
                speed_str_raw = d.get('_speed_str') or f"  {speed_str}"
                eta_str_raw = d.get('_eta_str') or eta_str
                raw_log = f"[download] {percent_str_raw} of {total_str_raw} at {speed_str_raw} ETA {eta_str_raw}"
                
                self._evaluate_js(
                    f"updateDownloadProgress({json.dumps(download_id)}, {percent:.1f}, {json.dumps(speed_str)}, {json.dumps(eta_str)}, 'downloading', '', {json.dumps(size_ratio_str)}, {json.dumps(raw_log)})"
                )
            elif status == 'finished':
                raw_log = "[download] 100% finished downloading, post-processing..."
                self._evaluate_js(
                    f"updateDownloadProgress({json.dumps(download_id)}, 100, 'Merging/Finalizing...', '00:00', 'processing', '', '', {json.dumps(raw_log)})"
                )

        try:
            self._downloader.download(url, options, progress_hook)
            
            # Format size of completed file
            file_size_str = ""
            filepath = last_file_path[0]
            if filepath:
                # If the file exists, it's correct
                if not os.path.exists(filepath):
                    # Try replacing extension with the target format
                    base, ext = os.path.splitext(filepath)
                    format_type = options.get('format_type', 'video')
                    out_format = options.get('out_format', 'mp3' if format_type == 'audio' else 'mp4')
                    target_filepath = f"{base}.{out_format}"
                    if os.path.exists(target_filepath):
                        filepath = target_filepath
                    else:
                        # Fallback: check if any file with the same base name exists (since extensions can vary)
                        parent_dir = os.path.dirname(filepath)
                        base_name = os.path.basename(base)
                        if os.path.exists(parent_dir):
                            for f in os.listdir(parent_dir):
                                if f.startswith(base_name) and not f.endswith('.part') and not f.endswith('.ytdl'):
                                    filepath = os.path.join(parent_dir, f)
                                    break
                
                try:
                    if os.path.exists(filepath):
                        size_bytes = os.path.getsize(filepath)
                        file_size_str = format_bytes_local(size_bytes)
                except Exception:
                    pass
            
            # Save to history
            history_item = {
                'id': download_id,
                'title': options.get('title', 'Unknown Title'),
                'url': url,
                'filepath': filepath or "",
                'thumbnail': options.get('thumbnail', ''),
                'timestamp': int(time.time()),
                'format': options.get('out_format', 'mp3' if options.get('format_type') == 'audio' else 'mp4'),
                'file_size': file_size_str
            }
            self.add_to_history(history_item)
            
            self._evaluate_js(f"updateDownloadProgress({json.dumps(download_id)}, 100, 'Completed', '00:00', 'completed', '', '', {json.dumps('[download] 100% completed successfully')})")
        except DownloadCancelled:
            # Handle cancellation cleanup
            self._evaluate_js(f"updateDownloadProgress({json.dumps(download_id)}, 0, 'Cancelled', '00:00', 'cancelled', '', '', {json.dumps('[download] Cancelled by user')})")
            
            # Attempt to clean up unfinished file and temporary parts
            if last_file_path[0]:
                filepath = last_file_path[0]
                partpath = filepath + '.part'
                
                # Delete files safely
                for path in [filepath, partpath]:
                    try:
                        if os.path.exists(path):
                            os.remove(path)
                    except Exception:
                        pass
        except Exception as e:
            self._evaluate_js(f"updateDownloadProgress({json.dumps(download_id)}, 0, 'Error', '00:00', 'error', {json.dumps(str(e))}, '', {json.dumps(f'[download] Error: {str(e)}')})")
        finally:
            with self._queue_lock:
                # Clean up active and running downloads
                if download_id in self._running_downloads:
                    del self._running_downloads[download_id]
                if download_id in self._active_downloads:
                    del self._active_downloads[download_id]
                if download_id in self._cancelled_downloads:
                    self._cancelled_downloads.remove(download_id)
                
            # Trigger queue processing to start next video
            self._process_queue()

    def update_ytdlp(self):
        """
        Starts background engine update.
        """
        thread = threading.Thread(target=self._update_worker, daemon=True)
        thread.start()
        return {'success': True}

    def _update_worker(self):
        """
        Updates yt-dlp library.
        If running as a frozen PyInstaller binary, downloads and extracts the latest wheel package from PyPI.
        If running in source/dev mode, runs pip install --upgrade.
        """
        self._evaluate_js("updateEngineStatus('updating', 'Checking for updates...')")
        
        if getattr(sys, 'frozen', False):
            try:
                import urllib.request
                import zipfile
                import io
                import shutil
                import yt_dlp

                current_version = yt_dlp.version.__version__
                
                # Fetch PyPI info
                req = urllib.request.Request(
                    'https://pypi.org/pypi/yt-dlp/json',
                    headers={'User-Agent': 'Mozilla/5.0'}
                )
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode('utf-8'))
                
                latest_version = data['info']['version']
                
                if latest_version == current_version:
                    self._evaluate_js(f"updateEngineStatus('success', {json.dumps(f'Engine is already up to date (v{current_version})')})")
                    return

                # Find the wheel url
                wheel_url = None
                for url_info in data['urls']:
                    if url_info['packagetype'] == 'bdist_wheel':
                        wheel_url = url_info['url']
                        break
                
                if not wheel_url:
                    self._evaluate_js("updateEngineStatus('error', 'Could not find wheel package on PyPI.')")
                    return

                # Download the wheel
                self._evaluate_js(f"updateEngineStatus('updating', 'Downloading v{latest_version}...')")
                with urllib.request.urlopen(wheel_url) as whl_response:
                    zip_data = whl_response.read()

                # Extract to updates folder
                updates_parent = os.path.join(os.path.expanduser('~'), '.btk_ytube_downloader')
                updates_dir = os.path.join(updates_parent, 'updates')
                
                # Clean and recreate updates directory
                if os.path.exists(updates_dir):
                    try:
                        shutil.rmtree(updates_dir)
                    except Exception:
                        pass
                os.makedirs(updates_dir, exist_ok=True)

                # Unzip the wheel and extract only the 'yt_dlp' package folder
                with zipfile.ZipFile(io.BytesIO(zip_data)) as zip_ref:
                    for file in zip_ref.namelist():
                        if file.startswith('yt_dlp/'):
                            zip_ref.extract(file, updates_dir)
                
                self._evaluate_js(f"updateEngineStatus('success', {json.dumps(f'Engine updated to v{latest_version}. Please restart to apply.')})")
            except Exception as e:
                self._evaluate_js(f"updateEngineStatus('error', {json.dumps(f'Update failed: {str(e)}')})")
            return

        # Dev mode: Resolve virtual environment python interpreter path
        if sys.platform == 'win32':
            venv_python = os.path.join(self._app_dir, '.venv', 'Scripts', 'python.exe')
        else:
            venv_python = os.path.join(self._app_dir, '.venv', 'bin', 'python')
            
        if not os.path.exists(venv_python):
            venv_python = sys.executable

        try:
            # Run pip upgrade subprocess quietly
            process = subprocess.run(
                [venv_python, '-m', 'pip', 'install', '--upgrade', 'yt-dlp'],
                capture_output=True,
                text=True,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )
            
            if process.returncode == 0:
                # Retrieve updated version info
                version_proc = subprocess.run(
                    [venv_python, '-c', "import yt_dlp; print(yt_dlp.version.__version__)"],
                    capture_output=True,
                    text=True,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
                )
                version_str = version_proc.stdout.strip() if version_proc.returncode == 0 else "Latest"
                self._evaluate_js(f"updateEngineStatus('success', {json.dumps(f'Engine updated to v{version_str}')})")
            else:
                self._evaluate_js(f"updateEngineStatus('error', {json.dumps(f'Update failed: {process.stderr.strip()}')})")
        except Exception as e:
            self._evaluate_js(f"updateEngineStatus('error', {json.dumps(f'Update failed: {str(e)}')})")

    def minimize_window(self):
        if self._window:
            self._window.minimize()

    def toggle_maximize_window(self):
        if self._window:
            if getattr(self, '_is_maximized', False):
                self._window.restore()
                self._is_maximized = False
            else:
                self._window.maximize()
                self._is_maximized = True

    def close_window(self):
        if self._window:
            self._window.destroy()

    # --- VERSION 1.2 NEW APIS ---
    
    def get_clipboard_text(self):
        try:
            import clr
            clr.AddReference("System")
            from System.Threading import Thread, ThreadStart, ApartmentState
            
            result = [""]
            def run_in_sta():
                try:
                    clr.AddReference("System.Windows.Forms")
                    from System.Windows.Forms import Clipboard
                    if Clipboard.ContainsText():
                        result[0] = Clipboard.GetText()
                except Exception as e:
                    print(f"Error in STA clipboard read: {e}")
            
            t = Thread(ThreadStart(run_in_sta))
            t.SetApartmentState(ApartmentState.STA)
            t.Start()
            t.Join()
            return result[0]
        except Exception as e:
            print(f"Error reading clipboard: {e}")
            return ""

    def get_clipboard_auto_detect(self):
        return self._clipboard_auto_detect

    def set_clipboard_auto_detect(self, val):
        self._clipboard_auto_detect = bool(val)
        self.save_config()
        return {'success': True}

    def select_cookies_file(self):
        if not self._window:
            return self._cookies_file
        result = self._window.create_file_dialog(webview.OPEN_DIALOG, file_types=('Text Files (*.txt)', 'All Files (*.*)'))
        if result and len(result) > 0:
            self._cookies_file = result[0]
            self.save_config()
            return self._cookies_file
        return self._cookies_file

    def clear_cookies_file(self):
        self._cookies_file = ''
        self.save_config()
        return ''

    def get_cookies_file(self):
        return self._cookies_file

    # History Helper Methods
    def _load_history(self):
        history_path = os.path.join(self._config_dir, 'history.json')
        if os.path.exists(history_path):
            try:
                with open(history_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_history(self, history):
        history_path = os.path.join(self._config_dir, 'history.json')
        try:
            with open(history_path, 'w', encoding='utf-8') as f:
                json.dump(history, f, indent=4)
        except Exception:
            pass

    def get_download_history(self):
        return self._load_history()

    def add_to_history(self, task):
        history = self._load_history()
        # Avoid duplicates by filepath
        if task.get('filepath'):
            history = [item for item in history if item.get('filepath') != task.get('filepath')]
        history.insert(0, task)
        # Cap at 100
        history = history[:100]
        self._save_history(history)
        return {'success': True}

    def delete_history_item(self, filepath):
        history = self._load_history()
        history = [item for item in history if item.get('filepath') != filepath]
        self._save_history(history)
        return {'success': True}

    def clear_history(self):
        self._save_history([])
        return {'success': True}

    def open_file(self, filepath):
        try:
            if filepath and os.path.exists(filepath):
                os.startfile(filepath)
                return {'success': True}
            else:
                return {'success': False, 'error': 'File does not exist.'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def show_in_folder(self, filepath):
        try:
            if filepath:
                filepath = os.path.abspath(filepath)
                if os.path.exists(filepath):
                    subprocess.Popen(f'explorer /select,"{filepath}"')
                else:
                    parent_dir = os.path.dirname(filepath)
                    if os.path.exists(parent_dir):
                        os.startfile(parent_dir)
                    else:
                        return {'success': False, 'error': 'Folder does not exist.'}
                return {'success': True}
            else:
                return {'success': False, 'error': 'Invalid filepath.'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # Playlists Helper Methods
    def _load_playlists(self):
        playlists_path = os.path.join(self._config_dir, 'playlists.json')
        if os.path.exists(playlists_path):
            try:
                with open(playlists_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception:
                pass
        return []

    def _save_playlists(self, playlists):
        playlists_path = os.path.join(self._config_dir, 'playlists.json')
        try:
            with open(playlists_path, 'w', encoding='utf-8') as f:
                json.dump(playlists, f, indent=4)
        except Exception:
            pass

    def get_saved_playlists(self):
        return self._load_playlists()

    def save_playlist(self, playlist):
        playlists = self._load_playlists()
        # Avoid duplicates by url
        if playlist.get('url'):
            playlists = [item for item in playlists if item.get('url') != playlist.get('url')]
        playlists.insert(0, playlist)
        self._save_playlists(playlists)
        return {'success': True, 'playlists': playlists}

    def delete_saved_playlist(self, url):
        playlists = self._load_playlists()
        playlists = [item for item in playlists if item.get('url') != url]
        self._save_playlists(playlists)
        return {'success': True, 'playlists': playlists}

# Start webview app
def main():
    try:
        api = YTDownloaderAPI()
        
        # Resolve web assets path (works for both dev run and PyInstaller bundle)
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            web_dir = os.path.join(sys._MEIPASS, 'web')
        else:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            web_dir = os.path.join(current_dir, 'web')
        index_html = os.path.join(web_dir, 'index.html')
        
        # Resolve icon path
        icon_path = os.path.join(web_dir, 'favicon.ico')
        
        # Create webview window
        window = webview.create_window(
            "BTK's YTube Downloader",
            index_html,
            js_api=api,
            width=1100,
            height=750,
            min_size=(850, 600),
            background_color='#0b0f19',
            frameless=True,
            easy_drag=False
        )
        
        def on_closing():
            print("Application is closing. Cleaning up active downloads...")
            with api._queue_lock:
                api._download_queue.clear()
                for dl_id in list(api._running_downloads.keys()):
                    api._cancelled_downloads.add(dl_id)
            time.sleep(0.3)

        api.set_window(window)
        
        def on_maximized():
            api._is_maximized = True
            
        def on_restored():
            api._is_maximized = False

        window.events.maximized += on_maximized
        window.events.restored += on_restored
        window.events.closing += on_closing
        webview.start(debug=not getattr(sys, 'frozen', False), icon=icon_path)
    except Exception as e:
        import traceback
        config_dir = os.path.join(os.path.expanduser('~'), '.btk_ytube_downloader')
        os.makedirs(config_dir, exist_ok=True)
        crash_log_path = os.path.join(config_dir, 'crash_report.log')
        with open(crash_log_path, 'a', encoding='utf-8') as f:
            f.write(f"\n--- CRASH AT {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            traceback.print_exc(file=f)
        raise e

if __name__ == '__main__':
    main()
