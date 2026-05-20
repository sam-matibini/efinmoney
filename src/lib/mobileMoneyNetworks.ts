// Flutterwave-supported mobile money countries & networks

export interface MMNetwork {
  value: string; // unique key passed to backend / used as payout_method
  label: string;
}

export interface MMCountry {
  code: string; // ISO-2
  name: string;
  flag: string;
  currency: string;
  dialCode: string;
  networks: MMNetwork[];
}

export const MM_COUNTRIES: MMCountry[] = [
  // Nigeria intentionally omitted: Flutterwave does not support mobile money for NGN.
  { code: "KE", name: "Kenya", flag: "🇰🇪", currency: "KES", dialCode: "+254", networks: [
    { value: "MPS", label: "M-Pesa (Safaricom)" },
  ]},
  { code: "GH", name: "Ghana", flag: "🇬🇭", currency: "GHS", dialCode: "+233", networks: [
    { value: "MTN",        label: "MTN" },
    { value: "VODAFONE",   label: "Vodafone" },
    { value: "AIRTELTIGO", label: "AirtelTigo" },
  ]},
  { code: "UG", name: "Uganda", flag: "🇺🇬", currency: "UGX", dialCode: "+256", networks: [
    { value: "MTN",    label: "MTN" },
    { value: "AIRTEL", label: "Airtel" },
  ]},
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", currency: "TZS", dialCode: "+255", networks: [
    { value: "AIRTEL",   label: "Airtel" },
    { value: "TIGO",     label: "Tigo" },
    { value: "HALOPESA", label: "Halopesa" },
    { value: "VODACOM",  label: "Vodacom" },
  ]},
  { code: "RW", name: "Rwanda", flag: "🇷🇼", currency: "RWF", dialCode: "+250", networks: [
    { value: "MTN",    label: "MTN" },
    { value: "AIRTEL", label: "Airtel" },
  ]},
  { code: "ZM", name: "Zambia", flag: "🇿🇲", currency: "ZMW", dialCode: "+260", networks: [
    { value: "MTN",    label: "MTN MoMo" },
    { value: "AIRTEL", label: "Airtel Money" },
    { value: "ZAMTEL", label: "Zamtel Kwacha" },
  ]},
  { code: "CM", name: "Cameroon", flag: "🇨🇲", currency: "XAF", dialCode: "+237", networks: [
    { value: "MTN",    label: "MTN" },
    { value: "ORANGE", label: "Orange" },
  ]},
  { code: "SN", name: "Senegal", flag: "🇸🇳", currency: "XOF", dialCode: "+221", networks: [
    { value: "ORANGE", label: "Orange" },
    { value: "FREE",   label: "Free (Sonatel)" },
    { value: "WAVE",   label: "Wave" },
  ]},
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", dialCode: "+225", networks: [
    { value: "MTN",    label: "MTN" },
    { value: "ORANGE", label: "Orange" },
    { value: "MOOV",   label: "Moov" },
  ]},
  { code: "BF", name: "Burkina Faso", flag: "🇧🇫", currency: "XOF", dialCode: "+226", networks: [
    { value: "ORANGE", label: "Orange" },
    { value: "MOOV",   label: "Moov" },
  ]},
  { code: "ML", name: "Mali", flag: "🇲🇱", currency: "XOF", dialCode: "+223", networks: [
    { value: "ORANGE", label: "Orange" },
    { value: "MOOV",   label: "Moov" },
  ]},
  { code: "SL", name: "Sierra Leone", flag: "🇸🇱", currency: "SLE", dialCode: "+232", networks: [
    { value: "AFRICELL", label: "Africell" },
  ]},
  { code: "LR", name: "Liberia", flag: "🇱🇷", currency: "LRD", dialCode: "+231", networks: [
    { value: "LONESTAR", label: "Lonestar (MTN)" },
  ]},
  { code: "MW", name: "Malawi", flag: "🇲🇼", currency: "MWK", dialCode: "+265", networks: [
    { value: "AIRTEL", label: "Airtel" },
    { value: "TNM",    label: "TNM" },
  ]},
  { code: "BI", name: "Burundi", flag: "🇧🇮", currency: "BIF", dialCode: "+257", networks: [
    { value: "LUMICASH", label: "Lumicash (Econet)" },
    { value: "ONATEL",   label: "ONATEL" },
  ]},
  { code: "MZ", name: "Mozambique", flag: "🇲🇿", currency: "MZN", dialCode: "+258", networks: [
    { value: "MPS",    label: "M-Pesa (Vodacom)" },
    { value: "EMOLA",  label: "eMola (Movitel)" },
    { value: "MKESH",  label: "mKesh (Tmcel)" },
  ]},
];

export const POPULAR_MM_CODES = ["KE", "GH", "UG", "RW"];

export const findCountry = (code: string) =>
  MM_COUNTRIES.find((c) => c.code === code);
