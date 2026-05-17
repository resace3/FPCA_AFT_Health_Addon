import os
import requests
import pandas as pd
import numpy as np

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo


def get_fpca_score_from_home_assistant_steps(
    entity_id,
    local_timezone="America/New_York",
    mean_curve_file="nhanes_mean_curve.csv",
    eigenfunction_file="nhanes_first_eigenfunction.csv"
):
    mean_df = pd.read_csv(mean_curve_file)
    eigen_df = pd.read_csv(eigenfunction_file)

    nhanes_mean_curve = mean_df["mean_steps"].to_numpy()
    eigenfunction_1 = eigen_df["eigenfunction_1"].to_numpy()

    if len(nhanes_mean_curve) != 168:
        raise ValueError("NHANES mean curve must be length 168")

    if len(eigenfunction_1) != 168:
        raise ValueError("Eigenfunction 1 must be length 168")

    token = os.environ["SUPERVISOR_TOKEN"]

    local_tz = ZoneInfo(local_timezone)

    now_utc = datetime.now(timezone.utc)
    now_local = now_utc.astimezone(local_tz)

    end_local = now_local.replace(
        hour=0,
        minute=0,
        second=0,
        microsecond=0
    )

    start_local = end_local - timedelta(days=7)

    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)

    base_url = (
        f"http://supervisor/core/api/history/period/"
        f"{start_utc.isoformat()}"
    )

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    params = {
        "filter_entity_id": entity_id,
        "end_time": end_utc.isoformat(),
        "no_attributes": "",
    }

    response = requests.get(
        base_url,
        headers=headers,
        params=params,
        timeout=30
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"API request failed: {response.status_code} | {response.text}"
        )

    data = response.json()

    if not data or not data[0]:
        raise RuntimeError(f"No history returned for {entity_id}")

    df = pd.DataFrame(data[0]).copy()

    df["last_changed_utc"] = pd.to_datetime(
        df["last_changed"],
        format="ISO8601",
        utc=True
    )

    df["last_changed_local"] = (
        df["last_changed_utc"]
        .dt.tz_convert(local_timezone)
    )

    df["steps_cumulative"] = pd.to_numeric(
        df["state"],
        errors="coerce"
    )

    bad_numeric_rows = df[df["steps_cumulative"].isna()].copy()

    df = (
        df
        .dropna(subset=["steps_cumulative"])
        .sort_values("last_changed_local")
        .reset_index(drop=True)
    )

    df["step_diff"] = df["steps_cumulative"].diff()

    df["steps_increment"] = np.where(
        df["step_diff"] < 0,
        df["steps_cumulative"],
        df["step_diff"]
    )

    df["steps_increment"] = df["steps_increment"].fillna(0)

    df.loc[
        df["steps_increment"] < 0,
        "steps_increment"
    ] = 0

    reset_rows = df[df["step_diff"] < 0].copy()

    df["hour_local"] = (
        df["last_changed_local"]
        .dt.floor("h")
    )

    hourly_raw = (
        df
        .groupby("hour_local")["steps_increment"]
        .sum()
        .reset_index()
    )

    full_hours = pd.date_range(
        start=start_local,
        end=end_local - timedelta(hours=1),
        freq="h"
    )

    hour_grid = pd.DataFrame({
        "hour_local": full_hours
    })

    hourly = (
        hour_grid
        .merge(hourly_raw, on="hour_local", how="left")
    )

    hourly["steps_increment"] = (
        hourly["steps_increment"]
        .fillna(0)
    )

    hourly["week_hour"] = np.arange(len(hourly))

    fitbit_week_curve = (
        hourly["steps_increment"]
        .to_numpy()
    )

    if len(fitbit_week_curve) != 168:
        raise ValueError("Final Fitbit curve is not length 168")

    fitbit_centered = (
        fitbit_week_curve -
        nhanes_mean_curve
    )

    score_contribution = (
        fitbit_centered *
        eigenfunction_1
    )

    fpca_score_1 = float(
        np.sum(score_contribution)
    )

    hourly["fitbit_steps"] = fitbit_week_curve
    hourly["nhanes_mean"] = nhanes_mean_curve
    hourly["fitbit_centered"] = fitbit_centered
    hourly["eigenfunction_1"] = eigenfunction_1
    hourly["score_contribution"] = score_contribution
    hourly["cumulative_score"] = (
        hourly["score_contribution"]
        .cumsum()
    )

    daily_summary = (
        df
        .assign(
            local_date=df["last_changed_local"].dt.date.astype(str)
        )
        .groupby("local_date")
        .agg(
            max_cumulative=("steps_cumulative", "max"),
            total_increments=("steps_increment", "sum"),
            n_rows=("steps_increment", "size")
        )
        .reset_index()
    )

    return {
        "fpca_score_1": fpca_score_1,

        "metadata": {
            "entity_id": entity_id,
            "local_timezone": local_timezone,
            "start_local": start_local.isoformat(),
            "end_local": end_local.isoformat(),
            "start_utc": start_utc.isoformat(),
            "end_utc": end_utc.isoformat(),
            "raw_rows_returned": int(len(data[0])),
            "clean_rows": int(len(df)),
            "bad_numeric_rows": int(len(bad_numeric_rows)),
            "reset_rows": int(len(reset_rows)),
            "hourly_rows": int(len(hourly)),
            "mean_curve_file": mean_curve_file,
            "eigenfunction_file": eigenfunction_file
        },

        "summary": {
            "total_steps_last_7_complete_days": float(fitbit_week_curve.sum()),
            "mean_hourly_steps": float(fitbit_week_curve.mean()),
            "max_hourly_steps": float(fitbit_week_curve.max()),
            "min_hourly_steps": float(fitbit_week_curve.min()),
            "mean_nhanes_hourly_steps": float(nhanes_mean_curve.mean()),
            "mean_centered_value": float(fitbit_centered.mean()),
            "min_centered_value": float(fitbit_centered.min()),
            "max_centered_value": float(fitbit_centered.max())
        },

        "curves": {
            "fitbit_week_curve": fitbit_week_curve.tolist(),
            "nhanes_mean_curve": nhanes_mean_curve.tolist(),
            "fitbit_centered": fitbit_centered.tolist(),
            "eigenfunction_1": eigenfunction_1.tolist(),
            "score_contribution": score_contribution.tolist(),
            "cumulative_score": hourly["cumulative_score"].tolist()
        },

        "hourly": hourly.assign(
            hour_local=hourly["hour_local"].astype(str)
        ).to_dict(orient="records"),

        "daily_summary": daily_summary.to_dict(orient="records"),

        "reset_rows_preview": reset_rows.assign(
            last_changed_local=reset_rows["last_changed_local"].astype(str),
            last_changed_utc=reset_rows["last_changed_utc"].astype(str)
        ).head(20).to_dict(orient="records"),

        "bad_numeric_rows_preview": bad_numeric_rows.assign(
            last_changed=bad_numeric_rows["last_changed"].astype(str)
        ).head(20).to_dict(orient="records")
    }