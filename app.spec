# -*- mode: python ; coding: utf-8 -*-
"""
Life Lab — PyInstaller 打包配置
用法: pyinstaller app.spec
"""
import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_all

block_cipher = None

ROOT = os.path.abspath('.')
SRC = os.path.join(ROOT, 'backend', 'src')
FRONTEND_DIST = os.path.join(ROOT, 'frontend', 'dist')

# ── 收集第三方包的数据文件和隐藏导入 ──────────────────────────────────
datas = []
hiddenimports = []

# aiosqlite: SQLAlchemy 异步 SQLite 驱动
_d, _b, _h = collect_all('aiosqlite')
datas += _d
hiddenimports += _h

# asyncssh: SSH 远程执行
_d, _b, _h = collect_all('asyncssh')
datas += _d
hiddenimports += _h

# 收集 engines 目录下的非 Python 数据文件（如 agent_templates.json）
engines_data = []
engines_dir = os.path.join(SRC, 'engines')
for dirpath, dirnames, filenames in os.walk(engines_dir):
    # 排除 __pycache__
    dirnames[:] = [d for d in dirnames if d != '__pycache__']
    for fn in filenames:
        if not fn.endswith(('.py', '.pyc')):
            src_file = os.path.join(dirpath, fn)
            # 计算相对于 src/ 的路径，保持包结构
            rel = os.path.relpath(dirpath, SRC)
            engines_data.append((src_file, rel))

a = Analysis(
    ['run.py'],
    pathex=[SRC, ROOT],
    binaries=[],
    datas=[
        # 前端构建产物
        (FRONTEND_DIST, 'frontend/dist'),
        # 种子数据库
        ('backend/data/seed.db', 'backend/data'),
        # engines 数据文件
    ] + datas + engines_data,
    hiddenimports=hiddenimports + [
        # ── 后端模块（PyInstaller 静态分析可能遗漏） ──
        # API 路由
        'api.agents', 'api.arenas', 'api.export', 'api.narratives',
        'api.simulations', 'api.sse', 'api.scenarios', 'api.templates',
        'api.worlds', 'api.achievements', 'api.teams', 'api.market',
        'api.bench', 'api.scenes', 'api.workers', 'api.pipelines',
        'api.settings',
        # ORM 模型（db.py 中动态 import）
        'models.memory', 'models.event', 'models.agent_orm',
        'models.world_orm', 'models.scenario_orm', 'models.arena_orm',
        'models.simulation_orm', 'models.intervention_orm',
        'models.team_orm', 'models.plan_orm', 'models.market_orm',
        'models.bench_orm', 'models.checkpoint_orm',
        # 引擎模块
        'engines.agent_factory', 'engines.arena', 'engines.bench',
        'engines.narrative', 'engines.persona', 'engines.scene',
        'engines.team', 'engines.world', 'engines.worker',
        # 第三方隐藏导入
        'aiosqlite', 'sqlalchemy.dialects.sqlite',
        'anyio._backends._asyncio',
        'httpx._transports.default',
        'asyncssh', 'asyncssh.crypto',
        'cryptography', 'cryptography.hazmat.backends.openssl',
        'pydantic_settings',
        'sse_starlette', 'sse_starlette.sse',
        'orjson',
        'autogen_agentchat', 'autogen_ext',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'scipy', 'numpy',
        'IPython', 'notebook', 'pytest', '_pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='LifeLab',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,         # 显示控制台（便于查看日志和排查问题）
    disable_windowed_bounds=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
