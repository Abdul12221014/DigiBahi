import requests

BASE = "http://localhost:8000/api/v1/ai/analytics"


def test_analytics_summary():
    assert requests.get(BASE + "/summary").status_code == 200


def test_analytics_trends():
    assert requests.get(BASE + "/trends").status_code == 200
