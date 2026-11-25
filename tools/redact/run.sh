#!/bin/bash
# 制度文档脱敏工具：第一次运行时在 .venv 里安装依赖，之后直接运行。
# 1. ./run.sh convert --input 原件目录             .doc 等就地转成同名 .docx（只有 .docx 时可跳过）
# 2. ./run.sh scan --input 原件目录 [--dict 已有词典.csv]   扫描出候选词典
# 3. ./run.sh --input 原件目录 --dict 词典.csv              脱敏
# 4. ./run.sh stats --input 脱敏结果/<时间>                  统计 Markdown 字数、大小、token（脱敏时也会自动统计）
# 5. ./run.sh package --run 脱敏结果/<时间> --originals 原件目录   打包成导入包，人工核对批次清单
# 6. ./run.sh import --package 导入包/<时间> --url https://系统地址 [--apply]   导入（先预演，加 --apply 才写入）
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  echo "首次运行：安装依赖（lxml）……"
  python3 -m venv .venv
  .venv/bin/pip install --quiet --upgrade pip
  .venv/bin/pip install --quiet -r requirements.txt
fi
# ./run.sh convert …  .doc 等旧格式批量转成 .docx
# ./run.sh scan …     扫描、生成候选词典
# ./run.sh …          脱敏
case "${1:-}" in
  convert) shift; exec .venv/bin/python convert.py "$@" ;;
  scan) shift; exec .venv/bin/python scan.py "$@" ;;
  stats) shift; exec .venv/bin/python mdstats.py "$@" ;;
  package) shift; exec .venv/bin/python package.py "$@" ;;
  import) shift; exec .venv/bin/python importer.py "$@" ;;
esac
exec .venv/bin/python redact.py "$@"
