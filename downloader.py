import os
import yt_dlp
import imageio_ffmpeg
import threading

class YTDownloader:
    def __init__(self):
        # Resolve ffmpeg executable path
        try:
            self.ffmpeg_path = imageio_ffmpeg.get_ffmpeg_exe()
            if self.ffmpeg_path:
                ffmpeg_dir = os.path.dirname(self.ffmpeg_path)
                os.environ['PATH'] = ffmpeg_dir + os.pathsep + os.environ.get('PATH', '')
        except Exception:
            self.ffmpeg_path = None

    def get_ffmpeg_path(self):
        return self.ffmpeg_path

    def fetch_info(self, url):
        """
        Fetches video or playlist details.
        Returns a dictionary with video/playlist metadata.
        """
        ydl_opts = {
            'extract_flat': 'in_playlist',
            'skip_download': True,
            'youtube_include_dash_manifest': False,
            'quiet': True,
            'no_warnings': True,
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
                return info
            except Exception as e:
                raise Exception(f"Failed to fetch info: {str(e)}")

    def fetch_video_details(self, url):
        """
        Fetches detailed information for a single video, including formats and subtitles.
        """
        ydl_opts = {
            'skip_download': True,
            'writesubtitles': True,
            'writeautomaticsub': True,
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            try:
                info = ydl.extract_info(url, download=False)
                
                # Estimate the best audio stream filesize to add to video format filesizes
                best_audio_size = 0
                if 'formats' in info:
                    audio_formats = [f for f in info['formats'] if f.get('vcodec') == 'none' and f.get('acodec') != 'none']
                    if audio_formats:
                        audio_formats.sort(key=lambda x: x.get('abr') or x.get('tbr') or 0, reverse=True)
                        best_audio_size = audio_formats[0].get('filesize') or audio_formats[0].get('filesize_approx') or 0
                    if not best_audio_size and info.get('duration'):
                        # Fallback: estimate size assuming 128kbps audio stream
                        best_audio_size = int(info['duration'] * 128 * 1024 / 8)

                def format_bytes(bytes_num):
                    if not bytes_num:
                        return ""
                    if bytes_num < 1024 * 1024:
                        return f"{bytes_num / 1024:.1f} KB"
                    elif bytes_num < 1024 * 1024 * 1024:
                        return f"{bytes_num / (1024 * 1024):.1f} MB"
                    else:
                        return f"{bytes_num / (1024 * 1024 * 1024):.1f} GB"

                # Format quality options
                seen_heights = set()
                available_heights = []
                if 'formats' in info:
                    for f in info['formats']:
                        h = f.get('height')
                        if h and isinstance(h, int) and h >= 144 and h not in seen_heights:
                            seen_heights.add(h)
                            available_heights.append(h)
                
                available_heights.sort(reverse=True)
                
                quality_options = []
                for h in available_heights:
                    # Retrieve the specific video format to read its filesize
                    video_formats = [f for f in info['formats'] if f.get('height') == h and f.get('vcodec') != 'none']
                    video_size = 0
                    if video_formats:
                        video_formats.sort(key=lambda x: x.get('filesize') or x.get('filesize_approx') or 0, reverse=True)
                        video_size = video_formats[0].get('filesize') or video_formats[0].get('filesize_approx') or 0
                    
                    total_size = video_size + best_audio_size if video_size else 0
                    size_label = f" (~{format_bytes(total_size)})" if total_size else ""
                    
                    quality_options.append({
                        'id': f'bestvideo[height<={h}]+bestaudio/best[height<={h}]',
                        'label': f'{h}p (Best Quality){size_label}'
                    })
                
                # Always add standard fallback qualities if none detected
                if not quality_options:
                    quality_options = [
                        {'id': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]', 'label': '1080p'},
                        {'id': 'bestvideo[height<=720]+bestaudio/best[height<=720]', 'label': '720p'},
                        {'id': 'bestvideo[height<=480]+bestaudio/best[height<=480]', 'label': '480p'},
                        {'id': 'bestvideo[height<=360]+bestaudio/best[height<=360]', 'label': '360p'},
                    ]
                
                # Add Audio Only option
                audio_size_label = f" (~{format_bytes(best_audio_size)})" if best_audio_size else ""
                quality_options.append({
                    'id': 'bestaudio/best',
                    'label': f'Audio Only (MP3){audio_size_label}'
                })
                
                # Subtitle languages
                subtitles = []
                if 'subtitles' in info:
                    for lang in info['subtitles']:
                        subtitles.append({'code': lang, 'name': lang.upper()})
                
                # Auto-generated subtitles as fallback
                if 'automatic_captions' in info:
                    for lang in info['automatic_captions']:
                        # Avoid duplicates
                        if not any(s['code'] == lang for s in subtitles):
                            subtitles.append({'code': lang, 'name': f"{lang.upper()} (auto)"})
                
                return {
                    'id': info.get('id'),
                    'title': info.get('title'),
                    'thumbnail': info.get('thumbnail'),
                    'duration': info.get('duration'),
                    'uploader': info.get('uploader'),
                    'quality_options': quality_options,
                    'subtitles': subtitles,
                    'url': url
                }
            except Exception as e:
                raise Exception(f"Failed to fetch video details: {str(e)}")

    def download(self, url, options, progress_callback, postprocessor_callback=None):
        """
        Downloads a video with given options and reports progress.
        Runs synchronously. Should be called inside a background thread.
        """
        quality = options.get('quality', 'bestvideo+bestaudio/best')
        subtitle_lang = options.get('subtitle', None)
        download_dir = options.get('download_dir', os.path.expanduser('~/Downloads'))
        
        # Build options
        ydl_opts = {
            'outtmpl': os.path.join(download_dir, '%(title)s.%(ext)s'),
            'progress_hooks': [progress_callback],
            'quiet': True,
            'no_warnings': True,
            'nooverwrites': True,  # Allow resume of partial downloads, don't overwrite completed files
            'continuedl': True,    # Force resume of partially downloaded files
            'retries': 10,         # Retry failed connections
            'fragment_retries': 10 # Retry segment/fragment failures
        }
        
        if postprocessor_callback:
            ydl_opts['postprocessor_hooks'] = [postprocessor_callback]
        
        # Cookies authentication
        cookies_file = options.get('cookies_file')
        if cookies_file and os.path.exists(cookies_file):
            ydl_opts['cookiefile'] = cookies_file
        
        # Speed Limiting
        speed_limit = options.get('speed_limit')
        if speed_limit and speed_limit != 'unlimited':
            limit_bytes = 0
            if speed_limit.endswith('k'):
                limit_bytes = int(speed_limit[:-1]) * 1024
            elif speed_limit.endswith('m'):
                limit_bytes = int(speed_limit[:-1]) * 1024 * 1024
            if limit_bytes > 0:
                ydl_opts['ratelimit'] = limit_bytes

        # Concurrent Fragment Downloads (Speed Boost)
        concurrent_fragments = options.get('concurrent_fragments', 3)
        try:
            ydl_opts['concurrent_fragment_downloads'] = int(concurrent_fragments)
        except Exception:
            ydl_opts['concurrent_fragment_downloads'] = 3
        
        # Configure ffmpeg path if available
        if self.ffmpeg_path:
            ydl_opts['ffmpeg_location'] = self.ffmpeg_path
            
        # Quality/Format configuration
        format_type = options.get('format_type', 'video')
        out_format = options.get('out_format', 'mp3' if format_type == 'audio' else 'mp4')
        audio_bitrate = options.get('audio_bitrate', '192')

        if format_type == 'audio':
            ydl_opts['format'] = 'bestaudio/best'
            ydl_opts['postprocessors'] = [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': out_format,
            }]
            # Only specify preferredquality for lossy codecs
            if out_format in ['mp3', 'm4a']:
                ydl_opts['postprocessors'][0]['preferredquality'] = str(audio_bitrate)
        else:
            # Video download format
            ydl_opts['format'] = quality
            if self.ffmpeg_path:
                ydl_opts['merge_output_format'] = out_format

        # Subtitles configuration
        if subtitle_lang:
            ydl_opts['writesubtitles'] = True
            ydl_opts['subtitleslangs'] = [subtitle_lang]
            ydl_opts['writeautomaticsub'] = True
            
            # Embed subtitles if ffmpeg is available
            if self.ffmpeg_path and quality != 'bestaudio/best':
                ydl_opts['embedsubtitles'] = True
                if 'postprocessors' not in ydl_opts:
                    ydl_opts['postprocessors'] = []
                ydl_opts['postprocessors'].append({
                    'key': 'FFmpegEmbedSubtitle',
                })

        # Embed Metadata if toggled
        if options.get('embed_metadata', False):
            if 'postprocessors' not in ydl_opts:
                ydl_opts['postprocessors'] = []
            ydl_opts['postprocessors'].append({
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            })

        # Embed Thumbnail if toggled and ffmpeg available
        if options.get('embed_thumbnail', False) and self.ffmpeg_path:
            ydl_opts['writethumbnails'] = True
            if 'postprocessors' not in ydl_opts:
                ydl_opts['postprocessors'] = []
            ydl_opts['postprocessors'].append({
                'key': 'EmbedThumbnail',
                'already_have_thumbnail': False,
            })
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
