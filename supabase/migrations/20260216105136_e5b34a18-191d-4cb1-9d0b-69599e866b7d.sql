-- Enable realtime for mentions table so dashboard can show live threat feed
ALTER PUBLICATION supabase_realtime ADD TABLE public.mentions;

-- Add a saved_filters table for saved search filters feature
CREATE TABLE public.saved_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own saved filters"
  ON public.saved_filters FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
