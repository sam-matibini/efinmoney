import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface CustomerDocument {
  id: string;
  customer_id: string;
  onboarding_id: string | null;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  status: string;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  uploaded_at: string;
}

export const useCustomerDocuments = (customerId: string) => {
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['customer-documents', customerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('customer_id', customerId)
        .order('uploaded_at', { ascending: false });
      if (error) throw error;
      return data as CustomerDocument[];
    },
    enabled: !!customerId,
  });

  const uploadDocument = useMutation({
    mutationFn: async ({ 
      file, 
      documentType,
      onboardingId 
    }: { 
      file: File; 
      documentType: string;
      onboardingId?: string;
    }) => {
      const filePath = `${customerId}/${Date.now()}-${file.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file);
      
      if (uploadError) throw uploadError;

      const { error } = await supabase.from('customer_documents').insert({
        customer_id: customerId,
        onboarding_id: onboardingId,
        document_type: documentType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-documents', customerId] });
      toast.success('Document uploaded');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reviewDocument = useMutation({
    mutationFn: async ({ 
      documentId, 
      approved, 
      rejectionReason 
    }: { 
      documentId: string; 
      approved: boolean; 
      rejectionReason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('customer_documents')
        .update({
          status: approved ? 'approved' : 'rejected',
          rejection_reason: rejectionReason,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', documentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-documents', customerId] });
      toast.success('Document reviewed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteDocument = useMutation({
    mutationFn: async (documentId: string) => {
      const doc = documentsQuery.data?.find(d => d.id === documentId);
      if (doc) {
        await supabase.storage.from('customer-documents').remove([doc.file_path]);
      }
      
      const { error } = await supabase
        .from('customer_documents')
        .delete()
        .eq('id', documentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-documents', customerId] });
      toast.success('Document deleted');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    documents: documentsQuery.data || [],
    isLoading: documentsQuery.isLoading,
    uploadDocument: uploadDocument.mutate,
    reviewDocument: reviewDocument.mutate,
    deleteDocument: deleteDocument.mutate,
    isPending: uploadDocument.isPending || reviewDocument.isPending,
  };
};
