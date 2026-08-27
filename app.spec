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

# ── 前端构建产物路径 ──────────────────────────────────────────────────────
FRONTEND_DIST = 'frontend/dist'

# ── 数据文件（统一定义，Analysis 直接引用） ────────────────────────────────
datas = [
    # 前端构建产物
    (FRONTEND_DIST, 'frontend/dist'),
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
    # 引擎（仅列出 PyInstaller 静态分析可能遗漏的）
    'engines.persona.builder', 'engines.persona.remixer',
    'engines.world.engine', 'engines.narrative.engine',
    'engines.arena.engine', 'engines.arena.battle_royale',
    'engines.arena.scoring', 'engines.team.engine',
    'engines.scene.engine',
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
    datas=datas,
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
        # 引擎模块（全量子模块，防止动态加载遗漏）
        'engines.agent_factory', 'engines.agent_factory.factory',
        'engines.agent_factory.loader', 'engines.agent_factory.fingerprint',
        'engines.agent_factory.execution_memory', 'engines.agent_factory.memory',
        'engines.agent_factory.tools',
        'engines.arena', 'engines.arena.engine', 'engines.arena.battle_royale',
        'engines.arena.prompts', 'engines.arena.report', 'engines.arena.scoring',
        'engines.arena.utils',
        'engines.bench', 'engines.bench.fingerprint', 'engines.bench.metrics',
        'engines.bench.recovery', 'engines.bench.reporter', 'engines.bench.scheduler',
        'engines.narrative', 'engines.narrative.engine', 'engines.narrative.templates',
        'engines.persona', 'engines.persona.builder', 'engines.persona.remixer',
        'engines.persona.prompt_templates', 'engines.persona.template_library',
        'engines.scene', 'engines.scene.engine',
        'engines.team', 'engines.team.engine', 'engines.team.coordinator',
        'engines.team.decomposer', 'engines.team.diagnostics',
        'engines.team.learning_curve', 'engines.team.recovery',
        'engines.team.report', 'engines.team.role_evolution',
        'engines.team.versus', 'engines.team.workspace',
        'engines.worker', 'engines.worker.engine', 'engines.worker.coordinator',
        'engines.worker.delivery_validation', 'engines.worker.duel',
        'engines.worker.events', 'engines.worker.fork',
        'engines.worker.pipeline', 'engines.worker.pipeline_engine',
        'engines.worker.prompts', 'engines.worker.recipes',
        'engines.worker.sandbox', 'engines.worker.scheduler',
        'engines.worker.state_machine', 'engines.worker.tools',
        'engines.worker.workspace',
        'engines.world', 'engines.world.engine', 'engines.world.conflict',
        'engines.world.dialogue_guard', 'engines.world.goals',
        'engines.world.instructions', 'engines.world.messages',
        'engines.world.relationships', 'engines.world.resources',
        'engines.world.scenarios', 'engines.world.state',
        'engines.world.streaming',
        # LLM 模块（全部在函数体内延迟导入）
        'llm', 'llm.client', 'llm.errors', 'llm.fallback', 'llm.search',
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
