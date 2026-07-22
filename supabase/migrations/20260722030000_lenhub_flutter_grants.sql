-- Fix: edge function (service_role) was denied insert on lenhub_flutter tables
GRANT ALL ON TABLE public.lenhub_flutter_charges TO postgres, service_role;
GRANT ALL ON TABLE public.lenhub_flutter_payouts TO postgres, service_role;
GRANT SELECT ON TABLE public.lenhub_flutter_charges TO authenticated;
GRANT SELECT ON TABLE public.lenhub_flutter_payouts TO authenticated;
