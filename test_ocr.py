import base64
import urllib.request
import json

with open('test_ocr.jpg', 'rb') as f:
    data = base64.b64encode(f.read()).decode('utf-8')

req = urllib.request.Request(
    'http://localhost:9000/recognize',
    data=json.dumps({'image_base64': data}).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    response = urllib.request.urlopen(req)
    print("Status:", response.status)
    print("Response:", response.read().decode('utf-8'))
except urllib.error.URLError as e:
    print("Error:", e.reason)
except urllib.error.HTTPError as e:
    print("HTTP Error:", e.code, e.reason)
    print("Response:", e.read().decode('utf-8'))
