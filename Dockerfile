# Life Lab — 多阶段 Docker 构建
# Phase 26: Worker Engine + 完整产品

# ── Stage 1: 前端构建 ──
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: 后端 + 静态文件 ──
FROM python:3.12-slim

WORKDIR /app

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 后端源码
COPY backend/src/ backend/src/

# 前端构建产物
COPY --from=frontend-builder /app/frontend/dist/ frontend/dist/

# 工作目录
RUN mkdir -p /data/workspaces

EXPOSE 8000

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/backend/src

HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
