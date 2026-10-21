"""Upload a zip to the Chrome Web Store (API v2) and submit it for review.

Reads three environment variables, set as GitHub repository secrets:
    CWS_SERVICE_ACCOUNT_KEY   the service account's JSON key (the whole file contents)
    CWS_PUBLISHER_ID          from Developer Dashboard > Publisher > Settings
    CWS_EXTENSION_ID          the 32-letter item ID shown on the item's dashboard page
"""
import json
import os
import sys
import time

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

SCOPE = "https://www.googleapis.com/auth/chromewebstore"
API = "https://chromewebstore.googleapis.com"


def main(zip_path):
    key = json.loads(os.environ["CWS_SERVICE_ACCOUNT_KEY"])
    publisher = os.environ["CWS_PUBLISHER_ID"].strip()
    item = os.environ["CWS_EXTENSION_ID"].strip()

    creds = service_account.Credentials.from_service_account_info(key, scopes=[SCOPE])
    creds.refresh(Request())
    headers = {"Authorization": f"Bearer {creds.token}"}
    item_path = f"publishers/{publisher}/items/{item}"

    print(f"Uploading {zip_path} ...")
    with open(zip_path, "rb") as fh:
        r = requests.post(f"{API}/upload/v2/{item_path}:upload", headers=headers, data=fh, timeout=300)
    print(r.status_code, r.text)
    if not r.ok:
        sys.exit("Upload failed. A common cause is a manifest version that is not higher than the one in the store.")

    # Give the store a moment to finish processing the package before submitting.
    for attempt in range(6):
        time.sleep(15)
        s = requests.get(f"{API}/v2/{item_path}:fetchStatus", headers=headers, timeout=60)
        print("status:", s.status_code, s.text[:500])
        if s.ok and "IN_PROGRESS" not in s.text:
            break

    print("Submitting for review ...")
    p = requests.post(f"{API}/v2/{item_path}:publish", headers=headers, json={}, timeout=60)
    print(p.status_code, p.text)
    if not p.ok:
        sys.exit("Submit failed. The upload went through, so you can submit it from the Developer Dashboard instead.")
    print("Submitted. Google will email the developer account when review finishes.")


if __name__ == "__main__":
    main(sys.argv[1])
