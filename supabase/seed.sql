insert into public.apps (
  app_name,
  revenuecat_project_id,
  windsor_app_names,
  campaign_aliases,
  is_active
)
values
  ('Cado', 'Cado', array['Cado', 'Cado-AI Calorie Tracker'], array['cado', 'eatwise'], true),
  ('Dishit', 'Dishit', array['Dishit'], array['dishit'], true),
  ('Medzy', 'Medzy : GLP-1 Tracker', array['Medzy', 'Medzy : GLP-1 Tracker', 'Medzy GLP-1 Tracker'], array['medzy'], true),
  ('Crylens', 'Crylens', array['Crylens', 'CryLens'], array['crylens'], true),
  ('Fernly', 'Fernly', array['Fernly'], array['fernly'], true),
  ('Rate My Skin', 'Rate My Skin', array['Rate My Skin', 'Clara: AI Skin analyser', 'Clara AI Skin analyser'], array['clara', 'skin', 'rate my skin'], true)
on conflict (app_name) do update
set
  revenuecat_project_id = excluded.revenuecat_project_id,
  windsor_app_names = excluded.windsor_app_names,
  campaign_aliases = excluded.campaign_aliases,
  is_active = excluded.is_active;
