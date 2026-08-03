# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('web', 'web')],
    hiddenimports=['dl_coursera', 'dl_coursera_run', 'bs4', 'lxml', 'requests', 'tqdm', 'imageio_ffmpeg'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['rthook_stream.py'],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='SU_Youtube_Downloader',
    icon='web/favicon.ico',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
