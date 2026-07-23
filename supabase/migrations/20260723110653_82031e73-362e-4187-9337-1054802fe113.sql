-- Enable realtime replication for tables the DocumentSidePanel subscribes to.
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_lines;
ALTER PUBLICATION supabase_realtime ADD TABLE public.attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.approval_actions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_relations;
-- Ensure full row payloads on updates for the side panel's optimistic UI.
ALTER TABLE public.documents REPLICA IDENTITY FULL;
ALTER TABLE public.attachments REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.approval_requests REPLICA IDENTITY FULL;
ALTER TABLE public.approval_actions REPLICA IDENTITY FULL;
ALTER TABLE public.document_relations REPLICA IDENTITY FULL;