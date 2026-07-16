from __future__ import annotations

import argparse
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ENTITY_ID = "sensor.nick_r_steps"


def create_recorder_db(
    db_path: str | Path,
    entity_id: str = ENTITY_ID,
    start_utc: datetime | None = None,
    end_utc: datetime | None = None,
    timezone_name: str = "UTC",
) -> None:
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if end_utc is None:
        now_utc = datetime.now(timezone.utc)
        local_tz = ZoneInfo(timezone_name)
        now_local = now_utc.astimezone(local_tz)
        end_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
        end_utc = end_local.astimezone(timezone.utc)
    if start_utc is None:
        start_utc = end_utc - timedelta(days=7)

    daily_hourly_increments = [
        0,
        0,
        0,
        0,
        0,
        5,
        12,
        24,
        36,
        48,
        56,
        60,
        54,
        45,
        38,
        34,
        30,
        28,
        32,
        40,
        48,
        36,
        18,
        8,
    ]

    with sqlite3.connect(db_path) as conn:
        conn.executescript(
            """
            DROP TABLE IF EXISTS states_meta;
            DROP TABLE IF EXISTS states;

            CREATE TABLE states_meta (
                metadata_id INTEGER PRIMARY KEY,
                entity_id TEXT NOT NULL
            );

            CREATE TABLE states (
                state_id INTEGER PRIMARY KEY,
                metadata_id INTEGER NOT NULL,
                state TEXT NOT NULL,
                last_changed TEXT,
                last_changed_ts REAL,
                last_updated_ts REAL
            );
            """
        )

        conn.execute(
            "INSERT INTO states_meta (metadata_id, entity_id) VALUES (?, ?)",
            (1, entity_id),
        )

        cumulative = 0

        for hour_index in range(168):
            hour_in_day = hour_index % 24
            day_index = hour_index // 24
            timestamp = start_utc + timedelta(hours=hour_index)

            if hour_in_day == 0:
                cumulative = 0

            cumulative += daily_hourly_increments[hour_in_day] + day_index * 2

            state = str(cumulative)
            if day_index == 3 and hour_in_day == 12:
                state = "unavailable"

            conn.execute(
                """
                INSERT INTO states (
                    state_id,
                    metadata_id,
                    state,
                    last_changed,
                    last_changed_ts,
                    last_updated_ts
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    hour_index + 1,
                    1,
                    state,
                    timestamp.isoformat(),
                    timestamp.timestamp(),
                    timestamp.timestamp(),
                ),
            )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path")
    parser.add_argument("--entity-id", default=ENTITY_ID)
    parser.add_argument("--timezone", default="UTC")
    args = parser.parse_args()

    create_recorder_db(args.db_path, entity_id=args.entity_id, timezone_name=args.timezone)


if __name__ == "__main__":
    main()
