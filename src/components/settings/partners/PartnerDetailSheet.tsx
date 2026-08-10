import { useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Landmark, Lock, Plus, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  usePartnerCorridors,
  usePartnerPricing,
  usePartnerLiquidity,
  type PaymentPartner,
} from "@/hooks/usePartnerNetwork";
import {
  usePartnerBankAccounts,
  useSavePartnerBankAccount,
  useDeletePartnerBankAccount,
  useReauthenticate,
  type PartnerBankAccount,
} from "@/hooks/usePartnerBankAccounts";

const mask = (v: string | null) => (v ? `•••• ${v.slice(-4)}` : "—");

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium break-words">{value || "—"}</p>
  </div>
);

const emptyAccount: Partial<PartnerBankAccount> = {
  label: "Primary",
  purpose: "funding",
  is_primary: false,
};

type Props = {
  partner: PaymentPartner | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (p: PaymentPartner) => void;
  onToggleStatus: (p: PaymentPartner, active: boolean) => void;
};

export const PartnerDetailSheet = ({ partner, open, onOpenChange, onEdit, onToggleStatus }: Props) => {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [gateOpen, setGateOpen] = useState(false);
  const [accountDraft, setAccountDraft] = useState<Partial<PartnerBankAccount> | null>(null);

  const { data: corridors } = usePartnerCorridors(partner?.id);
  const { data: pricing } = usePartnerPricing({ partnerId: partner?.id });
  const { data: liquidity } = usePartnerLiquidity();
  const { data: accounts, isLoading: accountsLoading } = usePartnerBankAccounts(partner?.id, unlocked);

  const reauth = useReauthenticate();
  const saveAccount = useSavePartnerBankAccount();
  const removeAccount = useDeletePartnerBankAccount();

  const balances = useMemo(
    () => (liquidity ?? []).filter((l) => l.partner_id === partner?.id),
    [liquidity, partner?.id],
  );

  const close = (v: boolean) => {
    if (!v) {
      setUnlocked(false);
      setPassword("");
      setAccountDraft(null);
    }
    onOpenChange(v);
  };

  const unlock = () => {
    reauth.mutate(password, {
      onSuccess: () => {
        setUnlocked(true);
        setGateOpen(false);
        setPassword("");
        toast.success("Banking details unlocked for this session");
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

  if (!partner) return null;
  const active = partner.status === "active";

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {partner.name}
            <Badge variant="outline" className="font-mono text-[10px]">
              {partner.partner_ref ?? "—"}
            </Badge>
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{partner.code}</span>
            <Badge variant={active ? "default" : "outline"} className="capitalize">
              {partner.status}
            </Badge>
            <span className="capitalize text-xs">{partner.direction}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border px-3 py-2">
            <Switch
              checked={active}
              onCheckedChange={(v) => onToggleStatus(partner, v)}
              aria-label="Enable partner"
            />
            <span className="text-sm">{active ? "Enabled" : "Disabled"}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => onEdit(partner)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit partner
          </Button>
        </div>

        <Tabs defaultValue="overview" className="mt-5">
          <TabsList className="flex w-full flex-wrap">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="corridors">Corridors ({corridors?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="rates">Rate card ({pricing?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
            <TabsTrigger value="financial">Financial</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Headquarters" value={partner.country} />
            <Field label="Settlement" value={`${partner.settlement_currency ?? "—"} · ${partner.settlement_time ?? "—"}`} />
            <Field label="Reliability" value={`${partner.reliability_score ?? "—"}`} />
            <Field label="Priority" value={`${partner.priority ?? "—"}`} />
            <Field label="Compliance risk" value={partner.compliance_risk} />
            <Field label="Regulatory status" value={partner.regulatory_status} />
            <Field label="API status" value={partner.api_status} />
            <Field label="Integration status" value={partner.integration_status} />
            <Field label="Pay-in function" value={partner.payin_function_slug} />
            <Field label="Payout function" value={partner.payout_function_slug} />
            <Field label="Currencies" value={(partner.supported_currencies ?? []).join(", ")} />
            <Field label="Countries" value={(partner.supported_countries ?? []).join(", ")} />
            <div className="sm:col-span-2">
              <Field label="Methods" value={(partner.payment_methods ?? []).join(", ")} />
            </div>
            {partner.notes ? (
              <div className="sm:col-span-2">
                <Field label="Notes" value={partner.notes} />
              </div>
            ) : null}
          </TabsContent>

          <TabsContent value="corridors" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Live</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(corridors ?? []).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">
                      {c.source_country ?? "*"} {c.source_currency} → {c.dest_country ?? "*"} {c.dest_currency}
                    </TableCell>
                    <TableCell className="text-xs">{c.payment_method}</TableCell>
                    <TableCell>
                      <Badge variant={c.enabled ? "default" : "outline"}>{c.enabled ? "yes" : "no"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.live_routing_enabled ? "default" : "outline"}>
                        {c.live_routing_enabled ? "live" : "off"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!corridors?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No corridors configured
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="rates" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Route</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead className="text-right">Fixed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pricing ?? []).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs capitalize">
                      {p.direction} · {p.dest_country ?? "*"} {p.dest_currency ?? ""}
                    </TableCell>
                    <TableCell className="text-xs">{p.payment_method ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {p.percentage_fee ? `${Number(p.percentage_fee).toFixed(3)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs">
                      {p.fixed_fee ? `${Number(p.fixed_fee).toFixed(2)} ${p.fee_currency ?? ""}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {!pricing?.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No cost rates on file — upload this partner's rate sheet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TabsContent>

          <TabsContent value="liquidity" className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Reserve</TableHead>
                  <TableHead>As of</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.currency_code}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(b.available_balance ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(b.required_reserve ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.as_of ? new Date(b.as_of).toLocaleString() : "—"}
                      {b.refresh_error ? <span className="block text-destructive">{b.refresh_error}</span> : null}
                    </TableCell>
                  </TableRow>
                ))}
                {!balances.length && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                      No balances reported yet for this partner
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              Balances come from the partner balance function configured on the partner record. Partners without a
              balance endpoint are updated from settlement statements.
            </p>
          </TabsContent>

          <TabsContent value="financial" className="mt-4">
            {!unlocked ? (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-10 text-center">
                <Lock className="h-6 w-6 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Banking details are protected</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Confirm your account password to view or edit this partner's bank accounts.
                  </p>
                </div>
                <Button size="sm" onClick={() => setGateOpen(true)}>
                  <ShieldCheck className="mr-1 h-4 w-4" /> Unlock
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Funding and settlement accounts used to move money to this partner.
                  </p>
                  <Button size="sm" onClick={() => setAccountDraft({ ...emptyAccount, partner_id: partner.id })}>
                    <Plus className="mr-1 h-4 w-4" /> Add account
                  </Button>
                </div>
                {accountsLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : !accounts?.length ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No banking records yet.</p>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((a) => (
                      <div key={a.id} className="rounded-lg border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{a.label}</span>
                            <Badge variant="outline" className="capitalize text-[10px]">
                              {a.purpose}
                            </Badge>
                            {a.is_primary ? <Badge className="text-[10px]">primary</Badge> : null}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => setAccountDraft(a)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => removeAccount.mutate(a.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                        <Separator className="my-2" />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Account holder" value={a.account_holder} />
                          <Field label="Bank" value={a.bank_name} />
                          <Field label="Account number" value={mask(a.account_number)} />
                          <Field label="Routing / sort code" value={a.routing_code} />
                          <Field label="IBAN" value={a.iban ? mask(a.iban) : "—"} />
                          <Field label="SWIFT / BIC" value={a.swift_bic} />
                          <Field label="Currency" value={a.currency_code} />
                          <Field label="Country" value={a.country} />
                          {a.notes ? (
                            <div className="sm:col-span-2">
                              <Field label="Notes" value={a.notes} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={gateOpen} onOpenChange={setGateOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm your password</DialogTitle>
              <DialogDescription>
                Banking details are sensitive. Re-enter your password to continue.
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label htmlFor="reauth-password">Password</Label>
              <Input
                id="reauth-password"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && password && unlock()}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={unlock} disabled={!password || reauth.isPending}>
                {reauth.isPending ? "Checking…" : "Unlock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!accountDraft} onOpenChange={(v) => !v && setAccountDraft(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{accountDraft?.id ? "Edit banking details" : "Add banking details"}</DialogTitle>
              <DialogDescription>Used to fund this partner and reconcile settlements.</DialogDescription>
            </DialogHeader>
            {accountDraft ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["label", "Label"],
                    ["purpose", "Purpose (funding / settlement)"],
                    ["account_holder", "Account holder"],
                    ["bank_name", "Bank name"],
                    ["account_number", "Account number"],
                    ["routing_code", "Routing / sort / transit code"],
                    ["iban", "IBAN"],
                    ["swift_bic", "SWIFT / BIC"],
                    ["currency_code", "Currency"],
                    ["country", "Country"],
                  ] as const
                ).map(([k, label]) => (
                  <div key={k}>
                    <Label>{label}</Label>
                    <Input
                      value={(accountDraft[k] as string) ?? ""}
                      onChange={(e) => setAccountDraft((d) => ({ ...d!, [k]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <Label>Notes</Label>
                  <Input
                    value={accountDraft.notes ?? ""}
                    onChange={(e) => setAccountDraft((d) => ({ ...d!, notes: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <Switch
                    checked={!!accountDraft.is_primary}
                    onCheckedChange={(v) => setAccountDraft((d) => ({ ...d!, is_primary: v }))}
                  />
                  <span className="text-sm">Primary account for this partner</span>
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccountDraft(null)}>
                Cancel
              </Button>
              <Button
                disabled={saveAccount.isPending}
                onClick={() =>
                  saveAccount.mutate(
                    { ...accountDraft!, partner_id: partner.id },
                    { onSuccess: () => setAccountDraft(null) },
                  )
                }
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
};
