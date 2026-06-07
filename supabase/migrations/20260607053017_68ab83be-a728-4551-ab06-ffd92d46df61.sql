ALTER TABLE public.budget_scenarios REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_scenarios;