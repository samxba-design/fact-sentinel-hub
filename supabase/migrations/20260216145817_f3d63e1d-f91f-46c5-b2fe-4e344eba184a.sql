
-- Beta invite codes table
CREATE TABLE public.beta_invite_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT,
  max_uses INT DEFAULT 50,
  times_used INT DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.beta_invite_codes ENABLE ROW LEVEL SECURITY;

-- Only super admins can manage codes
CREATE POLICY "Super admins can manage invite codes"
  ON public.beta_invite_codes
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Anyone can read codes to validate them (we'll use an edge function instead for security)
-- We'll use a DB function for code validation to avoid exposing the table

CREATE OR REPLACE FUNCTION public.redeem_beta_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record beta_invite_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_record FROM beta_invite_codes WHERE code = p_code;
  
  IF v_record IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'Invalid invite code');
  END IF;
  
  IF v_record.expires_at IS NOT NULL AND v_record.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite code has expired');
  END IF;
  
  IF v_record.max_uses IS NOT NULL AND v_record.times_used >= v_record.max_uses THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'This invite code has reached its usage limit');
  END IF;
  
  -- Increment usage
  UPDATE beta_invite_codes SET times_used = times_used + 1 WHERE id = v_record.id;
  
  RETURN jsonb_build_object('valid', true, 'label', v_record.label);
END;
$$;
