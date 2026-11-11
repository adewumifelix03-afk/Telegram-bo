
create extension if not exists pgcrypto;

-- JOBS TABLE
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  company text not null,
  category text not null,
  job_type text not null,
  location text not null,
  salary text,
  description text not null,
  application_note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

-- APPLICATIONS TABLE
create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null,
  phone text not null,
  cover_note text not null,
  cv_path text not null,
  status text not null default 'submitted'
    check (status in ('submitted', 'shortlisted', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  unique (job_id, applicant_id)
);

create index if not exists jobs_status_idx
on public.jobs(status);

create index if not exists applications_job_id_idx
on public.applications(job_id);

-- ENABLE SECURITY
alter table public.jobs enable row level security;
alter table public.applications enable row level security;

-- REMOVE OLD POLICIES BEFORE CREATING THEM
drop policy if exists "Read approved jobs or own jobs" on public.jobs;
drop policy if exists "Users submit pending jobs" on public.jobs;
drop policy if exists "Applicants and employers read applications" on public.applications;
drop policy if exists "Users apply to approved jobs" on public.applications;
drop policy if exists "Employers update their applications" on public.applications;

-- JOB POLICIES
create policy "Read approved jobs or own jobs"
on public.jobs for select
to anon, authenticated
using (status = 'approved' or user_id = auth.uid());

create policy "Users submit pending jobs"
on public.jobs for insert
to authenticated
with check (
  user_id = auth.uid()
  and status = 'pending'
);

-- APPLICATION POLICIES
create policy "Applicants and employers read applications"
on public.applications for select
to authenticated
using (
  applicant_id = auth.uid()
  or exists (
    select 1 from public.jobs
    where jobs.id = applications.job_id
    and jobs.user_id = auth.uid()
  )
);

create policy "Users apply to approved jobs"
on public.applications for insert
to authenticated
with check (
  applicant_id = auth.uid()
  and exists (
    select 1 from public.jobs
    where jobs.id = applications.job_id
    and jobs.status = 'approved'
  )
);

create policy "Employers update their applications"
on public.applications for update
to authenticated
using (
  exists (
    select 1 from public.jobs
    where jobs.id = applications.job_id
    and jobs.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.jobs
    where jobs.id = applications.job_id
    and jobs.user_id = auth.uid()
  )
);

-- TABLE PERMISSIONS
grant select on public.jobs to anon, authenticated;
grant insert on public.jobs to authenticated;
grant select, insert, update on public.applications to authenticated;

-- PRIVATE CV STORAGE BUCKET
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
)
values (
  'cv-files',
  'cv-files',
  false,
  5242880,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = excluded.allowed_mime_types;

-- STORAGE POLICIES
drop policy if exists "Applicants upload their own CV" on storage.objects;
drop policy if exists "Applicants and employers view CVs" on storage.objects;
drop policy if exists "Applicants delete their own CV" on storage.objects;

create policy "Applicants upload their own CV"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'cv-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Applicants and employers view CVs"
on storage.objects for select
to authenticated
using (
  bucket_id = 'cv-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.applications a
      join public.jobs j on j.id = a.job_id
      where a.cv_path = storage.objects.name
      and j.user_id = auth.uid()
    )
  )
);

create policy "Applicants delete their own CV"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'cv-files'
  and (storage.foldername(name))[1] = auth.uid()::text
);
