import sys

class DummyStream:
    def write(self, *args, **kwargs): pass
    def flush(self, *args, **kwargs): pass
    def read(self, *args, **kwargs): return ""
    def readline(self, *args, **kwargs): return ""
    def isatty(self): return False
    @property
    def encoding(self): return "utf-8"

dummy = DummyStream()

if sys.stdout is None:
    sys.stdout = dummy
if sys.stderr is None:
    sys.stderr = dummy
if sys.stdin is None:
    sys.stdin = dummy
