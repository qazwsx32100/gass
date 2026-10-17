#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
盛隆瓦斯 — 將階段 2 完工報告自動上傳至 Google Drive 指定資料夾

目標資料夾：1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM
支援環境：GitHub Actions (讀取 secrets.GOOGLE_SERVICE_ACCOUNT_JSON) 或 本機環境
"""

import json
import os
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

FOLDER_ID = os.environ.get("GOOGLE_DRIVE_FOLDER_ID", "1YT7yfMfVmiVic_vaIWf94Ei14wMa3FYM")
SCOPES = ["https://www.googleapis.com/auth/drive.file", "https://www.googleapis.com/auth/drive"]


def get_drive_service():
    sa_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json:
        # 嘗試尋找本地 json 檔案
        candidate_paths = [
            Path("c:/Gass/service_account.json"),
            Path("c:/Gass/google_service_account.json"),
            Path(__file__).resolve().parent.parent / "service_account.json",
        ]
        for p in candidate_paths:
            if p.exists():
                sa_json = p.read_text(encoding="utf-8")
                break

    if not sa_json:
        raise RuntimeError("缺少 GOOGLE_SERVICE_ACCOUNT_JSON 環境變數或本地憑證檔案")

    info = json.loads(sa_json)
    credentials = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("drive", "v3", credentials=credentials, cache_discovery=False)


def upload_file(drive, file_path: Path, mime_type: str, custom_name: str = None):
    name = custom_name or file_path.name
    print(f"正在上傳: {name} (MIME: {mime_type}) 到資料夾: {FOLDER_ID} ...")

    # 檢查是否已存在同名檔案，若存在則更新，若無則建立
    query = f"'{FOLDER_ID}' in parents and name = '{name}' and trashed = false"
    existing = drive.files().list(q=query, fields="files(id, name)").execute().get("files", [])

    media = MediaFileUpload(str(file_path), mimetype=mime_type, resumable=True)

    if existing:
        file_id = existing[0]["id"]
        print(f"檔案已存在 (ID: {file_id})，執行覆寫更新...")
        updated = drive.files().update(
            fileId=file_id,
            media_body=media,
            fields="id, name, webViewLink, webContentLink"
        ).execute()
        return updated
    else:
        file_metadata = {
            "name": name,
            "parents": [FOLDER_ID]
        }
        created = drive.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, webViewLink, webContentLink"
        ).execute()
        return created


def main():
    root_dir = Path(__file__).resolve().parent.parent
    md_file = root_dir / "docs" / "LINE_ORDER_INGEST_STAGE2_REPORT.md"
    html_file = root_dir / "public" / "reports" / "stage2.html"

    if not md_file.exists():
        print(f"[錯誤] 找不到 Markdown 報告檔案: {md_file}")
        sys.exit(1)

    try:
        drive = get_drive_service()
    except Exception as e:
        print(f"[錯誤] Google Drive 服務初始化失敗: {e}")
        sys.exit(1)

    results = []

    # 1. 上傳 Markdown 版報告
    res_md = upload_file(
        drive,
        md_file,
        "text/markdown",
        "盛隆瓦斯_LINE訂單自動匯入舊進銷存系統_階段2專案報告.md"
    )
    print(f"✅ Markdown 版上傳成功: {res_md.get('webViewLink')}")
    results.append(res_md)

    # 2. 上傳獨立 HTML 網頁版報告
    if html_file.exists():
        res_html = upload_file(
            drive,
            html_file,
            "text/html",
            "盛隆瓦斯_LINE訂單自動匯入舊進銷存系統_階段2專案報告.html"
        )
        print(f"✅ HTML 網頁版上傳成功: {res_html.get('webViewLink')}")
        results.append(res_html)

    print("\n==========================================")
    print("🎉 報告已成功同步至 Google Drive 指定資料夾！")
    for r in results:
        print(f"- {r.get('name')}: {r.get('webViewLink')}")
    print("==========================================")


if __name__ == "__main__":
    main()
