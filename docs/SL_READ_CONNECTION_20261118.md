# SL-READ-CONNECTION-20261118

Store uploader verified: ShengLongDailySLCloudSync2102 runs at 21:02 using AGY/gdrive managed login. It is independent from center legacy OAuth (invalid_grant). No uploader, ERP rows, database or Drive sharing changed.

Optional server-only SL_DRIVE_SERVICE_ACCOUNT_JSON selects a dedicated account with Drive readonly scope. Create service account without project roles, enable Drive API, share only the three existing SL CSV files to client_email as Viewer, set JSON as Sensitive Production environment variable on ERP project, redeploy current production version. Never send key through chat. Legacy credential configuration remains intact.

Validation: four synthetic account/JWT/error tests, three legacy OAuth tests, three authenticated read-probe tests, six cache/parser regression tests; assistant TypeScript and production build passed; browser verified no credential inputs and metadata-read success does not imply synchronized data. Actual latest-source synchronization remains blocked pending owner setup.

Code deployment status: pending at commit creation. Rollback to prior ERP dpl_D4VmbVWCSLyoM2aTqkRrsQqBqRYb and assistant dpl_33tijhSNojZeG7c7LC862FWt6k9w; no data rollback needed. No main merge/push. Drive maintenance sync pending_upload, no fixed maintenance file identified.
