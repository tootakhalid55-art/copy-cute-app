
REVOKE ALL ON FUNCTION public.allocate_payment(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_document_open_balance(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_party_balance(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_aging_buckets(UUID, TEXT, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.validate_posting(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.allocate_payment(UUID, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_document_open_balance(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_party_balance(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_aging_buckets(UUID, TEXT, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.validate_posting(UUID, JSONB) TO authenticated, service_role;
