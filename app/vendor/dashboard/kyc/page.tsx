'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, FileText, CheckCircle2, Clock, XCircle, Upload, Eye, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  fetchMyVendorKyc,
  uploadVendorKycDocument,
  type VendorKycDocument,
  type VendorKycDocType,
} from '@/lib/vendor-api';

const DOC_META: Record<VendorKycDocType, { label: string; hint: string }> = {
  pan_card: { label: 'PAN Card', hint: 'Clear photo or scan of your PAN card' },
  gst_certificate: { label: 'GST Certificate', hint: 'Only if you have GST registration' },
  bank_proof: { label: 'Bank Proof', hint: 'Cancelled cheque or bank passbook first page' },
};

const STATUS_META: Record<
  VendorKycDocument['status'],
  { label: string; icon: typeof Clock; className: string }
> = {
  pending: { label: 'Under Review', icon: Clock, className: 'bg-amber-50 text-amber-700 border-amber-200' },
  verified: { label: 'Verified', icon: CheckCircle2, className: 'bg-green-50 text-green-700 border-green-200' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'bg-red-50 text-red-700 border-red-200' },
};

function DocSlot({
  docType,
  doc,
  onUploaded,
}: {
  docType: VendorKycDocType;
  doc: VendorKycDocument | undefined;
  onUploaded: (doc: VendorKycDocument) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const meta = DOC_META[docType];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const saved = await uploadVendorKycDocument(docType, file);
      onUploaded(saved);
      toast.success(`${meta.label} uploaded — pending review`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const statusMeta = doc ? STATUS_META[doc.status] : null;
  const StatusIcon = statusMeta?.icon;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-secondary" />
          <div>
            <p className="font-serif text-base font-semibold text-primary">{meta.label}</p>
            <p className="text-xs text-muted-foreground">{meta.hint}</p>
          </div>
        </div>
        {statusMeta && StatusIcon && (
          <Badge variant="outline" className={`flex w-fit items-center gap-1 ${statusMeta.className}`}>
            <StatusIcon className="h-3 w-3" /> {statusMeta.label}
          </Badge>
        )}
      </div>

      {doc?.status === 'rejected' && doc.admin_note && (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          Reason: {doc.admin_note}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {doc && (
          <>
            <p className="text-xs text-muted-foreground">
              {doc.original_filename} · uploaded {new Date(doc.uploaded_at).toLocaleDateString('en-IN')}
            </p>
            {doc.url && (
              <a
                href={doc.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Eye className="h-3.5 w-3.5" /> View
              </a>
            )}
          </>
        )}
      </div>

      <label className="mt-3 flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs hover:border-primary/50">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        <span>{uploading ? 'Uploading…' : doc ? 'Re-upload' : 'Upload File'}</span>
        <input
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
    </div>
  );
}

export default function VendorKycPage() {
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<VendorKycDocument[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        setDocs(await fetchMyVendorKyc());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load KYC documents');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleUploaded = (doc: VendorKycDocument) => {
    setDocs((prev) => [...prev.filter((d) => d.doc_type !== doc.doc_type), doc]);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const byType = (t: VendorKycDocType) => docs.find((d) => d.doc_type === t);

  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-secondary" />
        <h2 className="font-serif text-xl font-bold text-primary">KYC Documents</h2>
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Upload your PAN card, GST certificate (if applicable), and a bank proof for verification. These
        are kept private — only our admin team can review them.
      </p>

      <div className="space-y-3">
        <DocSlot docType="pan_card" doc={byType('pan_card')} onUploaded={handleUploaded} />
        <DocSlot docType="gst_certificate" doc={byType('gst_certificate')} onUploaded={handleUploaded} />
        <DocSlot docType="bank_proof" doc={byType('bank_proof')} onUploaded={handleUploaded} />
      </div>
    </div>
  );
}
