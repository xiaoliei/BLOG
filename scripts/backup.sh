#!/usr/bin/env bash
# ============================================================
# D1 定期备份：wrangler d1 export 远程库到 backups/ 目录
# 用法：./scripts/backup.sh            （或 bash scripts/backup.sh）
# 建议：crontab 每日一次，如
#   0 4 * * * cd /path/to/BLOG && bash scripts/backup.sh >> backups/backup.log 2>&1
# 恢复：见 README「备份与恢复」一节
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p backups

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="backups/blog-db-${STAMP}.sql"

echo "[backup] 导出远程 D1 → ${FILE}"
npx wrangler d1 export blog-db --remote --output="${FILE}"

echo "[backup] 压缩 → ${FILE}.gz"
gzip -f "${FILE}"

# 保留最近 30 份
ls -1t backups/blog-db-*.sql.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "[backup] 完成。当前备份："
ls -1t backups/*.sql.gz | head -5
