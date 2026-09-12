import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Activity, CheckCircle2, AlertTriangle, Plug, Webhook, Code2,
  Eye, RefreshCw, Lock, Globe, Server, ShieldCheck, ArrowRight,
  XCircle, Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import AdminLayout from "@/components/admin-portal/AdminLayout";
import TopScrollSync from "@/components/admin-portal/TopScrollSync";

type IntegrationKey = string;

const INTEGRATION_CATEGORIES = [
  "Payments — Africa",
  "Payments — Global & Cards",
  "Banking",
  "Crypto & Stablecoin",
  "KYC & Compliance",
  "Messaging",
] as const;

const INTEGRATIONS: Array<{
  key: IntegrationKey;
  name: string;
  description: string;
  category: (typeof INTEGRATION_CATEGORIES)[number];
  envHints: string[];
}> = [
  // Payments — Africa
  { key: "nomba", name: "Nomba", description: "NGN bank + Global Payout (Africa MoMo, CAD/GBP/EUR/USD) & collection", category: "Payments — Africa", envHints: ["NOMBA_CLIENT_ID", "NOMBA_CLIENT_SECRET", "NOMBA_ACCOUNT_ID", "NOMBA_PAYOUT_SOURCE_CURRENCY"] },
  { key: "ghana", name: "Ghana Pay", description: "Ghana GHS collection & mobile-money payouts", category: "Payments — Africa", envHints: ["GHANA_PAY_API_URL", "GHANA_PAY_USER"] },
  { key: "fincra", name: "Fincra", description: "Africa collect + NGN/GHS/KES payouts & CAD Interac", category: "Payments — Africa", envHints: ["FINCRA_SECRET_KEY", "FINCRA_BUSINESS_ID"] },
  { key: "flovide", name: "Flovide", description: "CAD Interac Auto Deposit + NGN/KES/GHS payouts (OhentPay)", category: "Payments — Global & Cards", envHints: ["FLOVIDE_PUBLIC_KEY", "FLOVIDE_SECRET_KEY"] },
  { key: "flutterwave", name: "Flutterwave", description: "African payouts, top-ups & bills (TZS primary)", category: "Payments — Africa", envHints: ["FLW_SECRET_KEY", "FLW_PUBLIC_KEY"] },
  { key: "swychr", name: "Swychr", description: "International pay-in/out, virtual cards & airtime", category: "Payments — Africa", envHints: ["SWYCHR_EMAIL", "SWYCHR_PASSWORD"] },
  { key: "elicate", name: "Elicate Pay", description: "Zambia MoMo (ZMW) top-up, send & payment links", category: "Payments — Africa", envHints: ["ELICATE_SECRET_KEY", "ELICATE_PUBLIC_KEY"] },
  { key: "paytota", name: "Paytota", description: "USD/EUR/GBP/CAD invoices + East Africa MoMo", category: "Payments — Africa", envHints: ["PAYTOTA_SECRET_KEY", "PAYTOTA_BASE_URL"] },
  { key: "lenhub", name: "Lenhub Flutter", description: "Card collect + FX bank/MoMo payouts wrapper", category: "Payments — Africa", envHints: ["LENHUB_FLUTTER_API_KEY", "LENHUB_FLUTTER_USER_KEY"] },
  { key: "mtn_momo", name: "MTN MoMo", description: "Pan-African MTN Mobile Money payouts", category: "Payments — Africa", envHints: ["MTN_MOMO_PRIMARY_KEY"] },
  { key: "mpesa", name: "M-Pesa", description: "Safaricom mobile money (Kenya)", category: "Payments — Africa", envHints: ["MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET"] },
  { key: "pawapay", name: "PawaPay", description: "Pan-African mobile money payouts", category: "Payments — Africa", envHints: ["PAWAPAY_API_TOKEN"] },
  { key: "yellowcard", name: "Yellowcard", description: "Africa stablecoin on/off-ramp payouts", category: "Payments — Africa", envHints: ["YELLOWCARD_API_KEY", "YELLOWCARD_SECRET"] },
  // Payments — Global & Cards
  { key: "stripe", name: "Stripe", description: "Card charges, Connect, Issuing & Treasury", category: "Payments — Global & Cards", envHints: ["STRIPE_SECRET_KEY"] },
  { key: "adyen", name: "Adyen", description: "Global card drop-in & payment links", category: "Payments — Global & Cards", envHints: ["ADYEN_API_KEY", "ADYEN_MERCHANT_ACCOUNT"] },
  { key: "dodo", name: "Dodo Payments", description: "MoR global card checkout for USD/CAD/EUR/GBP wallet top-up", category: "Payments — Global & Cards", envHints: ["DODO_PAYMENTS_API_KEY", "DODO_PAYMENTS_WEBHOOK_KEY"] },
  { key: "paypal", name: "PayPal", description: "Orders API wallet top-up for USD/CAD/EUR/GBP", category: "Payments — Global & Cards", envHints: ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"] },
  { key: "square", name: "Square", description: "Card checkout for USD/EUR/GBP wallet top-up", category: "Payments — Global & Cards", envHints: ["SQUARE_ACCESS_TOKEN", "SQUARE_APPLICATION_ID", "SQUARE_LOCATION_ID"] },
  { key: "paysafe", name: "Paysafe", description: "Canadian Interac & EFT payouts", category: "Payments — Global & Cards", envHints: ["PAYSAFE_API_KEY"] },
  { key: "bambora", name: "Bambora (Worldline)", description: "CAD/USD card collect, saved profiles, Canadian EFT debit", category: "Payments — Global & Cards", envHints: ["BAMBORA_MERCHANT_ID", "BAMBORA_API_PASSCODE", "BAMBORA_PAYMENTS_PASSCODE", "BAMBORA_BATCH_PASSCODE"] },
  { key: "verto", name: "Verto", description: "Corporate FX, V-Pay and partner bank payouts", category: "Payments — Global & Cards", envHints: ["VERTO_CLIENT_ID", "VERTO_API_KEY"] },
  // Banking
  { key: "plaid", name: "Plaid", description: "Bank linking (CA/US) and live balances on the Bank tab", category: "Banking", envHints: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ENV"] },
  { key: "interac", name: "Interac", description: "Canada domestic e-Transfer / EFT rail", category: "Banking", envHints: ["INTERAC_CLIENT_ID", "INTERAC_PRIVATE_JWK"] },
  // Crypto & Stablecoin
  { key: "circle", name: "Circle", description: "USDC corridor & CPN stablecoin payouts", category: "Crypto & Stablecoin", envHints: ["CIRCLE_API_KEY"] },
  { key: "crossmint", name: "Crossmint", description: "Crypto order execution", category: "Crypto & Stablecoin", envHints: ["CROSSMINT_API_KEY"] },
  { key: "stellar", name: "Stellar", description: "SEP-31 anchor payouts & XLM/USDC wallets", category: "Crypto & Stablecoin", envHints: ["STELLAR_TREASURY_SEED"] },
  // KYC & Compliance
  { key: "persona", name: "Persona", description: "KYC & ID verification", category: "KYC & Compliance", envHints: ["PERSONA_API_KEY"] },
  { key: "sumsub", name: "Sumsub", description: "Enhanced due diligence — ID + AML checks", category: "KYC & Compliance", envHints: ["SUMSUB_APP_TOKEN", "SUMSUB_SECRET_KEY"] },
  // Messaging
  { key: "resend", name: "Resend", description: "Transactional & broadcast email", category: "Messaging", envHints: ["RESEND_API_KEY"] },
];

const EDGE_FUNCTIONS: Array<{ name: string; description: string; jwt: boolean; category: string }> = [
  // Transfers
  { name: "execute-transfer",          description: "Cross-border transfer execution",            jwt: true,  category: "Transfers" },
  { name: "cancel-transfer",           description: "Cancel a pending transfer",                  jwt: true,  category: "Transfers" },
  { name: "internal-transfer",         description: "Between-wallet internal transfer",            jwt: true,  category: "Transfers" },
  { name: "intra-ca-transfer-create",  description: "Canada domestic Interac / EFT transfer",     jwt: false, category: "Transfers" },
  // FX
  { name: "fx-engine",                 description: "FX rate quotes & swap execution",            jwt: true,  category: "FX" },
  { name: "verto-ops",                 description: "Verto wallets, FX quote/book, partner V-Pay", jwt: true,  category: "Verto" },
  { name: "verto-payout",              description: "Corporate Verto payout rail",                jwt: true,  category: "Verto" },
  { name: "verto-webhook",             description: "Receives Verto payment status events",       jwt: false, category: "Verto" },
  { name: "partner-balance-verto",     description: "Verto wallet balances for liquidity",        jwt: true,  category: "Verto" },
  { name: "circle-quote",              description: "Quote via Circle USDC corridor",             jwt: true,  category: "FX" },
  { name: "market-rates",              description: "Public live FX market rates",                jwt: false, category: "FX" },
  { name: "refresh-fx-rates",          description: "Cron-style FX rate refresh",                jwt: false, category: "FX" },
  // Flutterwave
  { name: "flutterwave-payout",        description: "Initiates Flutterwave NGN payouts",         jwt: true,  category: "Flutterwave" },
  { name: "flutterwave-webhook",       description: "Receives Flutterwave events",               jwt: false, category: "Flutterwave" },
  { name: "flw-va-usdc-probe",         description: "Probe FLW USD VA + USDC wallet APIs",      jwt: true,  category: "Flutterwave" },
  { name: "flw-create-virtual-account",description: "Create FLW virtual bank account",           jwt: false, category: "Flutterwave" },
  { name: "flw-get-banks",             description: "Fetch bank list via Flutterwave",           jwt: true,  category: "Flutterwave" },
  { name: "flw-get-billers",           description: "Fetch biller categories via Flutterwave",   jwt: false, category: "Flutterwave" },
  { name: "flw-initialize-payment",    description: "Initialize FLW payment session",            jwt: true,  category: "Flutterwave" },
  { name: "flw-bill-payment",          description: "Execute bill payment via Flutterwave",      jwt: false, category: "Flutterwave" },
  { name: "flw-validate-bill",         description: "Validate bill reference via Flutterwave",   jwt: false, category: "Flutterwave" },
  { name: "flw-resolve-account",       description: "Validate bank account via Flutterwave",     jwt: true,  category: "Flutterwave" },
  { name: "flw-reconcile-transfers",   description: "Reconcile FLW transfer records",            jwt: false, category: "Flutterwave" },
  { name: "flw-verify-payment",        description: "Verify FLW payment status",                 jwt: true,  category: "Flutterwave" },
  { name: "flw-verify-transfer",       description: "Verify FLW transfer status",                jwt: true,  category: "Flutterwave" },
  // Paysafe
  { name: "paysafe-payout",            description: "Initiates Paysafe EFT/Interac payouts",    jwt: false, category: "Paysafe" },
  { name: "paysafe-verify-transfer",   description: "Verify Paysafe transfer status",            jwt: false, category: "Paysafe" },
  { name: "paysafe-webhook",           description: "Receives Paysafe events",                   jwt: false, category: "Paysafe" },
  // Bambora / Worldline NAM
  { name: "bambora-probe",             description: "Test Bambora Profile/Payments/Batch auth",  jwt: true,  category: "Bambora" },
  { name: "bambora-config",            description: "Public Custom Checkout merchant config",   jwt: false, category: "Bambora" },
  { name: "bambora-create-payment",    description: "Charge card token + credit wallet",        jwt: true,  category: "Bambora" },
  { name: "bambora-save-card",         description: "Save Custom Checkout token as profile",    jwt: true,  category: "Bambora" },
  { name: "bambora-charge-saved",      description: "Charge saved Bambora profile card",        jwt: true,  category: "Bambora" },
  { name: "bambora-save-bank",         description: "Save Canadian bank for EFT",               jwt: true,  category: "Bambora" },
  { name: "bambora-eft-collect",       description: "Submit EFT debit batch collect",           jwt: true,  category: "Bambora" },
  { name: "bambora-delete-method",     description: "Delete saved Bambora method",              jwt: true,  category: "Bambora" },
  { name: "bambora-batch-reconcile",   description: "Credit settled EFT collections (ops)",     jwt: true,  category: "Bambora" },
  // Stripe
  { name: "stripe-payout",             description: "Visa Direct push payouts",                  jwt: false, category: "Stripe" },
  { name: "stripe-payout-webhook",     description: "Receives Stripe payout events",             jwt: false, category: "Stripe" },
  { name: "stripe-webhook",            description: "Receives Stripe card events",               jwt: false, category: "Stripe" },
  { name: "stripe-payin-webhook",      description: "Receives Stripe pay-in events",             jwt: false, category: "Stripe" },
  { name: "stripe-payment-intent",     description: "Create Stripe payment intent",              jwt: false, category: "Stripe" },
  { name: "stripe-create-checkout-session", description: "Create Stripe checkout session",      jwt: false, category: "Stripe" },
  { name: "stripe-save-card",          description: "Save card to Stripe customer",              jwt: false, category: "Stripe" },
  { name: "stripe-save-card-confirm",  description: "Confirm saved-card setup intent",           jwt: false, category: "Stripe" },
  { name: "stripe-charge-card",        description: "Charge card via Stripe",                    jwt: false, category: "Stripe" },
  { name: "stripe-charge-saved-card",  description: "Charge a stored card",                     jwt: false, category: "Stripe" },
  { name: "stripe-mode-check",         description: "Check Stripe live/test mode",               jwt: false, category: "Stripe" },
  { name: "stripe-config-status",      description: "Check Stripe config completeness",          jwt: false, category: "Stripe" },
  { name: "stripe-connect-account-session",  description: "Create Stripe Connect session",      jwt: false, category: "Stripe" },
  { name: "stripe-connect-create-account",   description: "Create Stripe Connect account",      jwt: false, category: "Stripe" },
  { name: "stripe-connect-instant-payout",   description: "Stripe Connect instant payout",      jwt: false, category: "Stripe" },
  { name: "stripe-connect-refresh-status",   description: "Refresh Stripe Connect status",      jwt: false, category: "Stripe" },
  { name: "stripe-issuing-balance",    description: "Stripe Issuing card balance",               jwt: false, category: "Stripe" },
  { name: "stripe-issuing-card-details",     description: "Reveal issuing card details",        jwt: false, category: "Stripe" },
  { name: "stripe-issuing-create-card",      description: "Create virtual issuing card",        jwt: false, category: "Stripe" },
  { name: "stripe-issuing-fund-card",        description: "Fund a Stripe issuing card",         jwt: false, category: "Stripe" },
  { name: "stripe-issuing-update-card",      description: "Update issuing card status",         jwt: false, category: "Stripe" },
  { name: "stripe-issuing-webhook",          description: "Receives Stripe Issuing events",     jwt: false, category: "Stripe" },
  // Adyen
  { name: "adyen-create-session",      description: "Create Adyen drop-in session",             jwt: false, category: "Adyen" },
  { name: "adyen-create-paylink",      description: "Create Adyen payment link",                jwt: false, category: "Adyen" },
  { name: "adyen-confirm-session",     description: "Confirm Adyen payment session",            jwt: false, category: "Adyen" },
  { name: "adyen-modify-payment",      description: "Modify or cancel Adyen payment",           jwt: false, category: "Adyen" },
  { name: "adyen-webhook",             description: "Receives Adyen events",                    jwt: false, category: "Adyen" },
  // Plaid
  { name: "plaid-create-link-token",   description: "Create Plaid Link token",                  jwt: false, category: "Plaid" },
  { name: "plaid-exchange-token",      description: "Exchange Plaid public token",               jwt: false, category: "Plaid" },
  { name: "plaid-refresh-balances",    description: "Live Plaid bank balances for Bank tab",     jwt: false, category: "Plaid" },
  // Interac
  { name: "vopay-interac-request",    description: "VoPay Interac Request Money → Loop Autodeposit", jwt: true,  category: "Interac" },
  { name: "vopay-webhook",            description: "VoPay Interac / EFT webhooks",                 jwt: false, category: "Interac" },
  { name: "interac-start",             description: "Start Interac e-Transfer request",         jwt: true,  category: "Interac" },
  { name: "interac-exchange",          description: "Exchange Interac tokens",                  jwt: true,  category: "Interac" },
  { name: "interac-callback",          description: "Receives Interac callbacks",               jwt: false, category: "Interac" },
  { name: "interac-jwks",              description: "Interac JWKS public key endpoint",         jwt: true,  category: "Interac" },
  // Circle
  { name: "circle-reconcile",          description: "Reconcile Circle USDC transactions",       jwt: false, category: "Circle" },
  { name: "circle-webhook",            description: "Receives Circle events",                   jwt: false, category: "Circle" },
  // Dodo Payments
  { name: "dodo-initialize-checkout", description: "Create Dodo checkout for wallet top-up", jwt: true, category: "Dodo" },
  { name: "dodo-verify-payment", description: "Verify Dodo payment on return URL", jwt: true, category: "Dodo" },
  { name: "dodo-webhook", description: "Receives Dodo payment.succeeded events", jwt: false, category: "Dodo" },
  { name: "paypal-public-config", description: "PayPal client id for hosted buttons", jwt: true, category: "PayPal" },
  { name: "paypal-create-order", description: "Create PayPal order for wallet top-up", jwt: true, category: "PayPal" },
  { name: "paypal-capture-order", description: "Capture PayPal order and credit wallet", jwt: true, category: "PayPal" },
  { name: "square-public-config", description: "Square application id / location for Web Payments", jwt: true, category: "Square" },
  { name: "square-create-checkout", description: "Create Square Checkout payment link", jwt: true, category: "Square" },
  { name: "square-create-payment", description: "Charge a Square Web Payments token", jwt: true, category: "Square" },
  { name: "square-verify-checkout", description: "Verify Square Checkout and credit wallet", jwt: true, category: "Square" },
  // Yellowcard
  { name: "yellowcard-payout",         description: "Initiates Yellowcard Africa payouts",      jwt: false, category: "Yellowcard" },
  { name: "yellowcard-webhook",        description: "Receives Yellowcard events",               jwt: false, category: "Yellowcard" },
  // Elicate
  { name: "elicate-payout",            description: "Zambia MoMo payouts",                      jwt: false, category: "Elicate" },
  { name: "elicate-charge",            description: "Zambia MoMo collections (secret)",         jwt: true,  category: "Elicate" },
  { name: "elicate-status",            description: "Poll + settle charge status",              jwt: true,  category: "Elicate" },
  { name: "elicate-stream",            description: "SSE proxy for payment status",             jwt: true,  category: "Elicate" },
  { name: "elicate-checkout",          description: "Public-key checkout collect",              jwt: true,  category: "Elicate" },
  { name: "elicate-payment-links",     description: "Create/list/update MoMo payment links",    jwt: true,  category: "Elicate" },
  { name: "elicate-reconcile",         description: "Reconcile pending ZMW payouts",            jwt: true,  category: "Elicate" },
  { name: "elicate-webhook",           description: "Receives Elicate HMAC webhooks",           jwt: false, category: "Elicate" },
  // MTN MoMo
  { name: "mtn-momo-payout",           description: "Initiates MTN Mobile Money payouts",      jwt: false, category: "MTN MoMo" },
  { name: "mtn-momo-webhook",          description: "Receives MTN MoMo events",                jwt: false, category: "MTN MoMo" },
  // PawaPay
  { name: "pawapay-payout",            description: "Initiates PawaPay mobile money payouts",  jwt: true,  category: "PawaPay" },
  { name: "pawapay-webhook",           description: "Receives PawaPay events",                 jwt: false, category: "PawaPay" },
  // Fincra
  { name: "fincra-initialize-checkout",description: "Initialize Fincra checkout",              jwt: true,  category: "Fincra" },
  { name: "fincra-payout",             description: "Initiates Fincra payouts",                jwt: false, category: "Fincra" },
  { name: "partner-balance-fincra",    description: "Fincra disbursement wallet balances",     jwt: false, category: "Fincra" },
  { name: "partner-rail-balances",     description: "Live Fincra/Verto/Nomba balances for Bank tab", jwt: false, category: "Fincra" },
  { name: "linked-bank-rail-payout",   description: "Pay linked banks from Fincra/Nomba float", jwt: false, category: "Fincra" },
  { name: "fincra-verify-payment",     description: "Verify Fincra payment status",            jwt: true,  category: "Fincra" },
  { name: "fincra-webhook",            description: "Receives Fincra events",                  jwt: false, category: "Fincra" },
  { name: "wise-cad-interac",           description: "CAD Interac e-Transfer pay-in (Loop)",    jwt: true,  category: "Wise" },
  { name: "fincra-cad-interac",         description: "Fincra CAD Interac (@fincra.ca Autodeposit)", jwt: true,  category: "Fincra" },
  { name: "fincra-cad-va-probe",        description: "List/request Fincra CAD Interac virtual account", jwt: true,  category: "Fincra" },
  { name: "emfi-probe",                 description: "Fiserv EmFi (Payfare BaaS) auth + host smoke test", jwt: true,  category: "Fiserv EmFi" },
  { name: "flovide-cad-interac",        description: "Flovide CAD Interac Auto Deposit collect", jwt: true,  category: "Flovide" },
  { name: "flovide-payout",             description: "Flovide NGN/KES/GHS/UGX/CAD payouts",     jwt: false, category: "Flovide" },
  { name: "flovide-webhook",            description: "Receives Flovide payment events",         jwt: false, category: "Flovide" },
  { name: "flovide-api-smoke",          description: "Probe Flovide balances/corridors",        jwt: false, category: "Flovide" },
  { name: "flovide-get-banks",          description: "Fetch bank / MoMo list via Flovide",      jwt: true,  category: "Flovide" },
  { name: "flovide-resolve-account",    description: "Validate bank account via Flovide",       jwt: true,  category: "Flovide" },
  { name: "flovide-rates",              description: "FX rates via Flovide",                    jwt: true,  category: "Flovide" },
  { name: "flovide-reconcile",          description: "Poll Flovide txns to credit Interac top-ups", jwt: false, category: "Flovide" },
  { name: "ops-settle",                 description: "Admin retry/complete/refund pending_ops transfers", jwt: false, category: "Ops" },
  { name: "ops-alert",                  description: "Email ops alert (ukwenzyb@gmail.com)",     jwt: false, category: "Ops" },
  // Ghana
  { name: "ghana-collection",          description: "Ghana GHS collection initiation",         jwt: true,  category: "Ghana" },
  { name: "ghana-payout",              description: "Ghana GHS payout",                        jwt: false, category: "Ghana" },
  { name: "ghana-payment-callback",    description: "Receives Ghana payment callbacks",        jwt: false, category: "Ghana" },
  // Nomba
  { name: "nomba-collection",          description: "Nomba NGN collection",                    jwt: true,  category: "Nomba" },
  { name: "nomba-exchange-rate",       description: "Nomba FX rates",                          jwt: false, category: "Nomba" },
  { name: "nomba-get-banks",           description: "Fetch bank list via Nomba",               jwt: true,  category: "Nomba" },
  { name: "nomba-payment-callback",    description: "Receives Nomba payment callbacks",        jwt: false, category: "Nomba" },
  { name: "nomba-payout",              description: "Nomba NGN + Global Payout disbursements", jwt: false, category: "Nomba" },
  { name: "partner-balance-nomba",     description: "Nomba disbursement account balance",      jwt: false, category: "Nomba" },
  { name: "nomba-resolve-account",     description: "Validate bank account via Nomba",         jwt: true,  category: "Nomba" },
  { name: "nomba-transfer-conversion", description: "Nomba transfer conversion",               jwt: true,  category: "Nomba" },
  { name: "nomba-verify-transfer",     description: "Verify Nomba transfer status",            jwt: true,  category: "Nomba" },
  // Stellar
  { name: "generate-stellar-wallet",   description: "Generate Stellar wallet keypair",         jwt: true,  category: "Stellar" },
  { name: "stellar-add-trustline",     description: "Add Stellar trustline",                   jwt: true,  category: "Stellar" },
  { name: "stellar-anchor-discovery",  description: "SEP-1 anchor info discovery",             jwt: true,  category: "Stellar" },
  { name: "stellar-anchor-transfer",   description: "SEP-6/24 anchor transfer",                jwt: true,  category: "Stellar" },
  { name: "stellar-send-payment",      description: "Stellar XLM payment",                     jwt: true,  category: "Stellar" },
  { name: "stellar-sep31-payout",      description: "SEP-31 cross-border payment",             jwt: true,  category: "Stellar" },
  // Crossmint
  { name: "crossmint-create-order",    description: "Create Crossmint crypto order",           jwt: true,  category: "Crossmint" },
  { name: "crossmint-webhook",         description: "Receives Crossmint events",               jwt: false, category: "Crossmint" },
  // Treasury
  { name: "treasury-create-fa",        description: "Create Treasury financial account",       jwt: true,  category: "Treasury" },
  { name: "treasury-inbound-transfer", description: "Treasury inbound transfer",               jwt: true,  category: "Treasury" },
  { name: "treasury-list",             description: "List Treasury accounts",                  jwt: true,  category: "Treasury" },
  { name: "treasury-outbound-payment", description: "Treasury outbound payment",               jwt: true,  category: "Treasury" },
  { name: "treasury-outbound-transfer",description: "Treasury outbound transfer",              jwt: true,  category: "Treasury" },
  { name: "treasury-reveal-account-numbers", description: "Reveal Treasury account numbers",  jwt: true,  category: "Treasury" },
  { name: "treasury-sync-balances",    description: "Sync Treasury balances",                  jwt: false, category: "Treasury" },
  { name: "treasury-webhook",          description: "Receives Treasury events",                jwt: false, category: "Treasury" },
  { name: "treasury-worker",           description: "Treasury background worker",              jwt: false, category: "Treasury" },
  // Sumsub KYC
  { name: "sumsub-create-applicant",   description: "Create Sumsub KYC applicant",             jwt: true,  category: "KYC" },
  { name: "sumsub-get-applicant-status",description: "Check Sumsub applicant status",          jwt: true,  category: "KYC" },
  { name: "sumsub-refresh-token",      description: "Refresh Sumsub access token",             jwt: true,  category: "KYC" },
  { name: "sumsub-webhook",            description: "Receives Sumsub KYC events",              jwt: false, category: "KYC" },
  { name: "create-persona-inquiry",    description: "Create Persona KYC inquiry",              jwt: true,  category: "KYC" },
  { name: "persona-self-approve",      description: "Persona self-approval flow",              jwt: true,  category: "KYC" },
  { name: "persona-webhook",           description: "Receives Persona KYC events",             jwt: false, category: "KYC" },
  { name: "get-persona-inquiry-status",description: "Check Persona inquiry status",            jwt: true,  category: "KYC" },
  { name: "approve-kyc",               description: "Admin KYC approval",                      jwt: true,  category: "KYC" },
  { name: "reject-kyc",                description: "Admin KYC rejection",                     jwt: true,  category: "KYC" },
  // Compliance
  { name: "compliance-monitoring",     description: "AML rule evaluation",                     jwt: true,  category: "Compliance" },
  { name: "safeguarding-check",        description: "Safeguarding compliance check",           jwt: false, category: "Compliance" },
  { name: "sanctions-sync",            description: "Sync sanctions watchlist",                jwt: true,  category: "Compliance" },
  { name: "incident-management",       description: "Compliance incident management",          jwt: true,  category: "Compliance" },
  { name: "bank-reconciliation",       description: "Match imported bank transactions",        jwt: true,  category: "Compliance" },
  // Cards
  { name: "virtual-card-ops",          description: "Virtual card operations (freeze/activate)",jwt: false, category: "Cards" },
  { name: "backfill-card-currency",    description: "Backfill card transaction currency",      jwt: true,  category: "Cards" },
  { name: "initiate-cpn-payout",       description: "CPN card payout initiation",              jwt: true,  category: "Cards" },
  // Payment Links
  { name: "payment-link-create",       description: "Create shareable payment link",           jwt: false, category: "Payment Links" },
  { name: "payment-link-resolve",      description: "Resolve payment link details",            jwt: false, category: "Payment Links" },
  { name: "payment-link-claim",        description: "Claim a payment link",                   jwt: false, category: "Payment Links" },
  { name: "payment-link-revoke",       description: "Revoke a payment link",                  jwt: false, category: "Payment Links" },
  // Finance & Operations
  { name: "generate-receipt",          description: "PDF transfer receipts",                   jwt: true,  category: "Finance" },
  { name: "send-statement-email",      description: "Email account statement PDF",             jwt: true,  category: "Finance" },
  { name: "expense-claim-process",     description: "Process expense claim",                   jwt: true,  category: "Finance" },
  { name: "vendor-bill-pay",           description: "Vendor bill payment",                     jwt: true,  category: "Finance" },
  { name: "recurring-bills-run",       description: "Execute recurring bill payments",         jwt: true,  category: "Finance" },
  { name: "ca-bill-payment",           description: "Canada bill payment",                     jwt: true,  category: "Finance" },
  // Crypto
  { name: "crypto-trading",            description: "Fiat ⇄ Crypto execution",                jwt: true,  category: "Crypto" },
  { name: "execute-crypto-swap",       description: "Execute crypto swap",                     jwt: true,  category: "Crypto" },
  // Admin
  { name: "admin-create-user",         description: "Admin user provisioning",                 jwt: true,  category: "Admin" },
  { name: "admin-delete-user",         description: "Admin user deletion",                     jwt: true,  category: "Admin" },
  { name: "admin-invite-staff",        description: "Invite and onboard staff member",         jwt: true,  category: "Admin" },
  { name: "admin-review-staff",        description: "Review staff KYC document",               jwt: true,  category: "Admin" },
  { name: "admin-staff-doc-url",       description: "Generate signed staff document URL",      jwt: true,  category: "Admin" },
  // Communication
  { name: "send-email",                description: "Transactional email via Resend",          jwt: false, category: "Communication" },
  { name: "auth-send-email",           description: "Custom Supabase auth email hook",         jwt: false, category: "Communication" },
  { name: "notify-user",               description: "Push notification to user",               jwt: true,  category: "Communication" },
  { name: "notify-staff",              description: "Email notification to staff",             jwt: false, category: "Communication" },
  { name: "send-broadcast",            description: "Bulk broadcast email",                    jwt: false, category: "Communication" },
  { name: "contact-message",           description: "Contact form submission",                 jwt: false, category: "Communication" },
  { name: "unsubscribe",               description: "Email unsubscribe handler",               jwt: false, category: "Communication" },
  // AI
  { name: "alice-chat",                description: "Alice AI assistant chat",                 jwt: true,  category: "AI" },
  { name: "scan-purchase-bill",        description: "AI-powered bill scanner",                 jwt: true,  category: "AI" },
  // Diagnostics
  { name: "test-integration",          description: "Test provider API connectivity",          jwt: false, category: "Diagnostics" },
  { name: "test-integrations",         description: "Bulk integration health check",           jwt: false, category: "Diagnostics" },
  { name: "flw-corridor-probe",        description: "Tests CAD/USD/NGN collect on FLW",        jwt: true,  category: "Diagnostics" },
  { name: "flw-va-usdc-probe",         description: "Tests FLW USD virtual account + USDC",    jwt: true,  category: "Diagnostics" },
  { name: "fincra-cad-va-probe",        description: "Tests Fincra CAD VA list + API request",  jwt: true,  category: "Diagnostics" },
  { name: "bambora-probe",             description: "Tests Bambora CAD Profile/Payments auth", jwt: true,  category: "Diagnostics" },
];

export default function ApiManagementPage() {
  const [selectedPayload, setSelectedPayload] = useState<{ provider: string; event: string; payload: unknown } | null>(null);
  const [probeOpen, setProbeOpen] = useState(false);
  const [probeTitle, setProbeTitle] = useState("");
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<unknown>(null);
  const queryClient = useQueryClient();

  const runFlutterwaveCorridorProbe = async () => {
    setProbeLoading(true);
    setProbeResult(null);
    setProbeTitle("Flutterwave corridor probe (CAD / USD / NGN)");
    setProbeOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("flw-corridor-probe", {
        body: { currencies: ["CAD", "USD", "NGN"], amount: 10 },
      });
      if (error) throw error;
      setProbeResult(data);
      const probes = (data as { payment_init_probes?: Array<{ currency: string; ok: boolean }> })?.payment_init_probes ?? [];
      const cad = probes.find((p) => p.currency === "CAD");
      if (cad?.ok) toast.success("CAD collect: Flutterwave returned a checkout link");
      else toast.warning("CAD collect probe failed — see results");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Probe failed";
      setProbeResult({ error: msg, hint: "Deploy flw-corridor-probe edge function, or run scripts/probe-flutterwave-corridors.mjs locally with FLW_SECRET_KEY." });
      toast.error("Corridor probe failed", { description: msg });
    } finally {
      setProbeLoading(false);
    }
  };

  const runFlutterwaveVaUsdcProbe = async () => {
    setProbeLoading(true);
    setProbeResult(null);
    setProbeTitle("Flutterwave USD virtual account + USDC");
    setProbeOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("flw-va-usdc-probe", { body: {} });
      if (error) throw error;
      setProbeResult(data);
      const interp = (data as { interpretation?: { usd_virtual_account?: string; usdc?: string } })?.interpretation;
      toast.message(interp?.usd_virtual_account || "USD VA probe done", {
        description: interp?.usdc,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Probe failed";
      setProbeResult({ error: msg, hint: "Deploy flw-va-usdc-probe, then retry." });
      toast.error("USD VA / USDC probe failed", { description: msg });
    } finally {
      setProbeLoading(false);
    }
  };

  const runFincraCadVa = async (action: "probe" | "request") => {
    setProbeLoading(true);
    setProbeResult(null);
    setProbeTitle(action === "request" ? "Request Fincra CAD virtual account" : "Fincra CAD virtual account");
    setProbeOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("fincra-cad-va-probe", {
        body: { action },
      });
      if (error) throw error;
      setProbeResult(data);
      const alias = (data as { interac_alias?: string | null })?.interac_alias;
      const requested = (data as { request?: { ok?: boolean; message?: string } })?.request;
      if (action === "request" && requested?.ok) toast.success("CAD account requested via Fincra API");
      else if (alias) toast.success(`CAD Interac alias: ${alias}`);
      else toast.message((data as { reply_to_fincra?: string })?.reply_to_fincra || "CAD VA probe done");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Probe failed";
      setProbeResult({
        error: msg,
        hint: "Deploy fincra-cad-va-probe, then retry. Fincra asked us to request CAD via POST /profile/virtual-accounts/requests.",
      });
      toast.error("Fincra CAD VA probe failed", { description: msg });
    } finally {
      setProbeLoading(false);
    }
  };

  const runBamboraProbe = async () => {
    setProbeLoading(true);
    setProbeResult(null);
    setProbeTitle("Bambora (Worldline) CAD");
    setProbeOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("bambora-probe", { body: {} });
      if (error) throw error;
      setProbeResult(data);
      if ((data as { ok?: boolean })?.ok) toast.success("Bambora Profile API auth OK");
      else toast.message("Bambora probe finished — check result");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Probe failed";
      setProbeResult({ error: msg, hint: "Deploy bambora-probe and confirm BAMBORA_* secrets." });
      toast.error("Bambora probe failed", { description: msg });
    } finally {
      setProbeLoading(false);
    }
  };

  const runTestConnection = async (key: IntegrationKey, name: string) => {
    setProbeLoading(true);
    setProbeResult(null);
    setProbeTitle(`${name} — connection test`);
    setProbeOpen(true);
    try {
      const { data, error } = await supabase.functions.invoke("test-integration", {
        body: { provider: key },
      });
      if (error) throw error;
      setProbeResult(data);
      const result = data as { ok: boolean; message: string };
      if (result.ok) toast.success(`${name}: connected`);
      else toast.warning(`${name}: ${result.message}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Test failed";
      setProbeResult({ error: msg });
      toast.error(`${name} test failed`, { description: msg });
    } finally {
      setProbeLoading(false);
    }
  };

  // Integration health
  const { data: integrations, isLoading: loadingIntegrations, refetch: refetchIntegrations } = useQuery({
    queryKey: ["admin-integration-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("integration_settings").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Webhook logs (Flutterwave + Paysafe)
  const { data: webhookLogs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["admin-webhook-logs"],
    queryFn: async () => {
      const [flw, paysafe] = await Promise.all([
        supabase.from("flw_webhook_logs")
          .select("id, event, payload, processed, error, received_at")
          .order("received_at", { ascending: false }).limit(50),
        supabase.from("paysafe_webhook_logs")
          .select("id, event_type, raw_payload, processed, processing_error, created_at")
          .order("created_at", { ascending: false }).limit(50),
      ]);
      const rows: Array<{
        id: string; provider: string; event: string; status: "ok" | "error" | "pending";
        timestamp: string; payload: unknown; error?: string | null;
      }> = [];
      (flw.data ?? []).forEach((r) => rows.push({
        id: `flw-${r.id}`, provider: "flutterwave",
        event: r.event ?? "unknown",
        status: r.error ? "error" : r.processed ? "ok" : "pending",
        timestamp: r.received_at, payload: r.payload, error: r.error,
      }));
      (paysafe.data ?? []).forEach((r) => rows.push({
        id: `psf-${r.id}`, provider: "paysafe",
        event: r.event_type ?? "unknown",
        status: r.processing_error ? "error" : r.processed ? "ok" : "pending",
        timestamp: r.created_at, payload: r.raw_payload, error: r.processing_error,
      }));
      rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return rows.slice(0, 50);
    },
  });

  const integrationStatus = (key: IntegrationKey): { label: string; healthy: boolean } => {
    const row = (integrations ?? []).find((r: any) => r.key === key);
    if (row?.is_enabled) return { label: "Connected", healthy: true };
    if (row && !row.is_enabled) return { label: "Disabled", healthy: false };
    return { label: "Not Configured", healthy: false };
  };

  const toggleIntegration = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("integration_settings")
        .upsert({ key, is_enabled: enabled }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin-integration-settings"] });
      toast.success(`${vars.key} ${vars.enabled ? "enabled" : "disabled"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isActiveInteg = (key: IntegrationKey): boolean => {
    const row = (integrations ?? []).find((r: any) => r.key === key);
    return row?.is_enabled === true;
  };

  const activeCount = INTEGRATIONS.filter((i) => isActiveInteg(i.key)).length;

  return (
    <AdminLayout>
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Server className="h-7 w-7 text-primary" />
            System & API Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Every payment, banking, crypto, KYC and messaging provider in one place — toggle
            each on or off, test its connection, and see at a glance which are active.
          </p>
        </div>
      </div>

      <Link
        to="/admin/kyc-config"
        className="block group rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 hover:border-primary/50 transition-colors"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-primary/15 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="font-semibold">KYC Tier Configuration</div>
              <p className="text-sm text-muted-foreground">
                Edit tier limits, feature gates, and override any user's KYC tier. Reflects in the user portal in real time.
              </p>
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
        </div>
      </Link>

      <Tabs defaultValue="integrations" className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="integrations" className="gap-2"><Plug className="h-4 w-4" />Integrations</TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2"><Webhook className="h-4 w-4" />Webhook Logs</TabsTrigger>
          <TabsTrigger value="functions" className="gap-2"><Code2 className="h-4 w-4" />Edge Functions</TabsTrigger>
        </TabsList>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-6">
          <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <Badge className="bg-indigo-500/15 text-indigo-500 border-indigo-500/30 gap-1">
                <CheckCircle2 className="h-3 w-3" /> {activeCount} active
              </Badge>
              <span className="text-muted-foreground">of {INTEGRATIONS.length} providers</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetchIntegrations()} disabled={loadingIntegrations}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingIntegrations ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          {INTEGRATION_CATEGORIES.map((category) => {
            const items = INTEGRATIONS.filter((i) => i.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="mb-8">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  {category}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((integ) => {
                    const status = integrationStatus(integ.key);
                    const enabled = isActiveInteg(integ.key);
                    const isPlaid = integ.key === "plaid";
                    return (
                <Card key={integ.key} className={cn(
                  "hover:border-primary/40 transition-colors",
                  enabled && "border-indigo-500/30 bg-indigo-500/[0.03]",
                )}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Activity className={cn("h-4 w-4", enabled ? "text-indigo-500" : "text-primary")} />
                          {isPlaid && <span title="Most effective integration"><Zap className="h-4 w-4 text-amber-500" /></span>}
                          {integ.name}
                        </CardTitle>
                        <CardDescription className="mt-1">{integ.description}</CardDescription>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                      {status.healthy ? (
                        <Badge className="bg-indigo-500/15 text-indigo-500 hover:bg-indigo-500/20 border-indigo-500/30 gap-1">
                          <CheckCircle2 className="h-3 w-3" /> {status.label}
                        </Badge>
                        ) : status.label === "Disabled" ? (
                          <Badge variant="outline" className="bg-muted text-muted-foreground gap-1">
                            <XCircle className="h-3 w-3" /> {status.label}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 gap-1">
                          <AlertTriangle className="h-3 w-3" /> {status.label}
                        </Badge>
                      )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground font-mono">
                      {integ.envHints.join(" · ")}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={enabled}
                          onCheckedChange={(checked) =>
                            toggleIntegration.mutate({ key: integ.key, enabled: checked })
                          }
                          disabled={toggleIntegration.isPending}
                        />
                        <span className="text-xs text-muted-foreground">{enabled ? "Enabled" : "Disabled"}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                        size="sm" variant="secondary"
                        disabled={probeLoading}
                      onClick={() => {
                        if (integ.key === "flutterwave") {
                          void runFlutterwaveCorridorProbe();
                          } else {
                            void runTestConnection(integ.key, integ.name);
                        }
                      }}
                    >
                      {integ.key === "flutterwave" ? "Probe CAD/USD Collect" : "Test Connection"}
                    </Button>
                    {integ.key === "flutterwave" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={probeLoading}
                        onClick={() => void runFlutterwaveVaUsdcProbe()}
                      >
                        Probe USD VA + USDC
                      </Button>
                    )}
                    {integ.key === "fincra" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={probeLoading}
                          onClick={() => void runFincraCadVa("probe")}
                        >
                          Check CAD VA
                        </Button>
                        <Button
                          size="sm"
                          disabled={probeLoading}
                          onClick={() => void runFincraCadVa("request")}
                        >
                          Request CAD VA
                        </Button>
                      </>
                    )}
                    {integ.key === "bambora" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={probeLoading}
                        onClick={() => void runBamboraProbe()}
                      >
                        Test Bambora API
                      </Button>
                    )}
                    </div>
                    </div>
                    {isPlaid && (
                      <p className="text-[11px] text-amber-600 bg-amber-500/10 rounded-md px-2.5 py-1.5 mt-1">
                        <Zap className="h-3 w-3 inline mr-1" />
                        Plaid is the most effective active integration. Bank linking for Canada domestic transfers is live in production.
                      </p>
                    )}
                  </CardContent>
                </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </TabsContent>

        {/* Webhook logs */}
        <TabsContent value="webhooks" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Live Webhook Traffic</CardTitle>
                <CardDescription>Most recent 50 events across all providers</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetchLogs()} disabled={loadingLogs}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loadingLogs ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Payload</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingLogs ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                    ) : (webhookLogs ?? []).length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No webhook events yet</TableCell></TableRow>
                    ) : (
                      (webhookLogs ?? []).map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                            {formatDistanceToNow(new Date(row.timestamp), { addSuffix: true })}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="capitalize">{row.provider}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{row.event}</TableCell>
                          <TableCell>
                            {row.status === "ok" ? (
                              <Badge className="bg-indigo-500/15 text-indigo-500 border-indigo-500/30">processed</Badge>
                            ) : row.status === "error" ? (
                              <Badge className="bg-red-500/15 text-red-500 border-red-500/30">error</Badge>
                            ) : (
                              <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30">pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => setSelectedPayload({ provider: row.provider, event: row.event, payload: row.payload })}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Edge functions */}
        <TabsContent value="functions" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Edge Functions Directory</CardTitle>
              <CardDescription>Deployed serverless functions powering eFinMoney</CardDescription>
            </CardHeader>
            <CardContent>
              <TopScrollSync className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Function</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Auth</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(() => {
                      const rows: React.ReactNode[] = [];
                      let lastCategory = "";
                      EDGE_FUNCTIONS.forEach((fn) => {
                        if (fn.category !== lastCategory) {
                          lastCategory = fn.category;
                          rows.push(
                            <TableRow key={`cat-${fn.category}`} className="bg-muted/40 hover:bg-muted/40">
                              <TableCell colSpan={4} className="py-1.5 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {fn.category}
                              </TableCell>
                            </TableRow>
                          );
                        }
                        rows.push(
                      <TableRow key={fn.name}>
                            <TableCell className="font-mono text-sm pl-6">{fn.name}</TableCell>
                        <TableCell className="text-muted-foreground">{fn.description}</TableCell>
                        <TableCell>
                          {fn.jwt ? (
                            <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" /> JWT</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-500 border-blue-500/30"><Globe className="h-3 w-3" /> Public</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className="bg-indigo-500/15 text-indigo-500 border-indigo-500/30">Active</Badge>
                        </TableCell>
                      </TableRow>
                        );
                      });
                      return rows;
                    })()}
                  </TableBody>
                </Table>
              </TopScrollSync>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Integration probe / test dialog */}
      <Dialog open={probeOpen} onOpenChange={setProbeOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{probeTitle}</DialogTitle>
          </DialogHeader>
          {probeLoading ? (
            <p className="text-sm text-muted-foreground py-6">Testing connection — please wait…</p>
          ) : (
            <pre className="bg-muted rounded-md p-4 overflow-auto text-xs font-mono flex-1">
              <code>{JSON.stringify(probeResult ?? {}, null, 2)}</code>
            </pre>
          )}
        </DialogContent>
      </Dialog>

      {/* Payload viewer */}
      <Dialog open={!!selectedPayload} onOpenChange={(open) => !open && setSelectedPayload(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              {selectedPayload?.provider} · <span className="font-mono text-sm">{selectedPayload?.event}</span>
            </DialogTitle>
          </DialogHeader>
          <pre className="bg-muted rounded-md p-4 overflow-auto text-xs font-mono flex-1">
            <code>{JSON.stringify(selectedPayload?.payload ?? {}, null, 2)}</code>
          </pre>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
