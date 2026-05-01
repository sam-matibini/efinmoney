
REVOKE EXECUTE ON FUNCTION public.invoke_send_email(text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoke_send_email(text, text, jsonb) TO postgres, service_role;
