import json
import math
import os

import numpy as np
import pandas as pd
from flask import Flask, jsonify, send_from_directory

from fpca import get_fpca_score_from_home_assistant_steps

app = Flask(__name__)


# =========================================================
# JSON SANITIZATION
# =========================================================


def _is_finite_number(value):
    try:
        if isinstance(value, (np.floating, np.integer)):
            return np.isfinite(value)
        if isinstance(value, (float, int)):
            return math.isfinite(value)
    except Exception:
        return False
    return False


def sanitize_for_json(value):
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    if _is_finite_number(value):
        if isinstance(value, (np.floating, np.integer)):
            return value.item()
        return value
    if isinstance(value, (float, np.floating)) and not _is_finite_number(value):
        return None
    return value


# =========================================================
# CONFIG
# =========================================================

MEAN_CURVE_FILE = "nhanes_mean_curve.csv"

EIGENFUNCTION_FILE = "nhanes_first_eigenfunction.csv"

FPCA_SPLINE_LOOKUP_FILE = "fpca_spline_lookup.csv"

OPTIONS_FILE = os.environ.get("OPTIONS_FILE", "/data/options.json")


# =========================================================
# LOAD FILES
# =========================================================

fpca_spline_lookup = pd.read_csv(FPCA_SPLINE_LOOKUP_FILE)


# =========================================================
# LOAD OPTIONS
# =========================================================


def load_options():

    with open(OPTIONS_FILE, "r") as f:
        return json.load(f)


# =========================================================
# FRONTEND
# =========================================================


@app.route("/")
def frontend_index():

    return send_from_directory("frontend", "index.html")


@app.route("/<path:path>")
def frontend_files(path):

    return send_from_directory("frontend", path)


# =========================================================
# SPLINE BASIS
# =========================================================


def get_spline_basis(fpca_value):

    spline_1 = np.interp(
        fpca_value, fpca_spline_lookup["FPCA_score_1"], fpca_spline_lookup["spline_1"]
    )

    spline_2 = np.interp(
        fpca_value, fpca_spline_lookup["FPCA_score_1"], fpca_spline_lookup["spline_2"]
    )

    return (float(spline_1), float(spline_2))


# =========================================================
# WEIBULL AFT MODEL
# =========================================================


def predict_weibull_aft_output(
    FPCA_score_1,
    age,
    bmi,
    sex,
    race_ethnicity,
    education,
    marital_status,
    smoking_status,
    alcohol_use,
    hypertension,
    diabetes,
    heart_attack,
    stroke,
    cancer,
    self_rated_health,
):

    coef = {
        "intercept": 7.89279433,
        "ns1": 1.93089454,
        "ns2": -0.56588233,
        "age": -0.04878875,
        "bmi": 0.02025148,
        "sexMale": -0.28989745,
        "race_ethnicityNon-Hispanic Asian": 0.28380119,
        "race_ethnicityNon-Hispanic Black": -0.02345840,
        "race_ethnicityNon-Hispanic White": -0.18864862,
        "race_ethnicityOther Hispanic": 0.08283462,
        "race_ethnicityOther Race - Including Multi-Racial": -0.26372838,
        "education9-11th grade": -0.10724416,
        "educationCollege graduate+": 0.10848801,
        "educationHigh school/GED": -0.05414186,
        "educationSome college/AA": 0.01665806,
        "marital_statusLiving with partner": 0.17851851,
        "marital_statusMarried": 0.26872477,
        "marital_statusNever married": -0.01318489,
        "marital_statusSeparated": 0.06957856,
        "marital_statusWidowed": 0.04304238,
        "smoking_statusFormer": 0.10268801,
        "smoking_statusNever": 0.17044365,
        "alcohol_useYes": 0.09468026,
        "hypertensionYes": -0.07260832,
        "diabetesYes": -0.08793194,
        "heart_attackYes": -0.14861059,
        "strokeYes": -0.05022834,
        "cancerYes": -0.17502062,
        "self_rated_healthFair": -0.51212461,
        "self_rated_healthGood": -0.18110561,
        "self_rated_healthPoor": -0.78647649,
        "self_rated_healthVery good": -0.14214766,
    }

    scale = 0.652035

    weibull_shape = 1 / scale

    ns1, ns2 = get_spline_basis(FPCA_score_1)

    lp = coef["intercept"]

    lp += coef["ns1"] * ns1
    lp += coef["ns2"] * ns2

    lp += coef["age"] * float(age)
    lp += coef["bmi"] * float(bmi)

    categorical_inputs = {
        f"sex{sex}": sex,
        f"race_ethnicity{race_ethnicity}": race_ethnicity,
        f"education{education}": education,
        f"marital_status{marital_status}": marital_status,
        f"smoking_status{smoking_status}": smoking_status,
        f"alcohol_use{alcohol_use}": alcohol_use,
        f"hypertension{hypertension}": hypertension,
        f"diabetes{diabetes}": diabetes,
        f"heart_attack{heart_attack}": heart_attack,
        f"stroke{stroke}": stroke,
        f"cancer{cancer}": cancer,
        f"self_rated_health{self_rated_health}": self_rated_health,
    }

    active_coefficients = {}

    for key in categorical_inputs:
        if key in coef:
            lp += coef[key]

            active_coefficients[key] = coef[key]

    predicted_median_months = math.exp(lp) * (math.log(2) ** scale)

    predicted_median_years = predicted_median_months / 12

    predicted_median_age_at_death = float(age) + predicted_median_years

    weibull_scale_param = math.exp(lp)

    survival_5yr = math.exp(-((60 / weibull_scale_param) ** weibull_shape))

    survival_10yr = math.exp(-((120 / weibull_scale_param) ** weibull_shape))

    survival_15yr = math.exp(-((180 / weibull_scale_param) ** weibull_shape))

    return {
        "input_FPCA_score_1": float(FPCA_score_1),
        "spline_basis_ns1": float(ns1),
        "spline_basis_ns2": float(ns2),
        "linear_predictor_log_months": float(lp),
        "predicted_median_survival_months": float(predicted_median_months),
        "predicted_median_survival_years": float(predicted_median_years),
        "predicted_median_age_at_death": float(predicted_median_age_at_death),
        "predicted_probability_of_dying_within_5_years": float(1 - survival_5yr),
        "predicted_probability_of_dying_within_10_years": float(1 - survival_10yr),
        "predicted_probability_of_dying_within_15_years": float(1 - survival_15yr),
        "predicted_probability_of_surviving_5_years": float(survival_5yr),
        "predicted_probability_of_surviving_10_years": float(survival_10yr),
        "predicted_probability_of_surviving_15_years": float(survival_15yr),
        "weibull_scale_survreg": float(scale),
        "weibull_shape": float(weibull_shape),
        "active_categorical_coefficients": active_coefficients,
    }


