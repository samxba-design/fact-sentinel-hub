-- Add DELETE policy for people table (authenticated users can delete)
CREATE POLICY "Authenticated can delete people"
ON public.people
FOR DELETE
TO authenticated
USING (true);