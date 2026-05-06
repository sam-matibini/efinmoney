CREATE OR REPLACE FUNCTION public.invoke_generate_receipt(p_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text := 'https://hgmskcvaeadnyovbroup.supabase.co/functions/v1/generate-receipt';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbXNrY3ZhZWFkbnlvdmJyb3VwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc5MTYwNDAsImV4cCI6MjA4MzQ5MjA0MH0.RLEn7EDysi6kgT9t_dOm92uwC5BeAU495wrDtvHypyM';
BEGIN
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon
    ),
    body := jsonb_build_object('transfer_id', p_transfer_id, 'email', true)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'invoke_generate_receipt failed: %', SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_transfer_completed_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status::text = 'completed' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.invoke_generate_receipt(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transfer_completed_receipt ON public.transfers;
CREATE TRIGGER trg_transfer_completed_receipt
AFTER UPDATE ON public.transfers
FOR EACH ROW
EXECUTE FUNCTION public.notify_transfer_completed_receipt();