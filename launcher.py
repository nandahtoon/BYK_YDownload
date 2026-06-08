import os
import sys
import traceback
import time

# Resolve config/log directory
log_dir = os.path.join(os.path.expanduser('~'), '.btk_ytube_downloader')
try:
    os.makedirs(log_dir, exist_ok=True)
except Exception:
    pass

log_file_path = os.path.join(log_dir, 'app.log')

# Redirect standard streams to file if they are None (non-console/windowed mode)
if sys.stdout is None or sys.stderr is None or getattr(sys, 'frozen', False):
    try:
        # Open in append mode, line buffered
        log_file = open(log_file_path, 'a', encoding='utf-8', buffering=1)
        sys.stdout = log_file
        sys.stderr = log_file
        print(f"\n--- Application started at {time.strftime('%Y-%m-%d %H:%M:%S')} ---")
    except Exception as stream_err:
        class DummyStream:
            def write(self, *args, **kwargs): pass
            def flush(self, *args, **kwargs): pass
            def read(self, *args, **kwargs): return ""
            def readline(self, *args, **kwargs): return ""
            def isatty(self): return False
            @property
            def encoding(self): return "utf-8"
        dummy = DummyStream()
        sys.stdout = dummy
        sys.stderr = dummy

try:
    import main
    if __name__ == '__main__':
        main.main()
except BaseException as e:
    try:
        with open(os.path.join(log_dir, 'crash_report.log'), 'a', encoding='utf-8') as f:
            f.write(f"\n--- LAUNCHER CRASH AT {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
            f.write(f"Exception type: {type(e)}\n")
            traceback.print_exc(file=f)
    except Exception:
        pass
    sys.exit(1)
