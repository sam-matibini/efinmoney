import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileUp, 
  File, 
  CheckCircle2, 
  XCircle, 
  Clock,
  Trash2,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Plus
} from "lucide-react";
import { useCustomerDocuments } from "@/hooks/useCustomerDocuments";
import { format } from "date-fns";

interface CustomerDocumentsPanelProps {
  customerId: string;
  customerName?: string;
}

const documentTypes = [
  { value: 'government_id', label: 'Government ID' },
  { value: 'proof_of_address', label: 'Proof of Address' },
  { value: 'business_registration', label: 'Business Registration' },
  { value: 'tax_document', label: 'Tax Document' },
  { value: 'bank_statement', label: 'Bank Statement' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
];

const statusConfig: Record<string, { icon: typeof Clock; color: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  pending: { icon: Clock, color: 'text-amber-500', variant: 'secondary' },
  approved: { icon: CheckCircle2, color: 'text-primary', variant: 'default' },
  rejected: { icon: XCircle, color: 'text-destructive', variant: 'destructive' },
};

export const CustomerDocumentsPanel = ({ customerId, customerName }: CustomerDocumentsPanelProps) => {
  const { documents, isLoading, uploadDocument, reviewDocument, deleteDocument, isPending } = useCustomerDocuments(customerId);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [uploadData, setUploadData] = useState({ documentType: 'other', file: null as File | null });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = () => {
    if (uploadData.file && uploadData.documentType) {
      uploadDocument({
        file: uploadData.file,
        documentType: uploadData.documentType,
      });
      setUploadData({ documentType: 'other', file: null });
      setIsUploadOpen(false);
    }
  };

  const handleReview = (approved: boolean) => {
    if (selectedDoc) {
      reviewDocument({
        documentId: selectedDoc,
        approved,
        rejectionReason: approved ? undefined : rejectionReason,
      });
      setIsReviewOpen(false);
      setSelectedDoc(null);
      setRejectionReason('');
    }
  };

  const openReviewDialog = (docId: string) => {
    setSelectedDoc(docId);
    setIsReviewOpen(true);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            Documents {customerName && `- ${customerName}`}
          </CardTitle>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Upload Document
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Document</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Document Type</Label>
                  <Select
                    value={uploadData.documentType}
                    onValueChange={(v) => setUploadData({ ...uploadData, documentType: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {documentTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    onChange={(e) => setUploadData({ 
                      ...uploadData, 
                      file: e.target.files?.[0] || null 
                    })}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                  <p className="text-xs text-muted-foreground">
                    Accepted formats: PDF, JPG, PNG, DOC, DOCX
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsUploadOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpload} 
                    disabled={!uploadData.file || isPending}
                  >
                    <FileUp className="w-4 h-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <File className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => {
                const config = statusConfig[doc.status] || statusConfig.pending;
                const Icon = config.icon;
                const docType = documentTypes.find(t => t.value === doc.document_type);
                
                return (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 p-3 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-muted">
                      <File className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{doc.file_name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{docType?.label || doc.document_type}</span>
                        <span>•</span>
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>•</span>
                        <span>{format(new Date(doc.uploaded_at), 'MMM d, yyyy')}</span>
                      </div>
                      {doc.rejection_reason && (
                        <p className="text-xs text-destructive mt-1">
                          Rejected: {doc.rejection_reason}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={config.variant} className="flex items-center gap-1">
                        <Icon className="w-3 h-3" />
                        {doc.status}
                      </Badge>
                      {doc.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openReviewDialog(doc.id)}
                        >
                          Review
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => deleteDocument(doc.id)}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isReviewOpen} onOpenChange={setIsReviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Rejection Reason (if rejecting)</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why this document is being rejected..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="destructive"
                onClick={() => handleReview(false)}
                disabled={!rejectionReason}
              >
                <ThumbsDown className="w-4 h-4 mr-2" />
                Reject
              </Button>
              <Button onClick={() => handleReview(true)}>
                <ThumbsUp className="w-4 h-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
