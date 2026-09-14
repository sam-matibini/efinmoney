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
assert("parse interac maps to eft", parseNombaCollectRails(["interac"]).join(",") === "eft");
assert("parse etransfer maps to eft", parseNombaCollectRails(["etransfer"]).join(",") === "eft");
assert("parse e-transfer maps to eft", parseNombaCollectRails(["e-transfer"]).join(",") === "eft");
assert("parse card,transfer maps both", parseNombaCollectRails(["card", "transfer"]).join(",") === "card,eft");
assert("payment method error detected", isNombaPaymentMethodError("Invalid allowedPaymentMethods"));
assert("unrelated error not method error", !isNombaPaymentMethodError("The provided email is blocked"));

assert("Nomba ranks before Fincra Autodeposit", cadCollectCostRank("nomba") < cadCollectCostRank("interac"));
assert("Nomba Checkout ranks before Nomba EFT alias", cadCollectCostRank("nomba") < cadCollectCostRank("nomba_eft"));
assert("Flutterwave is unsafe CAD collect", isCadUnsafeCollectRail("flutterwave"));
assert("Paysafe is unsafe CAD collect", isCadUnsafeCollectRail("paysafe"));
assert("Wise is not a CAD collect rail", isCadUnsafeCollectRail("wise"));
assert("Dodo is not a CAD collect rail", isCadUnsafeCollectRail("dodo"));

const ranked = orderCadCollectRails(["nomba", "flutterwave", "interac", "wise", "dodo", "flovide"]);
assert("CAD rails start with Nomba (instant settlement)", ranked[0] === "nomba");
assert("Nomba before Interac Autodeposit", ranked.indexOf("nomba") < ranked.indexOf("interac"));
assert(
  "unsafe rails dropped",
  !ranked.includes("flutterwave") && !ranked.includes("flovide") && !ranked.includes("wise") && !ranked.includes("dodo"),
);
assert("edge ranking matches client", orderCadCollectRailsEdge(["nomba", "interac", "wise"])[0] === "nomba");
assert("default CAD collect rail is Nomba", defaultCadCollectRail(["nomba", "interac", "wise"]) === "nomba");

const methods = orderCadCollectMethods([
  { id: "nomba" },
  { id: "dodo" },
  { id: "interac" },
  { id: "nomba_eft" },
  { id: "wise" },
]);
assert(
  "checkout methods drop Wise and Dodo",
  methods.map((m) => m.id).join(",") === "nomba,nomba_eft,interac",
);

assert("auto-pick CAD prefers Nomba", defaultCadCollectRail(["nomba", "interac", "wise", "dodo"]) === "nomba");
assert("auto-pick CAD falls back to Interac when Nomba off", defaultCadCollectRail(["interac", "dodo"]) === "interac");
assert("auto-pick CAD ignores Wise/Dodo-only lists", defaultCadCollectRail(["wise", "dodo"]) === null);

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
