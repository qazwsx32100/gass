import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo

from google.oauth2 import service_account
from googleapiclient.discovery import build

from inspect_backup import DATABASE, connect, restore_database, wait_for_database, wait_for_sql


SPREADSHEET_ID = os.environ["MEMBER_SPREADSHEET_ID"]
SHEET_NAME = "會員資料"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
HEADERS = [
    "客戶編號", "區域名稱", "客戶稱呼", "會員／聯絡人姓名", "聯絡電話",
    "完整地址", "簡短地址", "客戶類型", "備註", "區碼", "啟用狀態",
    "同步時間", "50公斤歷史單價", "50公斤使用紀錄", "20公斤歷史單價",
    "20公斤使用紀錄", "18公斤歷史單價", "18公斤使用紀錄",
    "16公斤歷史單價", "16公斤使用紀錄", "10公斤歷史單價",
    "10公斤使用紀錄", "新4公斤歷史單價", "新4公斤使用紀錄",
    "4公斤歷史單價", "4公斤使用紀錄",
]
COLUMN_WIDTHS = [95, 110, 120, 135, 135, 260, 180, 100, 220, 75, 90, 160] + [105] * 14


def normalize(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    return " ".join(str(value).replace("\x00", "").split())


def read_customers() -> list[list]:
    query = """
    SELECT
        customer_id, location_name, customer_name, leader_name, customer_tel,
        customer_address, short_addr, customer_type, customer_remarks,
        areacode, active,
        price_50kg, use_50kg, price_20kg, use_20kg,
        price_18kg, use_18kg, price_16kg, use_16kg,
        price_10kg, use_10kg, price_new_4kg, use_new_4kg,
        price_4kg, use_4kg
    FROM dbo.customers
    ORDER BY customer_id;
    """
    synced_at = datetime.now(ZoneInfo("Asia/Taipei")).isoformat(timespec="seconds")
    with connect(DATABASE) as connection:
        rows = connection.cursor().execute(query).fetchall()
    return [
        [*(normalize(value) for value in row[:11]), synced_at,
         *(normalize(value) for value in row[11:])]
        for row in rows
    ]


def sheets_service():
    service_account_info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    credentials = service_account.Credentials.from_service_account_info(
        service_account_info, scopes=SCOPES
    )
    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def replace_member_sheet(rows: list[list]) -> None:
    service = sheets_service()
    values = [HEADERS, *rows]
    metadata = service.spreadsheets().get(
        spreadsheetId=SPREADSHEET_ID, fields="sheets.properties"
    ).execute()
    member_sheet = next(
        sheet for sheet in metadata["sheets"]
        if sheet["properties"]["title"] == SHEET_NAME
    )
    sheet_id = member_sheet["properties"]["sheetId"]
    current_rows = member_sheet["properties"]["gridProperties"]["rowCount"]
    required_rows = max(len(values) + 50, 1000)
    requests = []
    if current_rows < required_rows:
        service.spreadsheets().batchUpdate(
            spreadsheetId=SPREADSHEET_ID,
            body={"requests": [{
                "updateSheetProperties": {
                    "properties": {
                        "sheetId": sheet_id,
                        "gridProperties": {"rowCount": required_rows},
                    },
                    "fields": "gridProperties.rowCount",
                }
            }]},
        ).execute()

    service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{SHEET_NAME}'!A:Z",
        body={},
    ).execute()
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'{SHEET_NAME}'!A1:Z{len(values)}",
        valueInputOption="RAW",
        body={"majorDimension": "ROWS", "values": values},
    ).execute()

    requests.extend([
        {
            "repeatCell": {
                "range": {
                    "sheetId": sheet_id,
                    "startRowIndex": 0,
                    "endRowIndex": 1,
                    "startColumnIndex": 0,
                    "endColumnIndex": len(HEADERS),
                },
                "cell": {
                    "userEnteredFormat": {
                        "backgroundColor": {
                            "red": 0.91, "green": 0.92, "blue": 0.93
                        },
                        "textFormat": {"bold": True},
                    }
                },
                "fields": "userEnteredFormat(backgroundColor,textFormat.bold)",
            }
        },
        {
            "updateSheetProperties": {
                "properties": {
                    "sheetId": sheet_id,
                    "gridProperties": {"frozenRowCount": 1},
                },
                "fields": "gridProperties.frozenRowCount",
            }
        },
        {
            "setBasicFilter": {
                "filter": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": 0,
                        "endRowIndex": len(values),
                        "startColumnIndex": 0,
                        "endColumnIndex": len(HEADERS),
                    }
                }
            }
        },
    ])
    requests.extend(
        {
            "updateDimensionProperties": {
                "range": {
                    "sheetId": sheet_id,
                    "dimension": "COLUMNS",
                    "startIndex": index,
                    "endIndex": index + 1,
                },
                "properties": {"pixelSize": width},
                "fields": "pixelSize",
            }
        }
        for index, width in enumerate(COLUMN_WIDTHS)
    )
    service.spreadsheets().batchUpdate(
        spreadsheetId=SPREADSHEET_ID, body={"requests": requests}
    ).execute()


def update_line_member_prices(rows: list[list]) -> None:
    service = sheets_service()
    price_by_customer = {
        str(row[0]): list(row[12:26])
        for row in rows
        if row and row[0] not in (None, "")
    }
    response = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID,
        range="'LINE會員'!A2:W1000",
        majorDimension="ROWS",
    ).execute()
    members = response.get("values", [])
    if not members:
        return
    updated = []
    for row in members:
        base = list(row[:9]) + [""] * max(0, 9 - len(row[:9]))
        updated.append(base + price_by_customer.get(str(base[1]), [""] * 14))
    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=f"'LINE會員'!A2:W{len(updated) + 1}",
        valueInputOption="RAW",
        body={"majorDimension": "ROWS", "values": updated},
    ).execute()


def main() -> None:
    wait_for_sql()
    restore_database()
    wait_for_database()
    customers = read_customers()
    replace_member_sheet(customers)
    update_line_member_prices(customers)
    print(f"Member sync complete: {len(customers)} customer rows updated.")


if __name__ == "__main__":
    main()
