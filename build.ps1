# ============================================================
# Life Lab — 一键打包为 Windows exe
# 用法: .\build.ps1
# 前提: 已安装 Python 依赖 (pip install -r requirements.txt)
#        已安装 Node.js 依赖 (cd frontend; npm install)
# ============================================================

$ErrorActionPreference = "Stop"
$ROOT = $PSScriptRoot

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Life Lab — 一键打包 exe" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 0: 检查 PyInstaller ──────────────────────────────────────────
Write-Host "[0/5] 检查 PyInstaller..." -ForegroundColor Yellow
try {
    $pyiVersion = python -m PyInstaller --version 2>&1
    Write-Host "  PyInstaller $pyiVersion" -ForegroundColor Green
} catch {
    Write-Host "  PyInstaller 未安装，正在安装..." -ForegroundColor Red
    pip install pyinstaller
}

# ── Step 1: 构建前端 ──────────────────────────────────────────────────
Write-Host ""
Write-Host "[1/5] 构建前端..." -ForegroundColor Yellow
$distDir = Join-Path $ROOT "frontend\dist"

# 检查是否需要重新构建（dist 存在且不为空则跳过）
$needBuild = $true
if (Test-Path $distDir) {
    $indexHtml = Join-Path $distDir "index.html"
    if (Test-Path $indexHtml) {
        Write-Host "  frontend/dist 已存在，跳过构建" -ForegroundColor DarkGray
        $needBuild = $false
    }
}

if ($needBuild) {
    Push-Location (Join-Path $ROOT "frontend")
    try {
        powershell -ExecutionPolicy Bypass -Command "npm run build"
        Write-Host "  前端构建完成" -ForegroundColor Green
    } catch {
        Write-Host "  前端构建失败: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
}

# ── Step 2: 准备种子数据库 ────────────────────────────────────────────
Write-Host ""
Write-Host "[2/5] 准备种子数据库..." -ForegroundColor Yellow
$dataDir = Join-Path $ROOT "backend\data"
$seedDb = Join-Path $dataDir "seed.db"
$lifeDb = Join-Path $dataDir "lifelab.db"

if (Test-Path $seedDb) {
    Write-Host "  seed.db 已存在" -ForegroundColor DarkGray
} elseif (Test-Path $lifeDb) {
    Copy-Item $lifeDb $seedDb -Force
    Write-Host "  从 lifelab.db 复制为 seed.db" -ForegroundColor Green
} else {
    # 创建空数据库（应用启动时会初始化表结构）
    Write-Host "  数据库文件不存在，将创建空数据库" -ForegroundColor DarkGray
    python -c "import sqlite3; conn = sqlite3.connect('$seedDb'); conn.close()"
    Write-Host "  已创建空 seed.db" -ForegroundColor Green
}

# ── Step 3: 运行 PyInstaller ──────────────────────────────────────────
Write-Host ""
Write-Host "[3/5] PyInstaller 打包（首次可能耗时 5-10 分钟）..." -ForegroundColor Yellow
Push-Location $ROOT
try {
    python -m PyInstaller app.spec --clean --noconfirm
    Write-Host "  打包完成!" -ForegroundColor Green
} catch {
    Write-Host "  PyInstaller 打包失败: $_" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# ── Step 4: 复制运行时配置文件 ────────────────────────────────────────
Write-Host ""
Write-Host "[4/5] 准备运行时配置..." -ForegroundColor Yellow
$exeDir = Join-Path $ROOT "dist"
$envFile = Join-Path $exeDir ".env"
$srcEnv = Join-Path $ROOT ".env"

# 优先复制项目已有的 .env（包含用户配置），否则创建模板
if (Test-Path $srcEnv) {
    Copy-Item $srcEnv $envFile -Force
    Write-Host "  已复制项目 .env -> dist/.env" -ForegroundColor Green
} elseif (-not (Test-Path $envFile)) {
    $envContent = @"
# ===== Life Lab 配置 =====
# 请填入你的 LLM API Key（必填）
LLM_API_KEY=
# API 地址（DeepSeek / OpenAI 兼容）
LLM_BASE_URL=https://api.deepseek.com/
# 模型名称
LLM_MODEL=deepseek-v4-flash
# 服务端口（默认 8000）
API_PORT=8000
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Host "  已创建 .env 配置模板 -> dist/.env" -ForegroundColor Green
    Write-Host "  请编辑 dist/.env 填入你的 LLM API Key" -ForegroundColor Yellow
} else {
    Write-Host "  dist/.env 已存在，跳过" -ForegroundColor DarkGray
}

# ── Step 5: 输出结果 ─────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  打包完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  输出目录: dist\" -ForegroundColor White
Write-Host "  可执行文件: dist\LifeLab.exe" -ForegroundColor White
Write-Host "  配置文件:   dist\.env" -ForegroundColor White
Write-Host ""
Write-Host "  使用方法:" -ForegroundColor Yellow
Write-Host "    1. 编辑 dist\.env，填入 LLM_API_KEY" -ForegroundColor White
Write-Host "    2. 双击运行 dist\LifeLab.exe" -ForegroundColor White
Write-Host "    3. 浏览器会自动打开 http://localhost:8000" -ForegroundColor White
Write-Host ""
Write-Host "  分发: 将整个 dist\ 文件夹打包为 zip 发给用户即可" -ForegroundColor Yellow
Write-Host ""
