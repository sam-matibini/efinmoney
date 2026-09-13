import {
  NUVEI_CAD_EFT_LIVE,
  NUVEI_MW_DEFAULT_GATEWAY,
  NUVEI_MW_SANDBOX_BASE,
  buildNuveiCadEftSale,
  nuveiCadEftComingSoon,
} from "../src/lib/nuveiMiddleware.ts";
import { cadSendPayInCheckout } from "../src/lib/cadCollectCheckout.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

assert("CAD EFT is coming soon until live keys", nuveiCadEftComingSoon() === true && NUVEI_CAD_EFT_LIVE === false);
assert("sandbox host is Nuvei middleware", NUVEI_MW_SANDBOX_BASE === "https://devapi.nuveiconnect.com");
assert("default EFT gateway is CheckCommerce", NUVEI_MW_DEFAULT_GATEWAY === "CheckCommerce");

const sale = buildNuveiCadEftSale({
  amount: 6.99,
  orderId: "EFM-TEST-1",
  name: "Samson Matibini",
  email: "sam@efintax.biz",
  customerId: "user-1",
});
assert("ACH account type", sale.transactionAccountInformation.accountType === "ACH");
assert("CAD currency", sale.transactionPayment.currencyCode === "CAD");
assert("sale type", sale.transactionPayment.transactionType === "sale");
assert("amount formatted", sale.transactionPayment.amount === "6.99");
assert("Canada billing country", sale.accountBillingInfo.country === "CA");

assert("Bank pay-in stays EFT (not Interac)", cadSendPayInCheckout("bank") === "eft");
assert("Interac pay-in stays Interac", cadSendPayInCheckout("interac") === "interac");
assert("Card pay-in stays card (Nomba)", cadSendPayInCheckout("card") === "card");

const listed = await fetch(`${NUVEI_MW_SANDBOX_BASE}/api/gateway/list`, {
  headers: { "X-Version": "3" },
});
assert("sandbox gateway list HTTP 200", listed.ok, listed.status);
const body = (await listed.json()) as { gateways?: Array<{ name?: string }> };
const names = (body.gateways || []).map((g) => String(g.name));
assert("CheckCommerce is a live sandbox gateway", names.includes("CheckCommerce"), names);

if (process.exitCode) {
  console.error("Nuvei middleware checks failed");
  process.exit(1);
}
console.log("Nuvei middleware checks passed");
