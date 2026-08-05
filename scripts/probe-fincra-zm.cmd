# Run in Owner terminal (logged into Supabase CLI)

npx supabase functions deploy fincra-payout --project-ref dkdnwumllibwdlqbjkwy
npx supabase functions deploy fincra-zm-probe --project-ref dkdnwumllibwdlqbjkwy

# Resolve-only probe (no money moved)
curl -s -X POST "https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/fincra-zm-probe" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %VITE_SUPABASE_PUBLISHABLE_KEY%" ^
  -d "{\"probe_key\":\"efm-zm-fincra-7f3a9c\",\"phone\":\"260770069550\",\"do_payout\":false}"

# Real tiny payout attempts (charges Fincra NGN → ZMW)
curl -s -X POST "https://dkdnwumllibwdlqbjkwy.supabase.co/functions/v1/fincra-zm-probe" ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer %VITE_SUPABASE_PUBLISHABLE_KEY%" ^
  -d "{\"probe_key\":\"efm-zm-fincra-7f3a9c\",\"phone\":\"260770069550\",\"amount\":5,\"do_payout\":true,\"networks\":[\"AIRTEL\",\"MTN\",\"ZAMTEL\"]}"
