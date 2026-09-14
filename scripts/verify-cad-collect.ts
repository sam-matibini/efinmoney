import {
  nombaCheckoutAllowedPaymentMethods,
  parseNombaCollectRails,
  isNombaPaymentMethodError,
} from "../supabase/functions/_shared/nomba-checkout-methods.ts";
import {
  cadCollectCostRank,
  orderCadCollectMethods,
  orderCadCollectRails,
  defaultCadCollectRail,
  isCadUnsafeCollectRail,
  cadSendPayInCheckout,
} from "../src/lib/cadCollectCheckout.ts";
import { toDbFundingSource } from "../src/lib/transferFundingSource.ts";
import { orderCadCollectRails as orderCadCollectRailsEdge } from "../supabase/functions/_shared/cad-collect-rails.ts";

function assert(name: string, ok: boolean, detail?: unknown) {
  if (!ok) {
    console.error(`FAIL ${name}`, detail ?? "");
    process.exitCode = 1;
    return;
  }
  console.log(`ok  ${name}`);
}

const cadBoth = nombaCheckoutAllowedPaymentMethods({
  checkoutCurrency: "USD",
  creditCurrency: "CAD",
  rails: ["card", "eft"],
});
assert("CAD Nomba checkout requests Intl Card", cadBoth.includes("Intl Card"));
assert("CAD Nomba checkout requests Card", cadBoth.includes("Card"));
assert("CAD Nomba checkout requests Intl Transfer (EFT / Pay by Bank)", cadBoth.includes("Intl Transfer"));
assert("CAD Nomba checkout requests Transfer", cadBoth.includes("Transfer"));

const cadCard = nombaCheckoutAllowedPaymentMethods({
  checkoutCurrency: "USD",
  creditCurrency: "CAD",
  rails: ["card"],
});
assert("CAD card-only omits Transfer", !cadCard.includes("Transfer") && !cadCard.includes("Intl Transfer"));
assert("CAD card-only includes Intl Card", cadCard.includes("Intl Card"));

const cadEft = nombaCheckoutAllowedPaymentMethods({
  checkoutCurrency: "USD",
  creditCurrency: "CAD",
  rails: ["eft"],
});
assert("CAD EFT-only omits Card", !cadEft.includes("Card") && !cadEft.includes("Intl Card"));
assert("CAD EFT-only includes Intl Transfer", cadEft.includes("Intl Transfer"));

const ngn = nombaCheckoutAllowedPaymentMethods({
  checkoutCurrency: "NGN",
  creditCurrency: "NGN",
  rails: ["card", "eft"],
});
assert("NGN checkout includes Card + Transfer", ngn.includes("Card") && ngn.includes("Transfer"));

assert("parse empty defaults to card+eft", parseNombaCollectRails(undefined).join(",") === "card,eft");
assert("parse bank maps to eft", parseNombaCollectRails(["bank"]).join(",") === "eft");
assert("parse card,transfer maps both", parseNombaCollectRails(["card", "transfer"]).join(",") === "card,eft");
assert("payment method error detected", isNombaPaymentMethodError("Invalid allowedPaymentMethods"));
assert("unrelated error not method error", !isNombaPaymentMethodError("The provided email is blocked"));

assert("Interac cheaper than Nomba card", cadCollectCostRank("interac") < cadCollectCostRank("nomba"));
assert("Wise EFT cheaper than Nomba card", cadCollectCostRank("wise") < cadCollectCostRank("nomba"));
assert("Nomba EFT cheaper than Nomba card", cadCollectCostRank("nomba_eft") < cadCollectCostRank("nomba"));
assert("Flutterwave is unsafe CAD collect", isCadUnsafeCollectRail("flutterwave"));
assert("Paysafe is unsafe CAD collect", isCadUnsafeCollectRail("paysafe"));

const ranked = orderCadCollectRails(["nomba", "flutterwave", "interac", "wise", "flovide"]);
assert("least-cost CAD rails start with Interac", ranked[0] === "interac");
assert("Wise before Nomba", ranked.indexOf("wise") < ranked.indexOf("nomba"));
assert("unsafe rails dropped", !ranked.includes("flutterwave") && !ranked.includes("flovide"));
assert("edge ranking matches client", orderCadCollectRailsEdge(["nomba", "interac", "wise"])[0] === "interac");
assert("default CAD collect rail is Interac", defaultCadCollectRail(["nomba", "interac", "wise"]) === "interac");

const methods = orderCadCollectMethods([
  { id: "nomba" },
  { id: "dodo" },
  { id: "interac" },
  { id: "nomba_eft" },
  { id: "wise" },
]);
assert(
  "checkout methods least-cost order",
  methods.map((m) => m.id).join(",") === "interac,wise,nomba_eft,nomba,dodo",
);

assert("auto-pick CAD prefers Interac", defaultCadCollectRail(["nomba", "interac", "wise", "dodo"]) === "interac");
assert("auto-pick CAD falls back to Nomba when Interac off", defaultCadCollectRail(["nomba", "dodo"]) === "nomba");

assert("CAD bank Next is EFT not Interac", cadSendPayInCheckout("bank") === "eft");
assert("CAD Interac Next stays Interac", cadSendPayInCheckout("interac") === "interac");
assert("CAD card Next stays card (Nomba)", cadSendPayInCheckout("card") === "card");

assert("DB funding Interac Autodeposit parks as bank", toDbFundingSource("interac") === "bank");
assert("DB funding Wise parks as bank", toDbFundingSource("wise") === "bank");
assert("DB funding EFT parks as bank", toDbFundingSource("eft") === "bank");
assert("DB funding card stays card", toDbFundingSource("card") === "card");
assert("DB funding prepaid card maps to wallet", toDbFundingSource("card", { prepaidCardAsWallet: true }) === "wallet");
assert("DB funding wallet stays wallet", toDbFundingSource("wallet") === "wallet");
assert("DB funding unknown falls back to wallet", toDbFundingSource("flutterwave") === "wallet");
assert(
  "DB funding never persists Interac",
  ["wallet", "card", "bank"].includes(toDbFundingSource("interac")),
);

if (process.exitCode) {
  console.error("CAD collect checks failed");
  process.exit(1);
}
console.log("CAD collect checks passed");
