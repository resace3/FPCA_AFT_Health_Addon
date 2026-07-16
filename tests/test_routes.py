import app


def test_health_endpoint():
    client = app.app.test_client()
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["status"] == "ok"


def test_frontend_index_served():
    client = app.app.test_client()
    response = client.get("/")
    assert response.status_code == 200
    assert b">Overview<" in response.data
    assert b">Activity Rhythm<" in response.data
    assert b">Configuration<" in response.data
    assert b'id="profile-form"' in response.data
    assert response.data.count(b'role="tab"') == 3
    assert b"Activity Pattern Multiplier" not in response.data
    assert b"FPCA score" not in response.data


def test_frontend_uses_ingress_safe_api_paths():
    client = app.app.test_client()
    response = client.get("/app.js")
    assert response.status_code == 200
    source = response.get_data(as_text=True)
    for endpoint in ("./api/health", "./api/aft", "./api/profile"):
        assert endpoint in source
    assert 'fetch("/api/' not in source


def test_profile_endpoint_round_trip(tmp_path, monkeypatch):
    profile_file = tmp_path / "health_profile.json"
    monkeypatch.setattr(app, "PROFILE_FILE", str(profile_file))
    monkeypatch.setattr(app, "OPTIONS_FILE", str(tmp_path / "missing-options.json"))

    client = app.app.test_client()
    profile = client.get("/api/profile").get_json()
    assert profile["steps_entity_id"] == "sensor.nick_r_steps"

    profile["age"] = 51
    response = client.put("/api/profile", json=profile)
    assert response.status_code == 200
    assert response.get_json()["age"] == 51
    assert client.get("/api/profile").get_json()["age"] == 51
