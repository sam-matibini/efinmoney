export const cardBrandClass = (brand?: string | null) => {
  switch ((brand ?? "").toLowerCase()) {
    case "visa":
      return "from-[#1a1f71] to-[#3949ab]";
    case "mastercard":
      return "from-[#eb001b] to-[#f79e1b]";
    case "amex":
    case "american_express":
      return "from-[#2671b8] to-[#1f4e8c]";
    case "discover":
      return "from-[#ff6000] to-[#fda636]";
    default:
      return "from-slate-700 to-slate-900";
  }
};

export const cardBrandLabel = (brand?: string | null) => {
  if (!brand) return "Card";
  const b = brand.toLowerCase();
  if (b === "amex" || b === "american_express") return "Amex";
  return brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
};
