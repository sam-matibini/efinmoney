import { useState } from "react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, FileSpreadsheet, FileType, Mail, Share2 } from "lucide-react";
import {
  downloadCSV, downloadPDF, downloadXLSX, emailStatement, type StatementMeta,
} from "@/lib/statementExport";
import type { StatementRow } from "@/hooks/useStatement";

interface Props {
  rows: StatementRow[];
  meta: StatementMeta;
  defaultEmail?: string;
}

export const StatementActions = ({ rows, meta, defaultEmail }: Props) => {
  const [openEmail, setOpenEmail] = useState(false);
  const [email, setEmail] = useState(defaultEmail || "");
  const [fmt, setFmt] = useState<"pdf" | "csv" | "xlsx">("pdf");

  const disabled = rows.length === 0;

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={disabled}>
            <Download className="w-3.5 h-3.5 mr-1.5" /> Download
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Choose format</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => downloadPDF(rows, meta)}>
            <FileType className="w-4 h-4 mr-2 text-rose-500" /> PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadXLSX(rows, meta)}>
            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => downloadCSV(rows, meta)}>
            <FileText className="w-4 h-4 mr-2 text-sky-500" /> CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpenEmail(true)}>
        <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share
      </Button>

      <Dialog open={openEmail} onOpenChange={setOpenEmail}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-4 h-4" /> Email statement</DialogTitle>
            <DialogDescription>We'll attach your statement and email it instantly.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="rcpt-email">Recipient email</Label>
              <Input
                id="rcpt-email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>Attachment format</Label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {(["pdf", "xlsx", "csv"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFmt(f)}
                    className={`px-3 py-2 rounded-md border text-sm font-medium uppercase transition ${
                      fmt === f
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenEmail(false)}>Cancel</Button>
            <Button
              disabled={!email || !/.+@.+\..+/.test(email)}
              onClick={async () => {
                await emailStatement(rows, meta, email, fmt);
                setOpenEmail(false);
              }}
            >
              <Mail className="w-4 h-4 mr-2" /> Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
