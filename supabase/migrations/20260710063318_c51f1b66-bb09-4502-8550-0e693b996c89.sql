
CREATE TABLE public.user_github_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_ciphertext text NOT NULL,
  token_iv text NOT NULL,
  token_tag text NOT NULL,
  token_hint text NOT NULL,
  login text,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_github_tokens TO authenticated;
GRANT ALL ON public.user_github_tokens TO service_role;

ALTER TABLE public.user_github_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own github token"
  ON public.user_github_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_github_tokens_updated_at
  BEFORE UPDATE ON public.user_github_tokens
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
