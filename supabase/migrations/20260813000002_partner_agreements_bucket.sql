-- Storage bucket for partner agreement files
insert into storage.buckets (id, name, public)
values ('partner-agreements', 'partner-agreements', false)
on conflict (id) do nothing;

create policy "authenticated read partner-agreements"
  on storage.objects for select
  using (bucket_id = 'partner-agreements' and auth.uid() is not null);

create policy "authenticated upload partner-agreements"
  on storage.objects for insert
  with check (bucket_id = 'partner-agreements' and auth.uid() is not null);

create policy "authenticated delete partner-agreements"
  on storage.objects for delete
  using (bucket_id = 'partner-agreements' and auth.uid() is not null);
