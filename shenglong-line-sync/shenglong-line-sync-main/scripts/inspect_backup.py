import os
import re
import time
from pathlib import Path

import pyodbc


SERVER = os.environ.get("SQL_SERVER", "127.0.0.1,1433")
PASSWORD = os.environ["MSSQL_SA_PASSWORD"]
BACKUP_PATH = "/var/opt/mssql/backup/ShengLong_hour.bak"
DATABASE = "ShengLongInspection"
REPORT_PATH = Path(os.environ.get("REPORT_PATH", "schema-report.md"))


def connect(database: str = "master", autocommit: bool = True):
    return pyodbc.connect(
        "DRIVER={ODBC Driver 18 for SQL Server};"
        f"SERVER={SERVER};DATABASE={database};UID=sa;PWD={PASSWORD};"
        "Encrypt=yes;TrustServerCertificate=yes;Connection Timeout=5",
        autocommit=autocommit,
    )


def wait_for_sql() -> None:
    last_error = None
    for _ in range(60):
        try:
            with connect() as connection:
                connection.cursor().execute("SELECT 1").fetchone()
                return
        except pyodbc.Error as error:
            last_error = error
            time.sleep(2)
    raise RuntimeError(f"SQL Server did not become ready: {last_error}")


def quote_identifier(value: str) -> str:
    return "[" + value.replace("]", "]]" ) + "]"


def sql_literal(value: str) -> str:
    return "N'" + value.replace("'", "''") + "'"


def restore_database() -> None:
    with connect() as connection:
        cursor = connection.cursor()
        rows = cursor.execute(
            f"RESTORE FILELISTONLY FROM DISK = {sql_literal(BACKUP_PATH)}"
        ).fetchall()
        columns = [column[0] for column in cursor.description]
        logical_index = columns.index("LogicalName")
        type_index = columns.index("Type")

        moves = []
        data_number = 0
        log_number = 0
        for row in rows:
            logical_name = str(row[logical_index])
            file_type = str(row[type_index]).upper()
            safe_name = re.sub(r"[^A-Za-z0-9_-]+", "_", logical_name).strip("_")
            if file_type == "L":
                log_number += 1
                suffix = "_log.ldf" if log_number == 1 else f"_log_{log_number}.ldf"
            else:
                data_number += 1
                suffix = ".mdf" if data_number == 1 else f"_{data_number}.ndf"
            physical_path = f"/var/opt/mssql/data/{safe_name or DATABASE}{suffix}"
            moves.append(
                f"MOVE {sql_literal(logical_name)} TO {sql_literal(physical_path)}"
            )

        cursor.execute(
            f"IF DB_ID({sql_literal(DATABASE)}) IS NOT NULL "
            f"BEGIN ALTER DATABASE {quote_identifier(DATABASE)} SET SINGLE_USER WITH ROLLBACK IMMEDIATE; "
            f"DROP DATABASE {quote_identifier(DATABASE)}; END"
        )
        cursor.execute(
            f"RESTORE DATABASE {quote_identifier(DATABASE)} "
            f"FROM DISK = {sql_literal(BACKUP_PATH)} WITH "
            + ", ".join(moves)
            + ", RECOVERY, REPLACE, STATS = 10"
        )
        while cursor.nextset():
            pass


def wait_for_database() -> None:
    last_state = "not found"
    for _ in range(90):
        with connect() as connection:
            row = connection.cursor().execute(
                "SELECT state_desc FROM sys.databases WHERE name = ?", DATABASE
            ).fetchone()
            last_state = str(row[0]) if row else "not found"
            if last_state == "ONLINE":
                return
        time.sleep(2)
    raise RuntimeError(f"Restored database did not become ready: {last_state}")


def inspect_schema() -> list[dict]:
    query = """
    SELECT
        s.name AS schema_name,
        t.name AS table_name,
        p.row_count,
        c.column_id,
        c.name AS column_name,
        ty.name AS data_type,
        c.max_length,
        c.is_nullable
    FROM sys.tables AS t
    JOIN sys.schemas AS s ON s.schema_id = t.schema_id
    JOIN sys.columns AS c ON c.object_id = t.object_id
    JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
    OUTER APPLY (
        SELECT SUM(ps.row_count) AS row_count
        FROM sys.dm_db_partition_stats AS ps
        WHERE ps.object_id = t.object_id AND ps.index_id IN (0, 1)
    ) AS p
    WHERE t.is_ms_shipped = 0
    ORDER BY s.name, t.name, c.column_id;
    """
    with connect(DATABASE) as connection:
        cursor = connection.cursor()
        rows = cursor.execute(query).fetchall()
        return [
            {
                "schema": row.schema_name,
                "table": row.table_name,
                "rows": int(row.row_count or 0),
                "column": row.column_name,
                "type": row.data_type,
                "max_length": int(row.max_length),
                "nullable": bool(row.is_nullable),
            }
            for row in rows
        ]


def write_report(columns: list[dict]) -> None:
    keywords = ("customer", "client", "member", "cust", "tel", "phone", "mobile", "address", "name", "客戶", "電話", "地址", "姓名")
    grouped: dict[tuple[str, str], list[dict]] = {}
    for column in columns:
        grouped.setdefault((column["schema"], column["table"]), []).append(column)

    ranked = sorted(
        grouped.items(),
        key=lambda item: (
            -sum(
                1
                for column in item[1]
                if any(
                    keyword in f"{item[0][1]} {column['column']}".lower()
                    for keyword in keywords
                )
            ),
            -item[1][0]["rows"],
            item[0],
        ),
    )

    lines = [
        "# ShengLong backup schema report",
        "",
        "> This report contains schema names, column names, data types, and row counts only.",
        "> It intentionally contains no customer row values.",
        "",
        f"Tables discovered: {len(grouped)}",
        "",
    ]
    for (schema, table), table_columns in ranked:
        lines.extend(
            [
                f"## {schema}.{table}",
                "",
                f"Approximate rows: {table_columns[0]['rows']}",
                "",
                "| Column | Type | Nullable |",
                "|---|---|---|",
            ]
        )
        for column in table_columns:
            size = "max" if column["max_length"] == -1 else str(column["max_length"])
            lines.append(
                f"| {column['column']} | {column['type']}({size}) | "
                f"{'yes' if column['nullable'] else 'no'} |"
            )
        lines.append("")

    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote schema-only report for {len(grouped)} tables to {REPORT_PATH}")


def main() -> None:
    wait_for_sql()
    restore_database()
    wait_for_database()
    write_report(inspect_schema())


if __name__ == "__main__":
    main()

