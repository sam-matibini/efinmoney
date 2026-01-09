import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Download, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";

interface ImportRow {
  date: string;
  description: string;
  reference?: string;
  debit?: number;
  credit?: number;
  balance?: number;
  isValid: boolean;
  error?: string;
}

interface BankTransactionImportProps {
  bankAccountId: string;
  onImportComplete: () => void;
}

const CSV_TEMPLATE = `date,description,reference,debit,credit,balance
2025-01-15,Wire transfer from client,REF001,,5000.00,15000.00
2025-01-14,Office rent payment,INV-2025-001,2500.00,,10000.00
2025-01-13,Utility bill payment,UTIL-JAN,150.00,,12500.00
2025-01-12,Client payment received,PAY-001,,3000.00,12650.00
2025-01-11,Subscription fee,SUB-MONTHLY,99.00,,9650.00`;

const OFX_SAMPLE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20250115
<TRNAMT>5000.00
<FITID>TXN001
<NAME>Wire transfer from client
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

export const BankTransactionImport = ({ bankAccountId, onImportComplete }: BankTransactionImportProps) => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importProgress, setImportProgress] = useState(0);
  const [fileType, setFileType] = useState<'csv' | 'ofx' | null>(null);

  const parseCSV = (content: string): ImportRow[] => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const dateIdx = headers.findIndex(h => h.includes('date'));
    const descIdx = headers.findIndex(h => h.includes('description') || h.includes('memo') || h.includes('narrative'));
    const refIdx = headers.findIndex(h => h.includes('reference') || h.includes('ref') || h.includes('check'));
    const debitIdx = headers.findIndex(h => h.includes('debit') || h.includes('withdrawal'));
    const creditIdx = headers.findIndex(h => h.includes('credit') || h.includes('deposit'));
    const balanceIdx = headers.findIndex(h => h.includes('balance'));
    const amountIdx = headers.findIndex(h => h.includes('amount'));

    return lines.slice(1).map(line => {
      const values = parseCSVLine(line);
      
      const rawDate = values[dateIdx] || '';
      const parsedDate = parseFlexibleDate(rawDate);
      
      let debit = parseNumber(values[debitIdx]);
      let credit = parseNumber(values[creditIdx]);
      
      // If only amount column exists, determine debit/credit
      if (amountIdx >= 0 && debitIdx < 0 && creditIdx < 0) {
        const amount = parseNumber(values[amountIdx]);
        if (amount < 0) {
          debit = Math.abs(amount);
        } else {
          credit = amount;
        }
      }

      const row: ImportRow = {
        date: parsedDate,
        description: values[descIdx] || '',
        reference: values[refIdx] || undefined,
        debit: debit || undefined,
        credit: credit || undefined,
        balance: parseNumber(values[balanceIdx]) || undefined,
        isValid: true,
      };

      // Validation
      if (!row.date || !isValid(new Date(row.date))) {
        row.isValid = false;
        row.error = 'Invalid date format';
      } else if (!row.description) {
        row.isValid = false;
        row.error = 'Description required';
      } else if (!row.debit && !row.credit) {
        row.isValid = false;
        row.error = 'Debit or credit amount required';
      }

      return row;
    }).filter(row => row.description || row.debit || row.credit);
  };

  const parseOFX = (content: string): ImportRow[] => {
    const rows: ImportRow[] = [];
    const txnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;

    while ((match = txnRegex.exec(content)) !== null) {
      const txnBlock = match[1];
      
      const getField = (name: string) => {
        const regex = new RegExp(`<${name}>([^<\\n]+)`, 'i');
        const m = txnBlock.match(regex);
        return m ? m[1].trim() : '';
      };

      const dateStr = getField('DTPOSTED');
      const amount = parseFloat(getField('TRNAMT')) || 0;
      const name = getField('NAME') || getField('MEMO');
      const fitId = getField('FITID');

      let parsedDate = '';
      if (dateStr.length >= 8) {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        parsedDate = `${year}-${month}-${day}`;
      }

      const row: ImportRow = {
        date: parsedDate,
        description: name,
        reference: fitId || undefined,
        debit: amount < 0 ? Math.abs(amount) : undefined,
        credit: amount > 0 ? amount : undefined,
        isValid: true,
      };

      if (!row.date || !isValid(new Date(row.date))) {
        row.isValid = false;
        row.error = 'Invalid date';
      } else if (!row.description) {
        row.isValid = false;
        row.error = 'No description';
      }

      if (row.description || row.debit || row.credit) {
        rows.push(row);
      }
    }

    return rows;
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const parseFlexibleDate = (dateStr: string): string => {
    if (!dateStr) return '';
    
    const formats = [
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'dd/MM/yyyy',
      'MM-dd-yyyy',
      'dd-MM-yyyy',
      'yyyy/MM/dd',
      'MMM dd, yyyy',
      'dd MMM yyyy',
    ];

    for (const fmt of formats) {
      try {
        const parsed = parse(dateStr.trim(), fmt, new Date());
        if (isValid(parsed)) {
          return format(parsed, 'yyyy-MM-dd');
        }
      } catch {}
    }

    // Try native parsing
    const native = new Date(dateStr);
    if (isValid(native)) {
      return format(native, 'yyyy-MM-dd');
    }

    return dateStr;
  };

  const parseNumber = (value: string | undefined): number | undefined => {
    if (!value) return undefined;
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : Math.abs(num);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const content = await file.text();
    
    const isOFX = file.name.toLowerCase().endsWith('.ofx') || 
                  file.name.toLowerCase().endsWith('.qfx') ||
                  content.includes('OFXHEADER') ||
                  content.includes('<OFX>');

    if (isOFX) {
      setFileType('ofx');
      setParsedRows(parseOFX(content));
    } else {
      setFileType('csv');
      setParsedRows(parseCSV(content));
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const importMutation = useMutation({
    mutationFn: async (rows: ImportRow[]) => {
      const validRows = rows.filter(r => r.isValid);
      const batchId = crypto.randomUUID();
      let imported = 0;

      for (let i = 0; i < validRows.length; i++) {
        const row = validRows[i];
        
        const { error } = await supabase
          .from('bank_transactions')
          .insert({
            bank_account_id: bankAccountId,
            transaction_date: row.date,
            description: row.description,
            reference: row.reference || null,
            debit_amount: row.debit || 0,
            credit_amount: row.credit || 0,
            balance: row.balance || null,
            import_batch_id: batchId,
          });

        if (!error) imported++;
        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      }

      return imported;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['bank-transactions'] });
      toast.success(`Successfully imported ${count} transactions`);
      setParsedRows([]);
      setFileName('');
      setImportProgress(0);
      setOpen(false);
      onImportComplete();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Import failed');
      setImportProgress(0);
    },
  });

  const downloadTemplate = (type: 'csv' | 'ofx') => {
    const content = type === 'csv' ? CSV_TEMPLATE : OFX_SAMPLE;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = type === 'csv' ? 'bank_transactions_template.csv' : 'bank_transactions_sample.ofx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Bank Transactions</DialogTitle>
          <DialogDescription>
            Upload a CSV or OFX file to import bank transactions in bulk
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Templates */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium">Download Templates</CardTitle>
              <CardDescription className="text-xs">
                Use these templates as a starting point for your import
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadTemplate('csv')}>
                <Download className="h-4 w-4 mr-2" />
                CSV Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadTemplate('ofx')}>
                <Download className="h-4 w-4 mr-2" />
                OFX Sample
              </Button>
            </CardContent>
          </Card>

          {/* File Upload */}
          <Card>
            <CardContent className="pt-6">
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.ofx,.qfx"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    {fileName || 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supports CSV, OFX, QFX files
                  </p>
                </label>
              </div>
            </CardContent>
          </Card>

          {/* Preview */}
          {parsedRows.length > 0 && (
            <>
              <div className="flex items-center gap-4">
                <Badge variant="outline" className="gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  {fileType?.toUpperCase()}
                </Badge>
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {validCount} valid
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <XCircle className="h-3 w-3" />
                    {invalidCount} invalid
                  </Badge>
                )}
              </div>

              {invalidCount > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {invalidCount} row(s) have errors and will be skipped during import
                  </AlertDescription>
                </Alert>
              )}

              <div className="border rounded-lg overflow-x-auto max-h-[300px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 50).map((row, idx) => (
                      <TableRow key={idx} className={!row.isValid ? 'bg-destructive/10' : ''}>
                        <TableCell>
                          {row.isValid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <span title={row.error}>
                              <XCircle className="h-4 w-4 text-destructive" />
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{row.date}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{row.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{row.reference || '-'}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {row.debit?.toFixed(2) || '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {row.credit?.toFixed(2) || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsedRows.length > 50 && (
                <p className="text-xs text-muted-foreground text-center">
                  Showing first 50 of {parsedRows.length} rows
                </p>
              )}

              {importProgress > 0 && (
                <div className="space-y-2">
                  <Progress value={importProgress} />
                  <p className="text-xs text-center text-muted-foreground">
                    Importing... {importProgress}%
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setParsedRows([])}>
                  Clear
                </Button>
                <Button
                  onClick={() => importMutation.mutate(parsedRows)}
                  disabled={validCount === 0 || importMutation.isPending}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Import {validCount} Transactions
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
