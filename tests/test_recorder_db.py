from datetime import datetime, timedelta, timezone

import app

from recorder_db_fixture import create_recorder_db

ENTITY_ID = "sensor.nick_r_steps"


def test_api_aft_uses_recorder_db_and_renders_week_curve(monkeypatch, tmp_path):
    now_utc = datetime.now(timezone.utc)
    end_utc = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = end_utc - timedelta(days=7)

    db_path = tmp_path / "config" / "home-assistant_v2.db"
    create_recorder_db(db_path, ENTITY_ID, start_utc=start_utc, end_utc=end_utc)

    monkeypatch.setenv("HA_RECORDER_DB_PATH", str(db_path))
    monkeypatch.setattr(
        app,
        "load_profile",
        lambda: {
            "steps_entity_id": ENTITY_ID,
            "timezone": "UTC",
            "age": 50,
            "bmi": 27,
            "sex": "Male",
            "race_ethnicity": "Non-Hispanic White",
            "education": "College graduate+",
            "marital_status": "Married",
            "smoking_status": "Never",
            "alcohol_use": "Yes",
            "hypertension": "Yes",
            "diabetes": "No",
            "heart_attack": "No",
            "stroke": "No",
            "cancer": "No",
            "self_rated_health": "Good",
        },
    )

    client = app.app.test_client()
    response = client.get("/api/aft")

    assert response.status_code == 200

    payload = response.get_json()
    fpca = payload["fpca"]
    curves = fpca["curves"]

    assert fpca["metadata"]["raw_rows_returned"] == 168
    assert fpca["metadata"]["bad_numeric_rows"] == 1
    assert fpca["metadata"]["hourly_rows"] == 168
    assert fpca["metadata"]["start_utc"] == start_utc.isoformat()
    assert fpca["metadata"]["end_utc"] == end_utc.isoformat()

    assert len(curves["fitbit_week_curve"]) == 168
    assert len(curves["nhanes_mean_curve"]) == 168
    assert len(curves["fitbit_centered"]) == 168
    assert len(curves["eigenfunction_1"]) == 168
    assert len(curves["score_contribution"]) == 168
    assert len(curves["cumulative_score"]) == 168

    assert fpca["summary"]["total_steps_last_7_complete_days"] > 0
    assert max(curves["fitbit_week_curve"]) > 0
