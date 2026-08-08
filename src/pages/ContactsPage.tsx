import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddBeneficiaryModal, { BENEFICIARY_COUNTRIES } from "@/components/modals/AddBeneficiaryModal";
import {
  useBeneficiaries, useDeleteBeneficiary, isCanadaBeneficiary, type Beneficiary,
} from "@/hooks/useBeneficiaries";
import ContactDetailsSheet from "@/components/contacts/ContactDetailsSheet";
import { Search, Plus, Send, Pencil, Trash2, Users, LayoutGrid, List as ListIcon, Eye } from "lucide-react";

import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { productFeatures } from "@/lib/productFeatures";
import PageHeroBanner from "@/components/common/PageHeroBanner";
import AppPage from "@/components/layout/AppPage";

const flagFor = (code: string | null) =>
  BENEFICIARY_COUNTRIES.find((c) => c.code === code)?.flag || "🌍";
const methodLabel = (b: Beneficiary) => {
  if (b.bank_account) return `Bank · ${b.bank_name || ""}`.trim();
  return BENEFICIARY_COUNTRIES.find((c) => c.code === b.country_code)?.method || "Mobile Money";
};

type ViewMode = "grid" | "list";
const VIEW_KEY = "contacts.viewMode";

const ContactsPage = () => {
  const navigate = useNavigate();
  const { data: contacts, isLoading } = useBeneficiaries();
  const remove = useDeleteBeneficiary();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Beneficiary | null>(null);
  const [deleting, setDeleting] = useState<Beneficiary | null>(null);
  const [viewing, setViewing] = useState<Beneficiary | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    return (localStorage.getItem(VIEW_KEY) as ViewMode) || "grid";
  });

  useEffect(() => {
    try { localStorage.setItem(VIEW_KEY, viewMode); } catch {}
  }, [viewMode]);

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
    if (isCanadaBeneficiary(c)) {
      if (!productFeatures.canadaDomestic) {
        toast.message("Canada domestic transfers are not available");
        navigate("/send?mode=canada");
        return;
      }
      navigate(`/send?mode=canada&beneficiaryId=${c.id}`);
      return;
    }
    navigate(`/send?beneficiaryId=${c.id}`);
  };

  return (
    <>
      <AppPage width="wide" innerClassName="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold">Contacts</h1>
            <p className="text-sm text-muted-foreground">Send to your saved recipients in one tap.</p>
          </div>
          <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Contact
          </Button>
        </div>

        <PageHeroBanner
          icon={Users}
          label="Saved recipients"
          value={`${contacts?.length ?? 0} contact${(contacts?.length ?? 0) === 1 ? "" : "s"}`}
          meta={[
            { icon: Send, text: "One-tap send to bank or mobile money" },
            { icon: Search, text: filtered.length !== (contacts?.length ?? 0) ? `${filtered.length} matching search` : "Search by name, tag, or phone" },
          ]}
          variant="sky"
        />

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, nickname, or phone"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
            className="border border-border rounded-md"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" className="px-3">
              <LayoutGrid className="w-4 h-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="px-3">
              <ListIcon className="w-4 h-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {isLoading ? (
          <div className={viewMode === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" : "space-y-2"}>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className={viewMode === "grid" ? "h-44" : "h-16"} />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={Users}
                title="No contacts yet"
                description="Add your first contact to send money in one tap."
                action={
                  <Button onClick={() => { setEditing(null); setModalOpen(true); }} className="gap-2">
                    <Plus className="w-4 h-4" /> Add Contact
                  </Button>
                }
              />
            </CardContent>
          </Card>
        ) : viewMode === "grid" ? (
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
                    <button
                      type="button"
                      onClick={() => setViewing(c)}
                      className="flex w-full items-center gap-3 text-left rounded-lg -m-1 p-1 hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View details for ${c.nickname || c.name}`}
                    >
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
                    </button>
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
                      <Button size="sm" variant="outline" aria-label="View contact" onClick={() => setViewing(c)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" aria-label="Edit contact" onClick={() => { setEditing(c); setModalOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" aria-label="Delete contact" onClick={() => setDeleting(c)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>

              </motion.div>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {filtered.map((c, i) => (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => setViewing(c)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left rounded-lg p-1 -m-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View details for ${c.nickname || c.name}`}
                    >
                      <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-sm font-bold shrink-0">
                        {c.avatar_initials || c.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-medium truncate">{c.nickname || c.name}</p>
                          <span className="text-base leading-none" aria-hidden>{flagFor(c.country_code)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {methodLabel(c)}
                          {c.phone ? ` · ${c.phone}` : c.bank_account ? ` · ${c.bank_account}` : ""}
                          {c.mailing_city ? ` · ${c.mailing_city}` : ""}
                        </p>
                      </div>
                    </button>
                    <div className="hidden sm:block text-right text-xs text-muted-foreground shrink-0 min-w-[120px]">
                      <p>{c.transfer_count} transfer{c.transfer_count === 1 ? "" : "s"}</p>
                      <p>
                        {c.last_sent_at
                          ? formatDistanceToNow(new Date(c.last_sent_at), { addSuffix: true })
                          : "—"}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" className="gap-1" onClick={() => handleSendTo(c)}>
                        <Send className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Send</span>
                      </Button>
                      <Button size="sm" variant="outline" aria-label="View contact" onClick={() => setViewing(c)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" aria-label="Edit contact" onClick={() => { setEditing(c); setModalOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" aria-label="Delete contact" onClick={() => setDeleting(c)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>

                  </motion.li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </AppPage>

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

    </>
  );
};

export default ContactsPage;
