#!/bin/bash
# 制度文档脱敏工具：第一次运行时在 .venv 里安装依赖，之后直接运行。
# ./run.sh scan --input 原件目录 [--dict 已有词典.csv]   先扫描出候选词典
# ./run.sh --input 原件目录 --dict 词典.csv              再脱敏
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "首次运行：安装依赖（lxml）……"
  python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi
# ./run.sh scan …  扫描原件、生成候选词典；其余参数照常脱敏
if [ "${1:-}" = "scan" ]; then
  shift
  exec .venv/bin/python scan.py "$@"
fi
exec .venv/bin/python redact.py "$@"
