import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Header from "@/components/layout/Header";
import MobileNav from "@/components/layout/MobileNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddBeneficiaryModal, { BENEFICIARY_COUNTRIES } from "@/components/modals/AddBeneficiaryModal";
import {
  useBeneficiaries, useDeleteBeneficiary, type Beneficiary,
} from "@/hooks/useBeneficiaries";
import { Search, Plus, Send, Pencil, Trash2, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const flagFor = (code: string | null) =>
  BENEFICIARY_COUNTRIES.find((c) => c.code === code)?.flag || "🌍";
const methodLabel = (b: Beneficiary) => {
  if (b.bank_account) return `Bank · ${b.bank_name || ""}`.trim();
  return BENEFICIARY_COUNTRIES.find((c) => c.code === b.country_code)?.method || "Mobile Money";
};

const ContactsPage = () => {
  const navigate = useNavigate();
  const { data: contacts, isLoading } = useBeneficiaries();
  const remove = useDeleteBeneficiary();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficiary | null>(null);
  const [deleting, setDeleting] = useState<Beneficiary | null>(null);

  const filtered = useMemo(() => {
    const items = contacts || [];
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.nickname || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const handleSendTo = (c: Beneficiary) => {
    navigate(`/send?beneficiaryId=${c.id}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Header />
      <main className="container px-4 py-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Contacts</h1>
            <p className="text-sm text-muted-foreground">Send to your saved recipients in one tap.</p>
          </div>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, nickname, or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <Users className="w-10 h-10 mx-auto text-muted-foreground" />
              <p className="font-medium">No contacts yet</p>
              <p className="text-sm text-muted-foreground">Add your first contact to send money in one tap.</p>
              <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
                <Plus className="w-4 h-4" /> Add Contact
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="h-full relative overflow-hidden">
                  <span className="absolute top-3 right-3 text-3xl leading-none drop-shadow-sm" aria-hidden>
                    {flagFor(c.country_code)}
                  </span>
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-display font-bold">
                        {c.avatar_initials || c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 pr-8">
                        <p className="font-medium truncate">{c.nickname || c.name}</p>
                        {c.nickname && (
                          <p className="text-xs text-muted-foreground truncate">{c.name}</p>
                        )}
                        <p className="text-xs text-muted-foreground truncate">
                          {methodLabel(c)}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>{c.transfer_count} transfer{c.transfer_count === 1 ? "" : "s"}</p>
                      <p>
                        Last sent: {c.last_sent_at
                          ? formatDistanceToNow(new Date(c.last_sent_at), { addSuffix: true })
                          : "—"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 gap-1" onClick={() => handleSendTo(c)}>
                        <Send className="w-3.5 h-3.5" /> Send Money →
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditing(c); setModalOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDeleting(c)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      <AddBeneficiaryModal open={modalOpen} onOpenChange={setModalOpen} editing={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be removed from your saved contacts. Past transfers are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                try {
                  await remove.mutateAsync(deleting.id);
                  toast.success("Contact deleted");
                } catch (e: any) {
                  toast.error(e?.message || "Failed to delete");
                }
                setDeleting(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <MobileNav />
    </div>
  );
};

export default ContactsPage;
