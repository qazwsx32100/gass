import io
import json
import os
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload


def main() -> None:
    file_id = os.environ["DRIVE_FILE_ID"]
    credentials_info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    destination = Path(os.environ.get("BACKUP_PATH", "/tmp/ShengLong_hour.bak"))

    credentials = service_account.Credentials.from_service_account_info(
        credentials_info,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    drive = build("drive", "v3", credentials=credentials, cache_discovery=False)
    metadata = (
        drive.files()
        .get(fileId=file_id, fields="id,name,size,modifiedTime,md5Checksum")
        .execute()
    )

    destination.parent.mkdir(parents=True, exist_ok=True)
    request = drive.files().get_media(fileId=file_id)
    with destination.open("wb") as output:
        downloader = MediaIoBaseDownload(output, request, chunksize=8 * 1024 * 1024)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            if status:
                print(f"Download progress: {int(status.progress() * 100)}%")

    expected_size = int(metadata.get("size", 0))
    actual_size = destination.stat().st_size
    if expected_size and expected_size != actual_size:
        raise RuntimeError(
            f"Downloaded size mismatch: expected {expected_size}, got {actual_size}"
        )

    print(
        json.dumps(
            {
                "file_id": metadata["id"],
                "name": metadata["name"],
                "size": actual_size,
                "modified_time": metadata.get("modifiedTime"),
                "md5": metadata.get("md5Checksum"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()

