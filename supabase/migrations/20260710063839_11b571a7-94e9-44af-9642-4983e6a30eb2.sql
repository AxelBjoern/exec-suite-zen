GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_github_tokens TO authenticated;
GRANT ALL ON public.user_github_tokens TO service_role;