# =========================================================
# ROUTES
# =========================================================


@app.route("/api/health")
def health():

    return jsonify({"status": "ok", "message": "FPCA AFT backend running"})


@app.route("/api/debug/supervisor")
def debug_supervisor():
    return jsonify(
        {
            "env": {
                "SUPERVISOR_TOKEN": bool(os.environ.get("SUPERVISOR_TOKEN")),
                "HASSIO_TOKEN": bool(os.environ.get("HASSIO_TOKEN")),
            },
            "paths": {
                "/var/run/supervisor/token": os.path.exists("/var/run/supervisor/token"),
                "/run/supervisor/token": os.path.exists("/run/supervisor/token"),
                "/run/secrets/supervisor_token": os.path.exists("/run/secrets/supervisor_token"),
            },
        }
    )


@app.route("/api/aft")
def api_aft():
    try:
        options = load_options()

        print("\n==============================")
        print("RUNNING REAL HOME ASSISTANT FPCA")
        print("==============================")
        print("Entity:", options["steps_entity_id"])
        print("Timezone:", options["timezone"])

        fpca_result = get_fpca_score_from_home_assistant_steps(
            entity_id=options["steps_entity_id"],
            local_timezone=options["timezone"],
            mean_curve_file=MEAN_CURVE_FILE,
            eigenfunction_file=EIGENFUNCTION_FILE,
        )

        aft_result = predict_weibull_aft_output(
            FPCA_score_1=fpca_result["fpca_score_1"],
            age=options["age"],
            bmi=options["bmi"],
            sex=options["sex"],
            race_ethnicity=options["race_ethnicity"],
            education=options["education"],
            marital_status=options["marital_status"],
            smoking_status=options["smoking_status"],
            alcohol_use=options["alcohol_use"],
            hypertension=options["hypertension"],
            diabetes=options["diabetes"],
            heart_attack=options["heart_attack"],
            stroke=options["stroke"],
            cancer=options["cancer"],
            self_rated_health=options["self_rated_health"],
        )

        payload = {"options": options, "fpca": fpca_result, "aft": aft_result}

        return jsonify(sanitize_for_json(payload))
    except Exception as exc:
        return jsonify(
            {"error": "backend_error", "message": str(exc), "type": exc.__class__.__name__}
        ), 500


# =========================================================
# RUN FLASK
# =========================================================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5056, debug=True, threaded=True, use_reloader=True)
