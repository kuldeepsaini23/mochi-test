/**
 * Countries Data - Complete World Countries List
 *
 * SOURCE OF TRUTH for country information (ISO codes, names, emoji flags, timezones)
 * Used by CountrySelect component, timezone selection, and anywhere country data is needed.
 *
 * Includes all 195 UN-recognized sovereign states plus commonly used territories.
 * Organized by continent/region for better UX in dropdown menus.
 *
 * TIMEZONE: Each country has a primary IANA timezone identifier.
 * For countries with multiple timezones (US, Russia, Australia), we use the most
 * populous/common timezone as default. Users can change this in settings.
 *
 * SOURCE OF TRUTH KEYWORDS: Countries, Timezones, CountryTimezone, IANATimezone
 */

export interface Country {
  code: string     // ISO 3166-1 alpha-2 code
  name: string     // Official/common country name
  flag: string     // Emoji flag
  timezone: string // Primary IANA timezone identifier
}

export interface CountryGroup {
  continent: string
  items: Country[]
}

/**
 * Complete list of countries organized by continent/region.
 * Each country includes ISO code, name, and emoji flag.
 */
export const countries: CountryGroup[] = [
  {
    continent: 'North America',
    items: [
      { code: 'US', name: 'United States', flag: '🇺🇸', timezone: 'America/New_York' },
      { code: 'CA', name: 'Canada', flag: '🇨🇦', timezone: 'America/Toronto' },
      { code: 'MX', name: 'Mexico', flag: '🇲🇽', timezone: 'America/Mexico_City' },
      { code: 'GT', name: 'Guatemala', flag: '🇬🇹', timezone: 'America/Guatemala' },
      { code: 'BZ', name: 'Belize', flag: '🇧🇿', timezone: 'America/Belize' },
      { code: 'HN', name: 'Honduras', flag: '🇭🇳', timezone: 'America/Tegucigalpa' },
      { code: 'SV', name: 'El Salvador', flag: '🇸🇻', timezone: 'America/El_Salvador' },
      { code: 'NI', name: 'Nicaragua', flag: '🇳🇮', timezone: 'America/Managua' },
      { code: 'CR', name: 'Costa Rica', flag: '🇨🇷', timezone: 'America/Costa_Rica' },
      { code: 'PA', name: 'Panama', flag: '🇵🇦', timezone: 'America/Panama' },
    ],
  },
  {
    continent: 'Caribbean',
    items: [
      { code: 'CU', name: 'Cuba', flag: '🇨🇺', timezone: 'America/Havana' },
      { code: 'JM', name: 'Jamaica', flag: '🇯🇲', timezone: 'America/Jamaica' },
      { code: 'HT', name: 'Haiti', flag: '🇭🇹', timezone: 'America/Port-au-Prince' },
      { code: 'DO', name: 'Dominican Republic', flag: '🇩🇴', timezone: 'America/Santo_Domingo' },
      { code: 'PR', name: 'Puerto Rico', flag: '🇵🇷', timezone: 'America/Puerto_Rico' },
      { code: 'TT', name: 'Trinidad and Tobago', flag: '🇹🇹', timezone: 'America/Port_of_Spain' },
      { code: 'BB', name: 'Barbados', flag: '🇧🇧', timezone: 'America/Barbados' },
      { code: 'BS', name: 'Bahamas', flag: '🇧🇸', timezone: 'America/Nassau' },
      { code: 'LC', name: 'Saint Lucia', flag: '🇱🇨', timezone: 'America/St_Lucia' },
      { code: 'GD', name: 'Grenada', flag: '🇬🇩', timezone: 'America/Grenada' },
      { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '🇻🇨', timezone: 'America/St_Vincent' },
      { code: 'AG', name: 'Antigua and Barbuda', flag: '🇦🇬', timezone: 'America/Antigua' },
      { code: 'DM', name: 'Dominica', flag: '🇩🇲', timezone: 'America/Dominica' },
      { code: 'KN', name: 'Saint Kitts and Nevis', flag: '🇰🇳', timezone: 'America/St_Kitts' },
      { code: 'AW', name: 'Aruba', flag: '🇦🇼', timezone: 'America/Aruba' },
      { code: 'CW', name: 'Curaçao', flag: '🇨🇼', timezone: 'America/Curacao' },
      { code: 'KY', name: 'Cayman Islands', flag: '🇰🇾', timezone: 'America/Cayman' },
      { code: 'VI', name: 'U.S. Virgin Islands', flag: '🇻🇮', timezone: 'America/St_Thomas' },
      { code: 'VG', name: 'British Virgin Islands', flag: '🇻🇬', timezone: 'America/Tortola' },
      { code: 'TC', name: 'Turks and Caicos Islands', flag: '🇹🇨', timezone: 'America/Grand_Turk' },
      { code: 'BM', name: 'Bermuda', flag: '🇧🇲', timezone: 'Atlantic/Bermuda' },
    ],
  },
  {
    continent: 'South America',
    items: [
      { code: 'BR', name: 'Brazil', flag: '🇧🇷', timezone: 'America/Sao_Paulo' },
      { code: 'AR', name: 'Argentina', flag: '🇦🇷', timezone: 'America/Argentina/Buenos_Aires' },
      { code: 'CO', name: 'Colombia', flag: '🇨🇴', timezone: 'America/Bogota' },
      { code: 'PE', name: 'Peru', flag: '🇵🇪', timezone: 'America/Lima' },
      { code: 'VE', name: 'Venezuela', flag: '🇻🇪', timezone: 'America/Caracas' },
      { code: 'CL', name: 'Chile', flag: '🇨🇱', timezone: 'America/Santiago' },
      { code: 'EC', name: 'Ecuador', flag: '🇪🇨', timezone: 'America/Guayaquil' },
      { code: 'BO', name: 'Bolivia', flag: '🇧🇴', timezone: 'America/La_Paz' },
      { code: 'PY', name: 'Paraguay', flag: '🇵🇾', timezone: 'America/Asuncion' },
      { code: 'UY', name: 'Uruguay', flag: '🇺🇾', timezone: 'America/Montevideo' },
      { code: 'GY', name: 'Guyana', flag: '🇬🇾', timezone: 'America/Guyana' },
      { code: 'SR', name: 'Suriname', flag: '🇸🇷', timezone: 'America/Paramaribo' },
      { code: 'GF', name: 'French Guiana', flag: '🇬🇫', timezone: 'America/Cayenne' },
      { code: 'FK', name: 'Falkland Islands', flag: '🇫🇰', timezone: 'Atlantic/Stanley' },
    ],
  },
  {
    continent: 'Western Europe',
    items: [
      { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', timezone: 'Europe/London' },
      { code: 'FR', name: 'France', flag: '🇫🇷', timezone: 'Europe/Paris' },
      { code: 'DE', name: 'Germany', flag: '🇩🇪', timezone: 'Europe/Berlin' },
      { code: 'IT', name: 'Italy', flag: '🇮🇹', timezone: 'Europe/Rome' },
      { code: 'ES', name: 'Spain', flag: '🇪🇸', timezone: 'Europe/Madrid' },
      { code: 'PT', name: 'Portugal', flag: '🇵🇹', timezone: 'Europe/Lisbon' },
      { code: 'NL', name: 'Netherlands', flag: '🇳🇱', timezone: 'Europe/Amsterdam' },
      { code: 'BE', name: 'Belgium', flag: '🇧🇪', timezone: 'Europe/Brussels' },
      { code: 'CH', name: 'Switzerland', flag: '🇨🇭', timezone: 'Europe/Zurich' },
      { code: 'AT', name: 'Austria', flag: '🇦🇹', timezone: 'Europe/Vienna' },
      { code: 'IE', name: 'Ireland', flag: '🇮🇪', timezone: 'Europe/Dublin' },
      { code: 'LU', name: 'Luxembourg', flag: '🇱🇺', timezone: 'Europe/Luxembourg' },
      { code: 'MC', name: 'Monaco', flag: '🇲🇨', timezone: 'Europe/Monaco' },
      { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮', timezone: 'Europe/Vaduz' },
      { code: 'AD', name: 'Andorra', flag: '🇦🇩', timezone: 'Europe/Andorra' },
      { code: 'SM', name: 'San Marino', flag: '🇸🇲', timezone: 'Europe/San_Marino' },
      { code: 'VA', name: 'Vatican City', flag: '🇻🇦', timezone: 'Europe/Vatican' },
      { code: 'MT', name: 'Malta', flag: '🇲🇹', timezone: 'Europe/Malta' },
      { code: 'GI', name: 'Gibraltar', flag: '🇬🇮', timezone: 'Europe/Gibraltar' },
    ],
  },
  {
    continent: 'Northern Europe',
    items: [
      { code: 'SE', name: 'Sweden', flag: '🇸🇪', timezone: 'Europe/Stockholm' },
      { code: 'NO', name: 'Norway', flag: '🇳🇴', timezone: 'Europe/Oslo' },
      { code: 'DK', name: 'Denmark', flag: '🇩🇰', timezone: 'Europe/Copenhagen' },
      { code: 'FI', name: 'Finland', flag: '🇫🇮', timezone: 'Europe/Helsinki' },
      { code: 'IS', name: 'Iceland', flag: '🇮🇸', timezone: 'Atlantic/Reykjavik' },
      { code: 'EE', name: 'Estonia', flag: '🇪🇪', timezone: 'Europe/Tallinn' },
      { code: 'LV', name: 'Latvia', flag: '🇱🇻', timezone: 'Europe/Riga' },
      { code: 'LT', name: 'Lithuania', flag: '🇱🇹', timezone: 'Europe/Vilnius' },
      { code: 'GL', name: 'Greenland', flag: '🇬🇱', timezone: 'America/Nuuk' },
      { code: 'FO', name: 'Faroe Islands', flag: '🇫🇴', timezone: 'Atlantic/Faroe' },
      { code: 'AX', name: 'Åland Islands', flag: '🇦🇽', timezone: 'Europe/Mariehamn' },
    ],
  },
  {
    continent: 'Eastern Europe',
    items: [
      { code: 'RU', name: 'Russia', flag: '🇷🇺', timezone: 'Europe/Moscow' },
      { code: 'PL', name: 'Poland', flag: '🇵🇱', timezone: 'Europe/Warsaw' },
      { code: 'UA', name: 'Ukraine', flag: '🇺🇦', timezone: 'Europe/Kiev' },
      { code: 'CZ', name: 'Czech Republic', flag: '🇨🇿', timezone: 'Europe/Prague' },
      { code: 'RO', name: 'Romania', flag: '🇷🇴', timezone: 'Europe/Bucharest' },
      { code: 'HU', name: 'Hungary', flag: '🇭🇺', timezone: 'Europe/Budapest' },
      { code: 'SK', name: 'Slovakia', flag: '🇸🇰', timezone: 'Europe/Bratislava' },
      { code: 'BG', name: 'Bulgaria', flag: '🇧🇬', timezone: 'Europe/Sofia' },
      { code: 'BY', name: 'Belarus', flag: '🇧🇾', timezone: 'Europe/Minsk' },
      { code: 'MD', name: 'Moldova', flag: '🇲🇩', timezone: 'Europe/Chisinau' },
    ],
  },
  {
    continent: 'Southern Europe & Balkans',
    items: [
      { code: 'GR', name: 'Greece', flag: '🇬🇷', timezone: 'Europe/Athens' },
      { code: 'HR', name: 'Croatia', flag: '🇭🇷', timezone: 'Europe/Zagreb' },
      { code: 'RS', name: 'Serbia', flag: '🇷🇸', timezone: 'Europe/Belgrade' },
      { code: 'SI', name: 'Slovenia', flag: '🇸🇮', timezone: 'Europe/Ljubljana' },
      { code: 'BA', name: 'Bosnia and Herzegovina', flag: '🇧🇦', timezone: 'Europe/Sarajevo' },
      { code: 'ME', name: 'Montenegro', flag: '🇲🇪', timezone: 'Europe/Podgorica' },
      { code: 'MK', name: 'North Macedonia', flag: '🇲🇰', timezone: 'Europe/Skopje' },
      { code: 'AL', name: 'Albania', flag: '🇦🇱', timezone: 'Europe/Tirane' },
      { code: 'XK', name: 'Kosovo', flag: '🇽🇰', timezone: 'Europe/Belgrade' },
      { code: 'CY', name: 'Cyprus', flag: '🇨🇾', timezone: 'Asia/Nicosia' },
    ],
  },
  {
    continent: 'Middle East',
    items: [
      { code: 'TR', name: 'Turkey', flag: '🇹🇷', timezone: 'Europe/Istanbul' },
      { code: 'IL', name: 'Israel', flag: '🇮🇱', timezone: 'Asia/Jerusalem' },
      { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪', timezone: 'Asia/Dubai' },
      { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦', timezone: 'Asia/Riyadh' },
      { code: 'QA', name: 'Qatar', flag: '🇶🇦', timezone: 'Asia/Qatar' },
      { code: 'KW', name: 'Kuwait', flag: '🇰🇼', timezone: 'Asia/Kuwait' },
      { code: 'BH', name: 'Bahrain', flag: '🇧🇭', timezone: 'Asia/Bahrain' },
      { code: 'OM', name: 'Oman', flag: '🇴🇲', timezone: 'Asia/Muscat' },
      { code: 'JO', name: 'Jordan', flag: '🇯🇴', timezone: 'Asia/Amman' },
      { code: 'LB', name: 'Lebanon', flag: '🇱🇧', timezone: 'Asia/Beirut' },
      { code: 'SY', name: 'Syria', flag: '🇸🇾', timezone: 'Asia/Damascus' },
      { code: 'IQ', name: 'Iraq', flag: '🇮🇶', timezone: 'Asia/Baghdad' },
      { code: 'IR', name: 'Iran', flag: '🇮🇷', timezone: 'Asia/Tehran' },
      { code: 'YE', name: 'Yemen', flag: '🇾🇪', timezone: 'Asia/Aden' },
      { code: 'PS', name: 'Palestine', flag: '🇵🇸', timezone: 'Asia/Gaza' },
    ],
  },
  {
    continent: 'Central Asia',
    items: [
      { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿', timezone: 'Asia/Almaty' },
      { code: 'UZ', name: 'Uzbekistan', flag: '🇺🇿', timezone: 'Asia/Tashkent' },
      { code: 'TM', name: 'Turkmenistan', flag: '🇹🇲', timezone: 'Asia/Ashgabat' },
      { code: 'TJ', name: 'Tajikistan', flag: '🇹🇯', timezone: 'Asia/Dushanbe' },
      { code: 'KG', name: 'Kyrgyzstan', flag: '🇰🇬', timezone: 'Asia/Bishkek' },
      { code: 'AF', name: 'Afghanistan', flag: '🇦🇫', timezone: 'Asia/Kabul' },
      { code: 'MN', name: 'Mongolia', flag: '🇲🇳', timezone: 'Asia/Ulaanbaatar' },
      { code: 'GE', name: 'Georgia', flag: '🇬🇪', timezone: 'Asia/Tbilisi' },
      { code: 'AM', name: 'Armenia', flag: '🇦🇲', timezone: 'Asia/Yerevan' },
      { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿', timezone: 'Asia/Baku' },
    ],
  },
  {
    continent: 'South Asia',
    items: [
      { code: 'IN', name: 'India', flag: '🇮🇳', timezone: 'Asia/Kolkata' },
      { code: 'PK', name: 'Pakistan', flag: '🇵🇰', timezone: 'Asia/Karachi' },
      { code: 'BD', name: 'Bangladesh', flag: '🇧🇩', timezone: 'Asia/Dhaka' },
      { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰', timezone: 'Asia/Colombo' },
      { code: 'NP', name: 'Nepal', flag: '🇳🇵', timezone: 'Asia/Kathmandu' },
      { code: 'BT', name: 'Bhutan', flag: '🇧🇹', timezone: 'Asia/Thimphu' },
      { code: 'MV', name: 'Maldives', flag: '🇲🇻', timezone: 'Indian/Maldives' },
    ],
  },
  {
    continent: 'East Asia',
    items: [
      { code: 'CN', name: 'China', flag: '🇨🇳', timezone: 'Asia/Shanghai' },
      { code: 'JP', name: 'Japan', flag: '🇯🇵', timezone: 'Asia/Tokyo' },
      { code: 'KR', name: 'South Korea', flag: '🇰🇷', timezone: 'Asia/Seoul' },
      { code: 'KP', name: 'North Korea', flag: '🇰🇵', timezone: 'Asia/Pyongyang' },
      { code: 'TW', name: 'Taiwan', flag: '🇹🇼', timezone: 'Asia/Taipei' },
      { code: 'HK', name: 'Hong Kong', flag: '🇭🇰', timezone: 'Asia/Hong_Kong' },
      { code: 'MO', name: 'Macau', flag: '🇲🇴', timezone: 'Asia/Macau' },
    ],
  },
  {
    continent: 'Southeast Asia',
    items: [
      { code: 'SG', name: 'Singapore', flag: '🇸🇬', timezone: 'Asia/Singapore' },
      { code: 'MY', name: 'Malaysia', flag: '🇲🇾', timezone: 'Asia/Kuala_Lumpur' },
      { code: 'TH', name: 'Thailand', flag: '🇹🇭', timezone: 'Asia/Bangkok' },
      { code: 'ID', name: 'Indonesia', flag: '🇮🇩', timezone: 'Asia/Jakarta' },
      { code: 'PH', name: 'Philippines', flag: '🇵🇭', timezone: 'Asia/Manila' },
      { code: 'VN', name: 'Vietnam', flag: '🇻🇳', timezone: 'Asia/Ho_Chi_Minh' },
      { code: 'MM', name: 'Myanmar', flag: '🇲🇲', timezone: 'Asia/Yangon' },
      { code: 'KH', name: 'Cambodia', flag: '🇰🇭', timezone: 'Asia/Phnom_Penh' },
      { code: 'LA', name: 'Laos', flag: '🇱🇦', timezone: 'Asia/Vientiane' },
      { code: 'BN', name: 'Brunei', flag: '🇧🇳', timezone: 'Asia/Brunei' },
      { code: 'TL', name: 'Timor-Leste', flag: '🇹🇱', timezone: 'Asia/Dili' },
    ],
  },
  {
    continent: 'North Africa',
    items: [
      { code: 'EG', name: 'Egypt', flag: '🇪🇬', timezone: 'Africa/Cairo' },
      { code: 'MA', name: 'Morocco', flag: '🇲🇦', timezone: 'Africa/Casablanca' },
      { code: 'DZ', name: 'Algeria', flag: '🇩🇿', timezone: 'Africa/Algiers' },
      { code: 'TN', name: 'Tunisia', flag: '🇹🇳', timezone: 'Africa/Tunis' },
      { code: 'LY', name: 'Libya', flag: '🇱🇾', timezone: 'Africa/Tripoli' },
      { code: 'SD', name: 'Sudan', flag: '🇸🇩', timezone: 'Africa/Khartoum' },
      { code: 'SS', name: 'South Sudan', flag: '🇸🇸', timezone: 'Africa/Juba' },
    ],
  },
  {
    continent: 'West Africa',
    items: [
      { code: 'NG', name: 'Nigeria', flag: '🇳🇬', timezone: 'Africa/Lagos' },
      { code: 'GH', name: 'Ghana', flag: '🇬🇭', timezone: 'Africa/Accra' },
      { code: 'SN', name: 'Senegal', flag: '🇸🇳', timezone: 'Africa/Dakar' },
      { code: 'CI', name: "Côte d'Ivoire", flag: '🇨🇮', timezone: 'Africa/Abidjan' },
      { code: 'CM', name: 'Cameroon', flag: '🇨🇲', timezone: 'Africa/Douala' },
      { code: 'ML', name: 'Mali', flag: '🇲🇱', timezone: 'Africa/Bamako' },
      { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫', timezone: 'Africa/Ouagadougou' },
      { code: 'NE', name: 'Niger', flag: '🇳🇪', timezone: 'Africa/Niamey' },
      { code: 'GN', name: 'Guinea', flag: '🇬🇳', timezone: 'Africa/Conakry' },
      { code: 'BJ', name: 'Benin', flag: '🇧🇯', timezone: 'Africa/Porto-Novo' },
      { code: 'TG', name: 'Togo', flag: '🇹🇬', timezone: 'Africa/Lome' },
      { code: 'SL', name: 'Sierra Leone', flag: '🇸🇱', timezone: 'Africa/Freetown' },
      { code: 'LR', name: 'Liberia', flag: '🇱🇷', timezone: 'Africa/Monrovia' },
      { code: 'MR', name: 'Mauritania', flag: '🇲🇷', timezone: 'Africa/Nouakchott' },
      { code: 'GM', name: 'Gambia', flag: '🇬🇲', timezone: 'Africa/Banjul' },
      { code: 'GW', name: 'Guinea-Bissau', flag: '🇬🇼', timezone: 'Africa/Bissau' },
      { code: 'CV', name: 'Cape Verde', flag: '🇨🇻', timezone: 'Atlantic/Cape_Verde' },
      { code: 'ST', name: 'São Tomé and Príncipe', flag: '🇸🇹', timezone: 'Africa/Sao_Tome' },
    ],
  },
  {
    continent: 'East Africa',
    items: [
      { code: 'KE', name: 'Kenya', flag: '🇰🇪', timezone: 'Africa/Nairobi' },
      { code: 'ET', name: 'Ethiopia', flag: '🇪🇹', timezone: 'Africa/Addis_Ababa' },
      { code: 'TZ', name: 'Tanzania', flag: '🇹🇿', timezone: 'Africa/Dar_es_Salaam' },
      { code: 'UG', name: 'Uganda', flag: '🇺🇬', timezone: 'Africa/Kampala' },
      { code: 'RW', name: 'Rwanda', flag: '🇷🇼', timezone: 'Africa/Kigali' },
      { code: 'BI', name: 'Burundi', flag: '🇧🇮', timezone: 'Africa/Bujumbura' },
      { code: 'SO', name: 'Somalia', flag: '🇸🇴', timezone: 'Africa/Mogadishu' },
      { code: 'DJ', name: 'Djibouti', flag: '🇩🇯', timezone: 'Africa/Djibouti' },
      { code: 'ER', name: 'Eritrea', flag: '🇪🇷', timezone: 'Africa/Asmara' },
      { code: 'MU', name: 'Mauritius', flag: '🇲🇺', timezone: 'Indian/Mauritius' },
      { code: 'SC', name: 'Seychelles', flag: '🇸🇨', timezone: 'Indian/Mahe' },
      { code: 'KM', name: 'Comoros', flag: '🇰🇲', timezone: 'Indian/Comoro' },
      { code: 'MG', name: 'Madagascar', flag: '🇲🇬', timezone: 'Indian/Antananarivo' },
      { code: 'RE', name: 'Réunion', flag: '🇷🇪', timezone: 'Indian/Reunion' },
      { code: 'YT', name: 'Mayotte', flag: '🇾🇹', timezone: 'Indian/Mayotte' },
    ],
  },
  {
    continent: 'Central Africa',
    items: [
      { code: 'CD', name: 'Democratic Republic of the Congo', flag: '🇨🇩', timezone: 'Africa/Kinshasa' },
      { code: 'CG', name: 'Republic of the Congo', flag: '🇨🇬', timezone: 'Africa/Brazzaville' },
      { code: 'GA', name: 'Gabon', flag: '🇬🇦', timezone: 'Africa/Libreville' },
      { code: 'GQ', name: 'Equatorial Guinea', flag: '🇬🇶', timezone: 'Africa/Malabo' },
      { code: 'CF', name: 'Central African Republic', flag: '🇨🇫', timezone: 'Africa/Bangui' },
      { code: 'TD', name: 'Chad', flag: '🇹🇩', timezone: 'Africa/Ndjamena' },
      { code: 'AO', name: 'Angola', flag: '🇦🇴', timezone: 'Africa/Luanda' },
    ],
  },
  {
    continent: 'Southern Africa',
    items: [
      { code: 'ZA', name: 'South Africa', flag: '🇿🇦', timezone: 'Africa/Johannesburg' },
      { code: 'ZW', name: 'Zimbabwe', flag: '🇿🇼', timezone: 'Africa/Harare' },
      { code: 'ZM', name: 'Zambia', flag: '🇿🇲', timezone: 'Africa/Lusaka' },
      { code: 'MW', name: 'Malawi', flag: '🇲🇼', timezone: 'Africa/Blantyre' },
      { code: 'MZ', name: 'Mozambique', flag: '🇲🇿', timezone: 'Africa/Maputo' },
      { code: 'BW', name: 'Botswana', flag: '🇧🇼', timezone: 'Africa/Gaborone' },
      { code: 'NA', name: 'Namibia', flag: '🇳🇦', timezone: 'Africa/Windhoek' },
      { code: 'LS', name: 'Lesotho', flag: '🇱🇸', timezone: 'Africa/Maseru' },
      { code: 'SZ', name: 'Eswatini', flag: '🇸🇿', timezone: 'Africa/Mbabane' },
    ],
  },
  {
    continent: 'Australia & New Zealand',
    items: [
      { code: 'AU', name: 'Australia', flag: '🇦🇺', timezone: 'Australia/Sydney' },
      { code: 'NZ', name: 'New Zealand', flag: '🇳🇿', timezone: 'Pacific/Auckland' },
    ],
  },
  {
    continent: 'Pacific Islands',
    items: [
      { code: 'FJ', name: 'Fiji', flag: '🇫🇯', timezone: 'Pacific/Fiji' },
      { code: 'PG', name: 'Papua New Guinea', flag: '🇵🇬', timezone: 'Pacific/Port_Moresby' },
      { code: 'SB', name: 'Solomon Islands', flag: '🇸🇧', timezone: 'Pacific/Guadalcanal' },
      { code: 'VU', name: 'Vanuatu', flag: '🇻🇺', timezone: 'Pacific/Efate' },
      { code: 'NC', name: 'New Caledonia', flag: '🇳🇨', timezone: 'Pacific/Noumea' },
      { code: 'PF', name: 'French Polynesia', flag: '🇵🇫', timezone: 'Pacific/Tahiti' },
      { code: 'WS', name: 'Samoa', flag: '🇼🇸', timezone: 'Pacific/Apia' },
      { code: 'TO', name: 'Tonga', flag: '🇹🇴', timezone: 'Pacific/Tongatapu' },
      { code: 'KI', name: 'Kiribati', flag: '🇰🇮', timezone: 'Pacific/Tarawa' },
      { code: 'FM', name: 'Micronesia', flag: '🇫🇲', timezone: 'Pacific/Pohnpei' },
      { code: 'MH', name: 'Marshall Islands', flag: '🇲🇭', timezone: 'Pacific/Majuro' },
      { code: 'PW', name: 'Palau', flag: '🇵🇼', timezone: 'Pacific/Palau' },
      { code: 'NR', name: 'Nauru', flag: '🇳🇷', timezone: 'Pacific/Nauru' },
      { code: 'TV', name: 'Tuvalu', flag: '🇹🇻', timezone: 'Pacific/Funafuti' },
      { code: 'GU', name: 'Guam', flag: '🇬🇺', timezone: 'Pacific/Guam' },
      { code: 'AS', name: 'American Samoa', flag: '🇦🇸', timezone: 'Pacific/Pago_Pago' },
      { code: 'MP', name: 'Northern Mariana Islands', flag: '🇲🇵', timezone: 'Pacific/Saipan' },
      { code: 'CK', name: 'Cook Islands', flag: '🇨🇰', timezone: 'Pacific/Rarotonga' },
      { code: 'NU', name: 'Niue', flag: '🇳🇺', timezone: 'Pacific/Niue' },
      { code: 'TK', name: 'Tokelau', flag: '🇹🇰', timezone: 'Pacific/Fakaofo' },
      { code: 'WF', name: 'Wallis and Futuna', flag: '🇼🇫', timezone: 'Pacific/Wallis' },
    ],
  },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Flat list of all countries for easy lookup operations.
 * Use this when you need to search across all countries regardless of continent.
 */
export const allCountries: Country[] = countries.flatMap((group) => group.items)

/**
 * Get country by ISO 3166-1 alpha-2 code.
 * @param code - Two-letter country code (e.g., 'US', 'GB')
 * @returns Country object or undefined if not found
 */
export function getCountryByCode(code: string): Country | undefined {
  return allCountries.find((c) => c.code === code)
}

/**
 * Get country flag emoji by ISO code.
 * @param code - Two-letter country code
 * @returns Flag emoji or globe emoji if not found
 */
export function getCountryFlag(code: string): string {
  const country = getCountryByCode(code)
  return country?.flag || '🌍'
}

/**
 * Get country name by ISO code.
 * @param code - Two-letter country code
 * @returns Country name or 'Unknown' if not found
 */
export function getCountryName(code: string): string {
  const country = getCountryByCode(code)
  return country?.name || 'Unknown'
}

/**
 * Search countries by name (case-insensitive partial match).
 * @param query - Search query string
 * @returns Array of matching countries
 */
export function searchCountries(query: string): Country[] {
  const lowerQuery = query.toLowerCase()
  return allCountries.filter((c) => c.name.toLowerCase().includes(lowerQuery))
}
