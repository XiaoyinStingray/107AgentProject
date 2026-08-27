# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller 打包配置 — Life Lab
用法: pyinstaller app.spec
"""

import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

# ── 收集第三方包的数据文件和隐藏导入 ─────────────────────────────────────────
aiosqlite_datas, aiosqlite_binaries, aiosqlite_hidden = collect_all('aiosqlite')
asyncssh_datas, asyncssh_binaries, asyncssh_hidden = collect_all('asyncssh')

# ── 收集 engines 目录下的非 Python 数据文件 ──────────────────────────────────
engines_data = []
engines_root = Path('backend/src/engines')
for f in engines_root.rglob('*'):
    if f.is_file() and f.suffix not in ('.py', '.pyc') and '__pycache__' not in str(f):
        arcname = str(f.relative_to(Path('backend/src')))
        engines_data.append((str(f), str(Path(arcname).parent)))

# ── 数据文件 ─────────────────────────────────────────────────────────────────
datas = [
    # 前端构建产物
    ('frontend/dist', 'frontend/dist'),
    # 种子数据库
    ('backend/data/seed.db', 'backend/data'),
    # engines 数据文件
] + engines_data

# ── 隐藏导入 ─────────────────────────────────────────────────────────────────
hiddenimports = [
    # API 路由
    'api.agents', 'api.arenas', 'api.export', 'api.narratives',
    'api.simulations', 'api.sse', 'api.scenarios', 'api.templates',
    'api.worlds', 'api.achievements', 'api.teams', 'api.market',
    'api.bench', 'api.scenes', 'api.workers', 'api.pipelines',
    'api.settings', 'api.world_helpers',
    # ORM 模型
    'models.agent', 'models.world', 'models.scenario', 'models.arena',
    'models.simulation', 'models.narrative', 'models.achievement',
    'models.team', 'models.market', 'models.bench', 'models.scene',
    'models.worker', 'models.pipeline', 'models.fingerprint',
    # 引擎
    'engines.persona.builder', 'engines.persona.remixer',
    'engines.world.engine', 'engines.narrative.engine',
    'engines.arena.engine', 'engines.arena.modes',
    'engines.arena.scoring', 'engines.team.engine',
    'engines.scene.engine', 'engines.bench.engine',
    'engines.bench.recovery', 'engines.bench.metrics',
    'engines.bench.fingerprint', 'engines.worker.scheduler',
    # 第三方
    'aiosqlite', 'asyncssh', 'sqlalchemy', 'pydantic',
    'pydantic_settings', 'fastapi', 'uvicorn', 'loguru',
    'autogen', 'websockets',
] + list(aiosqlite_hidden) + list(asyncssh_hidden)

# ── 排除不需要的包（减小体积）─────────────────────────────────────────────────
excludes = [
    'tkinter', 'matplotlib', 'scipy', 'numpy', 'pandas',
    'cv2', 'pytest', 'setuptools', 'pip',
]

a = Analysis(
    ['run.py'],
    pathex=['backend/src'],
    binaries=[],
    datas=datas + list(aiosqlite_datas) + list(asyncssh_datas),
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='LifeLab',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
