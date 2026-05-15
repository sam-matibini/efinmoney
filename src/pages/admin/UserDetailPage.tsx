import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ArrowLeft, Mail, Phone, MapPin, Calendar, Shield, Wallet, ArrowRightLeft,
  User as UserIcon, Hash, Activity, AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

const statusColor = (s: string | null | undefined) => {
  switch (s) {
    case "active":
    case "approved":
    case "completed":
    case "verified": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "suspended":
    case "rejected":
    case "failed": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "pending":
    case "pending_verification":
    case "pending_review":
    case "submitted":
    case "processing": return "bg-yellow-500/10 text-yellow-500 border-yellow-500/20";
    default: return "bg-muted text-muted-foreground";
  }
};

const UserDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["admin-user-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: kyc } = useQuery({
    queryKey: ["admin-user-kyc", id],
    queryFn: async () => {
      const { data } = await supabase.from("kyc_verifications").select("*").eq("user_id", id).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: tier } = useQuery({
    queryKey: ["admin-user-tier", id],
    queryFn: async () => {
      const { data } = await supabase.from("user_risk_tiers").select("*").eq("user_id", id).maybeSingle();
      return data;
    },
    enabled: !!id,
  });

  const { data: wallets = [] } = useQuery({
    queryKey: ["admin-user-wallets", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_wallet_balances", { p_user_id: id! });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ["admin-user-transfers", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transfers")
        .select("id,recipient_name,recipient_country,source_amount,source_currency,target_amount,target_currency,status,payout_method,created_at")
        .eq("sender_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AdminLayout>
    );
  }

  if (!profile) {
    return (
      <AdminLayout>
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 mx-auto text-muted-foreground" />
            <div className="text-sm text-muted-foreground">User not found</div>
            <Button variant="outline" onClick={() => navigate("/admin/users")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to users
            </Button>
          </CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to users
        </Button>

        {/* Header card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4 flex-wrap">
              <Avatar className="w-16 h-16">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-xl">
                  {(profile.full_name || profile.email || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-2xl font-semibold">{profile.full_name || "No name"}</h1>
                <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                  <Mail className="w-3.5 h-3.5" /> {profile.email}
                </div>
                {profile.phone_number && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                    <Phone className="w-3.5 h-3.5" /> {profile.phone_number}
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className={statusColor(profile.account_status)}>
                    <Activity className="w-3 h-3 mr-1" />
                    {profile.account_status?.replace(/_/g, " ") || "—"}
                  </Badge>
                  <Badge variant="outline" className={statusColor(profile.kyc_status)}>
                    <Shield className="w-3 h-3 mr-1" />
                    KYC: {profile.kyc_status}
                  </Badge>
                  <Badge variant="outline">Tier: {profile.kyc_tier}</Badge>
                  {profile.account_number && (
                    <Badge variant="outline">
                      <Hash className="w-3 h-3 mr-1" /> {profile.account_number}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview"><UserIcon className="w-4 h-4 mr-2" /> Overview & KYC</TabsTrigger>
            <TabsTrigger value="wallets"><Wallet className="w-4 h-4 mr-2" /> Wallets</TabsTrigger>
            <TabsTrigger value="transfers"><ArrowRightLeft className="w-4 h-4 mr-2" /> Transfers</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserIcon className="w-4 h-4" /> Profile</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label="Full name" value={profile.full_name || "—"} />
                  <Row label="Email" value={profile.email || "—"} />
                  <Row label="Phone" value={profile.phone_number || "—"} />
                  <Row label="Country" value={profile.country_code || "—"} icon={<MapPin className="w-3.5 h-3.5" />} />
                  <Row label="Default currency" value={profile.default_currency || "—"} />
                  <Row label="Risk score" value={String(profile.risk_score ?? 0)} />
                  <Row label="Joined" value={format(new Date(profile.created_at), "PPP")} icon={<Calendar className="w-3.5 h-3.5" />} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" /> KYC & Risk</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row label="Verification status" value={kyc?.verification_status || profile.kyc_status} />
                  <Row label="ID status" value={kyc?.id_verification_status || "—"} />
                  <Row label="Address status" value={kyc?.address_verification_status || "—"} />
                  <Row label="Tier" value={tier?.current_tier || profile.kyc_tier} />
                  <Row label="Daily limit" value={tier?.daily_transaction_limit ? `$${Number(tier.daily_transaction_limit).toLocaleString()}` : "—"} />
                  <Row label="Monthly limit" value={tier?.monthly_transaction_limit ? `$${Number(tier.monthly_transaction_limit).toLocaleString()}` : "—"} />
                  <Row label="KYC completed" value={profile.kyc_completed_at ? format(new Date(profile.kyc_completed_at), "PPP") : "—"} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="wallets">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" /> Wallets ({wallets.length})</CardTitle></CardHeader>
              <CardContent>
                {wallets.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">No wallets yet</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Currency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead>Default</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wallets.map((w: any) => (
                        <TableRow key={w.wallet_id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{w.flag_emoji}</span>
                              <div>
                                <div className="font-medium">{w.currency_code}</div>
                                <div className="text-xs text-muted-foreground">{w.currency_name}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColor(w.status)}>{w.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {w.symbol}{Number(w.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>{w.is_default ? <Badge>Default</Badge> : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transfers">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" /> Recent transfers ({transfers.length})</CardTitle></CardHeader>
              <CardContent>
                {transfers.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-8">No transfers yet</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfers.map((t: any) => (
                          <TableRow key={t.id}>
                            <TableCell className="text-sm whitespace-nowrap">
                              {format(new Date(t.created_at), "MMM d, HH:mm")}
                            </TableCell>
                            <TableCell>
                              <div className="font-medium">{t.recipient_name}</div>
                              <div className="text-xs text-muted-foreground">{t.recipient_country}</div>
                            </TableCell>
                            <TableCell className="text-sm capitalize">{t.payout_method?.replace(/_/g, " ") || "—"}</TableCell>
                            <TableCell className="text-right font-mono">
                              {Number(t.source_amount).toLocaleString()} {t.source_currency}
                              {t.target_currency && t.target_currency !== t.source_currency && (
                                <div className="text-xs text-muted-foreground">
                                  → {Number(t.target_amount || 0).toLocaleString()} {t.target_currency}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={statusColor(t.status)}>{t.status}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

const Row = ({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2 last:border-0 last:pb-0">
    <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
    <span className="font-medium text-right truncate max-w-[60%]">{value}</span>
  </div>
);

export default UserDetailPage;
