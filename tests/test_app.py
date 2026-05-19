import math
import os
import sys

import numpy as np
import pytest

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

import app


def test_sanitize_for_json_handles_nan_and_numpy():
    payload = {
        "finite": np.float64(3.5),
        "nan_value": np.nan,
        "nested": [1, np.float32(2.25), np.nan],
    }

    sanitized = app.sanitize_for_json(payload)

    assert sanitized["finite"] == 3.5
    assert sanitized["nan_value"] is None
    assert sanitized["nested"][0] == 1
    assert sanitized["nested"][1] == 2.25
    assert sanitized["nested"][2] is None


def test_get_spline_basis_matches_lookup():
    fpca_value = 0.0

    expected_spline_1 = np.interp(
        fpca_value,
        app.fpca_spline_lookup["FPCA_score_1"],
        app.fpca_spline_lookup["spline_1"],
    )
    expected_spline_2 = np.interp(
        fpca_value,
        app.fpca_spline_lookup["FPCA_score_1"],
        app.fpca_spline_lookup["spline_2"],
    )

    spline_1, spline_2 = app.get_spline_basis(fpca_value)

    assert spline_1 == pytest.approx(float(expected_spline_1))
    assert spline_2 == pytest.approx(float(expected_spline_2))


def test_predict_weibull_aft_output_has_consistent_fields():
    result = app.predict_weibull_aft_output(
        FPCA_score_1=0.1,
        age=50,
        bmi=27,
        sex="Male",
        race_ethnicity="Non-Hispanic White",
        education="College graduate+",
        marital_status="Married",
        smoking_status="Never",
        alcohol_use="Yes",
        hypertension="Yes",
        diabetes="No",
        heart_attack="No",
        stroke="No",
        cancer="No",
        self_rated_health="Good",
    )

    assert result["predicted_median_survival_months"] > 0
    assert result["predicted_median_survival_years"] == pytest.approx(
        result["predicted_median_survival_months"] / 12
    )

    for key in (
        "predicted_probability_of_surviving_5_years",
        "predicted_probability_of_surviving_10_years",
        "predicted_probability_of_surviving_15_years",
        "predicted_probability_of_dying_within_5_years",
        "predicted_probability_of_dying_within_10_years",
        "predicted_probability_of_dying_within_15_years",
    ):
        value = result[key]
        assert 0 <= value <= 1
        assert math.isfinite(value)

    active = result["active_categorical_coefficients"]
    assert "sexMale" in active
    assert "race_ethnicityNon-Hispanic White" in active
    assert "educationCollege graduate+" in active
    assert "marital_statusMarried" in active
    assert "smoking_statusNever" in active
    assert "alcohol_useYes" in active
    assert "hypertensionYes" in active
    assert "self_rated_healthGood" in active
