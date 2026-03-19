/**
 * Currency Constants - Stripe Supported Currencies
 *
 * SOURCE OF TRUTH for currency information (ISO 4217 codes, symbols, names, decimal places).
 * Used by CurrencyProvider, product pricing, payment forms, and all monetary displays.
 *
 * All currencies are stored in lowercase ISO 4217 format to match Stripe's convention.
 * Amount handling: Most currencies use 2 decimal places (cents), but some like JPY use 0.
 *
 * SOURCE OF TRUTH KEYWORDS: Currency, CurrencyInfo, StripesCurrencies, ISO4217, CurrencySymbol
 */

/**
 * Currency information structure
 * Used throughout the application for currency display and formatting
 */
export interface CurrencyInfo {
  /** ISO 4217 lowercase currency code (e.g., 'usd', 'eur', 'gbp') */
  code: string
  /** Currency symbol for display (e.g., '$', '€', '£') */
  symbol: string
  /** Full currency name (e.g., 'US Dollar', 'Euro', 'British Pound') */
  name: string
  /** Number of decimal places (e.g., 2 for USD, 0 for JPY) */
  decimals: number
}

/**
 * Default currency when no Stripe account is connected
 * Organization should connect Stripe to use their account's default currency
 */
export const DEFAULT_CURRENCY = 'usd' as const

/**
 * Comprehensive list of Stripe-supported currencies
 * Reference: https://stripe.com/docs/currencies
 *
 * Includes all major world currencies that Stripe processes.
 * Currencies are organized alphabetically by ISO code.
 */
