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
