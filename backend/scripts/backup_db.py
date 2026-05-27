#!/usr/bin/env python3
"""
DigBahi SQLite backup script.

Usage:
    python scripts/backup_db.py [--db PATH] [--dest DIR] [--keep N]

What it does:
    1. Connects to the SQLite DB and runs WAL checkpoint (TRUNCATE) so the WAL
       file is flushed into the main DB file before copying.
    2. Copies the DB file to <dest>/digbahi_YYYY-MM-DD_HHMMSS.db
    3. Deletes the oldest backups, keeping only the last N (default 7).

Run from cron or a deployment hook — daily is usually enough for SME usage.
Example cron (daily at 02:00):
    0 2 * * * cd /path/to/digbahi && python backend/scripts/backup_db.py
"""

import argparse
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


def backup(db_path: Path, dest_dir: Path, keep: int) -> None:
    if not db_path.exists():
        print(f"ERROR: database not found at {db_path}", file=sys.stderr)
        sys.exit(1)

    dest_dir.mkdir(parents=True, exist_ok=True)

    # Flush WAL to main file before copying — avoids a partially-applied WAL
    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        conn.commit()
    finally:
        conn.close()

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    dest_file = dest_dir / f"digbahi_{timestamp}.db"
    shutil.copy2(db_path, dest_file)
    print(f"Backed up: {dest_file} ({dest_file.stat().st_size // 1024} KB)")

    # Prune old backups — keep only the <keep> most recent
    backups = sorted(dest_dir.glob("digbahi_*.db"), key=lambda p: p.stat().st_mtime)
    for old in backups[:-keep]:
        old.unlink()
        print(f"Pruned old backup: {old.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="DigBahi SQLite backup")
    parser.add_argument("--db",   default="digbahi_local.db", help="Path to SQLite DB file")
    parser.add_argument("--dest", default="backups",          help="Backup destination directory")
    parser.add_argument("--keep", default=7, type=int,        help="Number of backups to retain")
    args = parser.parse_args()

    backup(
        db_path=Path(args.db),
        dest_dir=Path(args.dest),
        keep=args.keep,
    )


if __name__ == "__main__":
    main()