export const CURRENCIES: Record<string, CurrencyInfo> = {
  // A
  aed: { code: 'aed', symbol: 'د.إ', name: 'United Arab Emirates Dirham', decimals: 2 },
  afn: { code: 'afn', symbol: '؋', name: 'Afghan Afghani', decimals: 2 },
  all: { code: 'all', symbol: 'L', name: 'Albanian Lek', decimals: 2 },
  amd: { code: 'amd', symbol: '֏', name: 'Armenian Dram', decimals: 2 },
  ang: { code: 'ang', symbol: 'ƒ', name: 'Netherlands Antillean Guilder', decimals: 2 },
  aoa: { code: 'aoa', symbol: 'Kz', name: 'Angolan Kwanza', decimals: 2 },
  ars: { code: 'ars', symbol: '$', name: 'Argentine Peso', decimals: 2 },
  aud: { code: 'aud', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  awg: { code: 'awg', symbol: 'ƒ', name: 'Aruban Florin', decimals: 2 },
  azn: { code: 'azn', symbol: '₼', name: 'Azerbaijani Manat', decimals: 2 },

  // B
  bam: { code: 'bam', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark', decimals: 2 },
  bbd: { code: 'bbd', symbol: 'Bds$', name: 'Barbadian Dollar', decimals: 2 },
  bdt: { code: 'bdt', symbol: '৳', name: 'Bangladeshi Taka', decimals: 2 },
  bgn: { code: 'bgn', symbol: 'лв', name: 'Bulgarian Lev', decimals: 2 },
  bhd: { code: 'bhd', symbol: '.د.ب', name: 'Bahraini Dinar', decimals: 3 },
  bif: { code: 'bif', symbol: 'FBu', name: 'Burundian Franc', decimals: 0 },
  bmd: { code: 'bmd', symbol: '$', name: 'Bermudan Dollar', decimals: 2 },
  bnd: { code: 'bnd', symbol: 'B$', name: 'Brunei Dollar', decimals: 2 },
  bob: { code: 'bob', symbol: 'Bs.', name: 'Bolivian Boliviano', decimals: 2 },
  brl: { code: 'brl', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  bsd: { code: 'bsd', symbol: 'B$', name: 'Bahamian Dollar', decimals: 2 },
  bwp: { code: 'bwp', symbol: 'P', name: 'Botswanan Pula', decimals: 2 },
  byn: { code: 'byn', symbol: 'Br', name: 'Belarusian Ruble', decimals: 2 },
  bzd: { code: 'bzd', symbol: 'BZ$', name: 'Belize Dollar', decimals: 2 },

  // C
  cad: { code: 'cad', symbol: 'CA$', name: 'Canadian Dollar', decimals: 2 },
  cdf: { code: 'cdf', symbol: 'FC', name: 'Congolese Franc', decimals: 2 },
  chf: { code: 'chf', symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
  clp: { code: 'clp', symbol: 'CL$', name: 'Chilean Peso', decimals: 0 },
  cny: { code: 'cny', symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  cop: { code: 'cop', symbol: 'CO$', name: 'Colombian Peso', decimals: 2 },
  crc: { code: 'crc', symbol: '₡', name: 'Costa Rican Colón', decimals: 2 },
  cve: { code: 'cve', symbol: '$', name: 'Cape Verdean Escudo', decimals: 2 },
  czk: { code: 'czk', symbol: 'Kč', name: 'Czech Republic Koruna', decimals: 2 },

  // D
  djf: { code: 'djf', symbol: 'Fdj', name: 'Djiboutian Franc', decimals: 0 },
  dkk: { code: 'dkk', symbol: 'kr', name: 'Danish Krone', decimals: 2 },
  dop: { code: 'dop', symbol: 'RD$', name: 'Dominican Peso', decimals: 2 },
  dzd: { code: 'dzd', symbol: 'د.ج', name: 'Algerian Dinar', decimals: 2 },

  // E
  egp: { code: 'egp', symbol: 'E£', name: 'Egyptian Pound', decimals: 2 },
  etb: { code: 'etb', symbol: 'Br', name: 'Ethiopian Birr', decimals: 2 },
  eur: { code: 'eur', symbol: '€', name: 'Euro', decimals: 2 },

  // F
  fjd: { code: 'fjd', symbol: 'FJ$', name: 'Fijian Dollar', decimals: 2 },
  fkp: { code: 'fkp', symbol: '£', name: 'Falkland Islands Pound', decimals: 2 },

  // G
  gbp: { code: 'gbp', symbol: '£', name: 'British Pound Sterling', decimals: 2 },
  gel: { code: 'gel', symbol: '₾', name: 'Georgian Lari', decimals: 2 },
  ghs: { code: 'ghs', symbol: 'GH₵', name: 'Ghanaian Cedi', decimals: 2 },
  gip: { code: 'gip', symbol: '£', name: 'Gibraltar Pound', decimals: 2 },
  gmd: { code: 'gmd', symbol: 'D', name: 'Gambian Dalasi', decimals: 2 },
  gnf: { code: 'gnf', symbol: 'FG', name: 'Guinean Franc', decimals: 0 },
  gtq: { code: 'gtq', symbol: 'Q', name: 'Guatemalan Quetzal', decimals: 2 },
  gyd: { code: 'gyd', symbol: 'GY$', name: 'Guyanese Dollar', decimals: 2 },

  // H
  hkd: { code: 'hkd', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2 },
  hnl: { code: 'hnl', symbol: 'L', name: 'Honduran Lempira', decimals: 2 },
  hrk: { code: 'hrk', symbol: 'kn', name: 'Croatian Kuna', decimals: 2 },
  htg: { code: 'htg', symbol: 'G', name: 'Haitian Gourde', decimals: 2 },
  huf: { code: 'huf', symbol: 'Ft', name: 'Hungarian Forint', decimals: 2 },

  // I
  idr: { code: 'idr', symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 2 },
  ils: { code: 'ils', symbol: '₪', name: 'Israeli New Sheqel', decimals: 2 },
  inr: { code: 'inr', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  isk: { code: 'isk', symbol: 'kr', name: 'Icelandic Króna', decimals: 0 },

  // J
  jmd: { code: 'jmd', symbol: 'J$', name: 'Jamaican Dollar', decimals: 2 },
  jod: { code: 'jod', symbol: 'JD', name: 'Jordanian Dinar', decimals: 3 },
  jpy: { code: 'jpy', symbol: '¥', name: 'Japanese Yen', decimals: 0 },

  // K
  kes: { code: 'kes', symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2 },
  kgs: { code: 'kgs', symbol: 'лв', name: 'Kyrgystani Som', decimals: 2 },
  khr: { code: 'khr', symbol: '៛', name: 'Cambodian Riel', decimals: 2 },
  kmf: { code: 'kmf', symbol: 'CF', name: 'Comorian Franc', decimals: 0 },
  krw: { code: 'krw', symbol: '₩', name: 'South Korean Won', decimals: 0 },
  kwd: { code: 'kwd', symbol: 'KD', name: 'Kuwaiti Dinar', decimals: 3 },
  kyd: { code: 'kyd', symbol: 'CI$', name: 'Cayman Islands Dollar', decimals: 2 },
  kzt: { code: 'kzt', symbol: '₸', name: 'Kazakhstani Tenge', decimals: 2 },

  // L
  lak: { code: 'lak', symbol: '₭', name: 'Laotian Kip', decimals: 2 },
  lbp: { code: 'lbp', symbol: 'L£', name: 'Lebanese Pound', decimals: 2 },
  lkr: { code: 'lkr', symbol: 'Rs', name: 'Sri Lankan Rupee', decimals: 2 },
  lrd: { code: 'lrd', symbol: 'L$', name: 'Liberian Dollar', decimals: 2 },
  lsl: { code: 'lsl', symbol: 'M', name: 'Lesotho Loti', decimals: 2 },

  // M
  mad: { code: 'mad', symbol: 'د.م.', name: 'Moroccan Dirham', decimals: 2 },
  mdl: { code: 'mdl', symbol: 'MDL', name: 'Moldovan Leu', decimals: 2 },
  mga: { code: 'mga', symbol: 'Ar', name: 'Malagasy Ariary', decimals: 0 },
  mkd: { code: 'mkd', symbol: 'ден', name: 'Macedonian Denar', decimals: 2 },
  mmk: { code: 'mmk', symbol: 'K', name: 'Myanma Kyat', decimals: 2 },
  mnt: { code: 'mnt', symbol: '₮', name: 'Mongolian Tugrik', decimals: 2 },
  mop: { code: 'mop', symbol: 'MOP$', name: 'Macanese Pataca', decimals: 2 },
  mro: { code: 'mro', symbol: 'UM', name: 'Mauritanian Ouguiya', decimals: 2 },
  mur: { code: 'mur', symbol: 'Rs', name: 'Mauritian Rupee', decimals: 2 },
  mvr: { code: 'mvr', symbol: 'Rf', name: 'Maldivian Rufiyaa', decimals: 2 },
  mwk: { code: 'mwk', symbol: 'MK', name: 'Malawian Kwacha', decimals: 2 },
  mxn: { code: 'mxn', symbol: 'MX$', name: 'Mexican Peso', decimals: 2 },
  myr: { code: 'myr', symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2 },
  mzn: { code: 'mzn', symbol: 'MT', name: 'Mozambican Metical', decimals: 2 },

  // N
  nad: { code: 'nad', symbol: 'N$', name: 'Namibian Dollar', decimals: 2 },
  ngn: { code: 'ngn', symbol: '₦', name: 'Nigerian Naira', decimals: 2 },
  nio: { code: 'nio', symbol: 'C$', name: 'Nicaraguan Córdoba', decimals: 2 },
  nok: { code: 'nok', symbol: 'kr', name: 'Norwegian Krone', decimals: 2 },
  npr: { code: 'npr', symbol: 'Rs', name: 'Nepalese Rupee', decimals: 2 },
  nzd: { code: 'nzd', symbol: 'NZ$', name: 'New Zealand Dollar', decimals: 2 },

  // O
  omr: { code: 'omr', symbol: 'ر.ع.', name: 'Omani Rial', decimals: 3 },

  // P
  pab: { code: 'pab', symbol: 'B/.', name: 'Panamanian Balboa', decimals: 2 },
  pen: { code: 'pen', symbol: 'S/', name: 'Peruvian Nuevo Sol', decimals: 2 },
  pgk: { code: 'pgk', symbol: 'K', name: 'Papua New Guinean Kina', decimals: 2 },
  php: { code: 'php', symbol: '₱', name: 'Philippine Peso', decimals: 2 },
  pkr: { code: 'pkr', symbol: 'Rs', name: 'Pakistani Rupee', decimals: 2 },
  pln: { code: 'pln', symbol: 'zł', name: 'Polish Zloty', decimals: 2 },
  pyg: { code: 'pyg', symbol: '₲', name: 'Paraguayan Guarani', decimals: 0 },

  // Q
  qar: { code: 'qar', symbol: 'ر.ق', name: 'Qatari Rial', decimals: 2 },

  // R
  ron: { code: 'ron', symbol: 'lei', name: 'Romanian Leu', decimals: 2 },
  rsd: { code: 'rsd', symbol: 'дин.', name: 'Serbian Dinar', decimals: 2 },
  rub: { code: 'rub', symbol: '₽', name: 'Russian Ruble', decimals: 2 },
  rwf: { code: 'rwf', symbol: 'FRw', name: 'Rwandan Franc', decimals: 0 },

  // S
  sar: { code: 'sar', symbol: 'ر.س', name: 'Saudi Riyal', decimals: 2 },
  sbd: { code: 'sbd', symbol: 'SI$', name: 'Solomon Islands Dollar', decimals: 2 },
  scr: { code: 'scr', symbol: 'Rs', name: 'Seychellois Rupee', decimals: 2 },
  sek: { code: 'sek', symbol: 'kr', name: 'Swedish Krona', decimals: 2 },
  sgd: { code: 'sgd', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  shp: { code: 'shp', symbol: '£', name: 'Saint Helena Pound', decimals: 2 },
  sll: { code: 'sll', symbol: 'Le', name: 'Sierra Leonean Leone', decimals: 2 },
  sos: { code: 'sos', symbol: 'Sh', name: 'Somali Shilling', decimals: 2 },
  srd: { code: 'srd', symbol: '$', name: 'Surinamese Dollar', decimals: 2 },
  std: { code: 'std', symbol: 'Db', name: 'São Tomé and Príncipe Dobra', decimals: 2 },
  szl: { code: 'szl', symbol: 'E', name: 'Swazi Lilangeni', decimals: 2 },

  // T
  thb: { code: 'thb', symbol: '฿', name: 'Thai Baht', decimals: 2 },
  tjs: { code: 'tjs', symbol: 'SM', name: 'Tajikistani Somoni', decimals: 2 },
  tnd: { code: 'tnd', symbol: 'د.ت', name: 'Tunisian Dinar', decimals: 3 },
  top: { code: 'top', symbol: 'T$', name: 'Tongan Paʻanga', decimals: 2 },
  try: { code: 'try', symbol: '₺', name: 'Turkish Lira', decimals: 2 },
  ttd: { code: 'ttd', symbol: 'TT$', name: 'Trinidad and Tobago Dollar', decimals: 2 },
  twd: { code: 'twd', symbol: 'NT$', name: 'New Taiwan Dollar', decimals: 2 },
  tzs: { code: 'tzs', symbol: 'TSh', name: 'Tanzanian Shilling', decimals: 2 },

  // U
  uah: { code: 'uah', symbol: '₴', name: 'Ukrainian Hryvnia', decimals: 2 },
  ugx: { code: 'ugx', symbol: 'USh', name: 'Ugandan Shilling', decimals: 0 },
  usd: { code: 'usd', symbol: '$', name: 'US Dollar', decimals: 2 },
  uyu: { code: 'uyu', symbol: '$U', name: 'Uruguayan Peso', decimals: 2 },
  uzs: { code: 'uzs', symbol: "so'm", name: 'Uzbekistan Som', decimals: 2 },

  // V
  vnd: { code: 'vnd', symbol: '₫', name: 'Vietnamese Dong', decimals: 0 },
  vuv: { code: 'vuv', symbol: 'VT', name: 'Vanuatu Vatu', decimals: 0 },

  // W
  wst: { code: 'wst', symbol: 'WS$', name: 'Samoan Tala', decimals: 2 },

  // X
  xaf: { code: 'xaf', symbol: 'FCFA', name: 'CFA Franc BEAC', decimals: 0 },
  xcd: { code: 'xcd', symbol: 'EC$', name: 'East Caribbean Dollar', decimals: 2 },
  xof: { code: 'xof', symbol: 'CFA', name: 'CFA Franc BCEAO', decimals: 0 },
  xpf: { code: 'xpf', symbol: '₣', name: 'CFP Franc', decimals: 0 },

  // Y
  yer: { code: 'yer', symbol: '﷼', name: 'Yemeni Rial', decimals: 2 },

  // Z
  zar: { code: 'zar', symbol: 'R', name: 'South African Rand', decimals: 2 },
  zmw: { code: 'zmw', symbol: 'ZK', name: 'Zambian Kwacha', decimals: 2 },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get currency information by ISO 4217 code.
 * Returns USD info if currency code is not found.
 *
 * @param code - ISO 4217 currency code (case-insensitive)
 * @returns CurrencyInfo object
 */
export function getCurrencyInfo(code: string): CurrencyInfo {
  const normalizedCode = code.toLowerCase()
  return CURRENCIES[normalizedCode] || CURRENCIES[DEFAULT_CURRENCY]
}

/**
 * Get currency symbol for display.
 *
 * @param code - ISO 4217 currency code (case-insensitive)
 * @returns Currency symbol (e.g., '$', '€', '£')
 */
export function getCurrencySymbol(code: string): string {
  return getCurrencyInfo(code).symbol
}

/**
 * Get decimal places for a currency.
 * Important for proper amount formatting (e.g., JPY has 0 decimals).
 *
 * @param code - ISO 4217 currency code (case-insensitive)
 * @returns Number of decimal places (0, 2, or 3)
 */
export function getCurrencyDecimals(code: string): number {
  return getCurrencyInfo(code).decimals
}

/**
 * Check if a currency code is valid and supported.
 *
 * @param code - ISO 4217 currency code to validate
 * @returns true if currency is supported
 */
export function isValidCurrency(code: string): boolean {
  return code.toLowerCase() in CURRENCIES
}

/**
 * DELETED: formatCurrencyAmount
 * Use formatCurrency from '@/lib/utils' instead — single source of truth.
 * All price formatting must go through the global formatCurrency function.
 */

/**
 * Convert a display amount to smallest currency unit (e.g., dollars to cents).
 *
 * @param displayAmount - Amount in display units (e.g., 10.50 for $10.50)
 * @param currencyCode - ISO 4217 currency code
 * @returns Amount in smallest unit (e.g., 1050 cents)
 */
export function toSmallestUnit(displayAmount: number, currencyCode: string): number {
  const decimals = getCurrencyDecimals(currencyCode)
  const multiplier = Math.pow(10, decimals)
  return Math.round(displayAmount * multiplier)
}

/**
 * Convert smallest currency unit to display amount (e.g., cents to dollars).
 *
 * @param smallestUnitAmount - Amount in smallest unit (e.g., 1050 cents)
 * @param currencyCode - ISO 4217 currency code
 * @returns Amount in display units (e.g., 10.50)
 */
export function fromSmallestUnit(smallestUnitAmount: number, currencyCode: string): number {
  const decimals = getCurrencyDecimals(currencyCode)
  const divisor = Math.pow(10, decimals)
  return smallestUnitAmount / divisor
}

/**
 * List of all available currency codes.
 * Useful for dropdowns or validation.
 */
export const CURRENCY_CODES = Object.keys(CURRENCIES) as string[]
