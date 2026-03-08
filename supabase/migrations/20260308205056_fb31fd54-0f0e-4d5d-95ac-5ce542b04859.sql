-- Add UPDATE policy for escalation_comments (owner can edit their own)
CREATE POLICY "Update own esc comments"
ON public.escalation_comments
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Add DELETE policy for escalation_comments (owner can delete their own)
CREATE POLICY "Delete own esc comments"
ON public.escalation_comments
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);