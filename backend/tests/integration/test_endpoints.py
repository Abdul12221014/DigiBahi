import requests

base = "http://localhost:8000/api/v1"


def test_health():
    assert requests.get(base + "/health").status_code == 200


def test_ledger():
    assert requests.get(base + "/ledger").status_code == 200


def test_sync():
    assert requests.post(base + "/sync", json=[]).status_code == 200


print("✅ All backend endpoints validated.")
