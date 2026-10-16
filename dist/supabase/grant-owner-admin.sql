-- Run after the owner signs in once at /admin/login with Google.
-- This grants access only to the verified Google identity for the exact owner email.
do $$
declare owner_user_id uuid;
begin
  select u.id into owner_user_id
  from auth.users u
  join auth.identities i on i.user_id = u.id
  where lower(u.email) = 'gdsakib67@gmail.com'
    and u.email_confirmed_at is not null
    and i.provider = 'google'
    and lower(i.identity_data->>'email') = 'gdsakib67@gmail.com'
    and i.identity_data->>'email_verified' = 'true'
  limit 1;

  if owner_user_id is null then
    raise exception 'Verified Google account gdsakib67@gmail.com was not found. Complete Google sign-in first.';
  end if;

  insert into public.site_admins (user_id)
  values (owner_user_id)
  on conflict (user_id) do nothing;
end $$;
