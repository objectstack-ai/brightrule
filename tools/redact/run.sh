#!/bin/bash
# 制度文档脱敏工具：第一次运行时在 .venv 里安装依赖，之后直接运行。
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "首次运行：安装依赖（lxml）……"
  python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi
exec .venv/bin/python redact.py "$@"
