-- Task Amigo storage objects and buckets were removed through the Storage API
-- before this migration so the underlying files were not orphaned.
drop policy if exists "Users can only see their own ID fs6ukl_0" on storage.objects;
drop policy if exists "image 1oj01fe_0" on storage.objects;

drop table if exists public."Application";
drop table if exists public."CastingGallery";
drop table if exists public."CompanyProfile";
drop table if exists public."CreditHistory";
drop table if exists public."FavoriteJob";
drop table if exists public."FavoriteTalent";
drop table if exists public."GroupMessage";
drop table if exists public."Message";
drop table if exists public."Notification";
drop table if exists public."Review";
drop table if exists public."Schedule";
drop table if exists public."WorkspaceMember";
drop table if exists public."Job";
drop table if exists public."Workspace";
drop table if exists public."User";

drop type if exists public."JobStatus";
drop type if exists public."MemberRole";
drop type if exists public."Role";
