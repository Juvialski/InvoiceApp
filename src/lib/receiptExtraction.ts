import * as pdfjsLib from "pdfjs-dist";
import type { EmailIntakeProfile } from "../types.ts";
import { EXPENSE_CATEGORIES } from "./expenses.ts";

// Setup PDF.js worker in browser environments
if (typeof window !== "undefined") {
  try {
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
    }
  } catch {
    // Non-blocking fallback
  }
}

export type FieldConfidenceState =
  | "DETECTED"
  | "SUGGESTED"
  | "AI_EXTRACTED"
  | "NOT_DETECTED"
  | "HINT";

export interface FieldProvenance {
  state: FieldConfidenceState;
  source: string;
  rawExtractedValue?: string | number;
}

export interface ExpenseFieldProvenanceMap {
  expenseDate?: FieldProvenance;
  category?: FieldProvenance;
  description?: FieldProvenance;
  payee?: FieldProvenance;
  amount?: FieldProvenance;
  currency?: FieldProvenance;
  paymentMethod?: FieldProvenance;
  referenceNumber?: FieldProvenance;
  projectId?: FieldProvenance;
}

export type ExtractionQualityStatus = "GOOD" | "NEEDS_REVIEW" | "FAILED";

export interface ReceiptExtractionQuality {
  status: ExtractionQualityStatus;
  score: number;
  missingCriticalFields: string[];
  warnings: string[];
  reasons: string[];
}

export interface MerchantIdentityEvidence {
  rawName?: string;
  taxId?: string;
  address?: string;
  email?: string;
  phone?: string;
}

export interface DeterministicReceiptExtractionResult {
  expenseDate?: string;
  category?: string;
  description?: string;
  payee?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  projectId?: string;
  notes?: string;
  isMachineReadable: boolean;
  rawText: string;
  quality: ReceiptExtractionQuality;
  fieldProvenance: ExpenseFieldProvenanceMap;
  merchantIdentityEvidence?: MerchantIdentityEvidence;
}

export interface PdfTextExtractionResult {
  isMachineReadable: boolean;
  text: string;
  pageCount: number;
  errorMessage?: string;
}

/**
 * Extracts plain text locally from a PDF document using pdfjs-dist.
 * Distinguishes machine-readable text PDFs from scanned/image-only PDFs.
 */
export async function extractTextFromPdfReceipt(
  input: ArrayBuffer | Uint8Array,
  fileName = "receipt.pdf"
): Promise<PdfTextExtractionResult> {
  const data = new Uint8Array(input instanceof Uint8Array ? input.slice() : new Uint8Array(input).slice());

  // Validate PDF signature (%PDF-)
  if (
    data.byteLength < 5 ||
    data[0] !== 0x25 ||
    data[1] !== 0x50 ||
    data[2] !== 0x44 ||
    data[3] !== 0x46 ||
    data[4] !== 0x2d
  ) {
    return {
      isMachineReadable: false,
      text: "",
      pageCount: 0,
      errorMessage: `File ${fileName} is not a valid PDF document (missing %PDF signature).`,
    };
  }

  let pdfDoc: pdfjsLib.PDFDocumentProxy;
  try {
    const loadingTask = pdfjsLib.getDocument({
      data,
      isEvalSupported: false,
      useSystemFonts: true,
    });
    pdfDoc = await loadingTask.promise;
  } catch (err: any) {
    return {
      isMachineReadable: false,
      text: "",
      pageCount: 0,
      errorMessage: err?.message || "Could not read PDF receipt.",
    };
  }

  const pageCount = pdfDoc.numPages;
  const lines: string[] = [];
  let totalChars = 0;

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageTextItems: string[] = [];

    for (const item of textContent.items as any[]) {
      const str = String(item.str || "").trim();
      if (str) {
        pageTextItems.push(str);
        totalChars += str.length;
      }
    }
    if (pageTextItems.length > 0) {
      lines.push(pageTextItems.join(" "));
    }
  }

  const combinedText = lines.join("\n").trim();
  const isMachineReadable = totalChars >= 15 && lines.length >= 1;

  return {
    isMachineReadable,
    text: combinedText,
    pageCount,
  };
}

export function cleanMerchantPayeeName(text: string, fallbackSender = ""): { payee?: string; source: string } {
  // 1. Check sender display name if present (e.g. "Petron Gas Station <billing@petron.com.ph>")
  if (fallbackSender) {
    const senderAngle = fallbackSender.match(/^"?([^"<@]+)"?\s*<[^>]+>$/);
    if (senderAngle && senderAngle[1]?.trim()) {
      const name = senderAngle[1].trim();
      if (!/@/.test(name) && name.length > 1) {
        return { payee: name, source: `Derived from sender name: ${name}` };
      }
    }
  }

  // 2. Look for explicit merchant headers in receipt text
  const headerPatterns = [
    /(?:merchant|store|payee|vendor|seller|establishment|company|issued\s+by)\s*[:=-]\s*([A-Za-z0-9\s&.,'-]+?)(?:\s*(?:TIN|VAT|Tel|Phone|Address|Date|OR|Invoice|\n|$))/i,
    /(?:sold\s+by|operated\s+by)\s*[:=-]?\s*([A-Za-z0-9\s&.,'-]+?)(?:\s*(?:TIN|VAT|Tel|\n|$))/i,
    /^([A-Z0-9\s&.,'-]{3,40})(?:\s+(?:INC|CORP|LTD|CO|CORPORATION|INCORPORATED|ENTERPRISES|TRADING|SERVICES|VENTURES|HOLDINGS))\b/im,
  ];

  for (const pattern of headerPatterns) {
    const match = text.match(pattern);
    if (match && match[1]?.trim()) {
      const candidate = match[1].trim();
      if (candidate.length >= 3 && !candidate.includes("@") && !/\b(total|amount|invoice|receipt)\b/i.test(candidate)) {
        return { payee: candidate, source: `Extracted from receipt header: "${candidate}"` };
      }
    }
  }

  // 3. Check for common Philippine merchant headers or brand names
  const knownMerchants: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /\bpetron(?:\s+corporation|\s+gas|\s+station|\s+retail)?\b/i, name: "Petron" },
    { pattern: /\bshell(?:\s+pilipinas|\s+gas|\s+station|\s+retail)?\b/i, name: "Shell" },
    { pattern: /\bcaltex(?:\s+station|\s+philippines)?\b/i, name: "Caltex" },
    { pattern: /\bseaoil(?:\s+philippines)?\b/i, name: "Seaoil" },
    { pattern: /\bcleanfuel\b/i, name: "Cleanfuel" },
    { pattern: /\bphoenix\s+petroleum\b/i, name: "Phoenix Petroleum" },
    { pattern: /\bunioil\b/i, name: "Unioil" },
    { pattern: /\bgrab(?:\s+philippines|\s+taxi|\s+car|\s+express|\s+food)?\b/i, name: "Grab" },
    { pattern: /\bangkas\b/i, name: "Angkas" },
    { pattern: /\bjoyride\b/i, name: "JoyRide" },
    { pattern: /\bwilcon\s+(?:depot|home\s+essentials)\b/i, name: "Wilcon Depot" },
    { pattern: /\bace\s+hardware\b/i, name: "Ace Hardware" },
    { pattern: /\bciti\s+hardware\b/i, name: "Citi Hardware" },
    { pattern: /\bhandyman\b/i, name: "Handyman" },
    { pattern: /\btrue\s+value\b/i, name: "True Value" },
    { pattern: /\bjollibee\b/i, name: "Jollibee" },
    { pattern: /\bmcdonald'?s\b/i, name: "McDonald's" },
    { pattern: /\bstarbucks\b/i, name: "Starbucks" },
    { pattern: /\bmang\s+inasal\b/i, name: "Mang Inasal" },
    { pattern: /\bchowking\b/i, name: "Chowking" },
    { pattern: /\bkfc\b/i, name: "KFC" },
    { pattern: /\bmercury\s+drug\b/i, name: "Mercury Drug" },
    { pattern: /\bwatsons\b/i, name: "Watsons" },
    { pattern: /\bmeralco\b/i, name: "Meralco" },
    { pattern: /\bmanila\s+water\b/i, name: "Manila Water" },
    { pattern: /\bmaynilad\b/i, name: "Maynilad" },
    { pattern: /\bpldt\b/i, name: "PLDT" },
    { pattern: /\bglobe\s+telecom\b|\bglobe\b/i, name: "Globe Telecom" },
    { pattern: /\bsmart\s+communications\b|\bsmart\b/i, name: "Smart Communications" },
    { pattern: /\bconverge\s+ict\b|\bconverge\b/i, name: "Converge ICT" },
    { pattern: /\bdito\s+telecommunity\b|\bdito\b/i, name: "DITO Telecommunity" },
    { pattern: /\bcebu\s+pacific\b/i, name: "Cebu Pacific" },
    { pattern: /\bphilippine\s+airlines\b|\bpal\b/i, name: "Philippine Airlines" },
    { pattern: /\bairasia\b/i, name: "AirAsia" },
    { pattern: /\beasytrip\b/i, name: "Easytrip" },
    { pattern: /\bautosweep\b/i, name: "Autosweep RFID" },
  ];

  for (const km of knownMerchants) {
    if (km.pattern.test(text)) {
      return { payee: km.name, source: `Recognized merchant pattern: ${km.name}` };
    }
  }

  // 4. Fallback to sender email domain
  if (fallbackSender) {
    const emailMatch = fallbackSender.match(/<?([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/);
    if (emailMatch && emailMatch[2]) {
      const domain = emailMatch[2].replace(/\.(com|ph|com\.ph|org|net|io)$/i, "");
      const clean = domain.charAt(0).toUpperCase() + domain.slice(1);
      return { payee: clean, source: `Derived from sender domain: ${emailMatch[2]}` };
    }
    return { payee: fallbackSender.trim(), source: `Raw sender fallback: ${fallbackSender}` };
  }

  return { source: "Payee/merchant not detected" };
}

export function extractReceiptDate(text: string, fallbackDate?: string): { expenseDate?: string; source: string; raw?: string } {
  // ISO date YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = text.match(/\b(20\d{2}[-/](?:0[1-9]|1[0-2])[-/](?:0[1-9]|[12]\d|3[01]))\b/);
  if (isoMatch && isoMatch[1]) {
    const d = isoMatch[1].replaceAll("/", "-");
    return { expenseDate: d, source: `Detected date from receipt: ${d}`, raw: isoMatch[1] };
  }

  // Named month: Jan 15, 2026 or 15 January 2026
  const namedMatch1 = text.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+([0-3]?\d),?\s+(20\d{2})\b/i);
  if (namedMatch1 && namedMatch1[1] && namedMatch1[2] && namedMatch1[3]) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mIdx = months.findIndex((m) => namedMatch1[1]!.toLowerCase().startsWith(m));
    if (mIdx >= 0) {
      const mm = String(mIdx + 1).padStart(2, "0");
      const dd = namedMatch1[2].padStart(2, "0");
      const result = `${namedMatch1[3]}-${mm}-${dd}`;
      return { expenseDate: result, source: `Detected date from receipt: ${result}`, raw: namedMatch1[0] };
    }
  }

  const namedMatch2 = text.match(/\b([0-3]?\d)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?),?\s+(20\d{2})\b/i);
  if (namedMatch2 && namedMatch2[1] && namedMatch2[2] && namedMatch2[3]) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mIdx = months.findIndex((m) => namedMatch2[2]!.toLowerCase().startsWith(m));
    if (mIdx >= 0) {
      const mm = String(mIdx + 1).padStart(2, "0");
      const dd = namedMatch2[1].padStart(2, "0");
      const result = `${namedMatch2[3]}-${mm}-${dd}`;
      return { expenseDate: result, source: `Detected date from receipt: ${result}`, raw: namedMatch2[0] };
    }
  }

  // Slash date MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = text.match(/\b([0-3]?\d)\/([0-3]?\d)\/(20\d{2})\b/);
  if (slashMatch && slashMatch[1] && slashMatch[2] && slashMatch[3]) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    // If p1 > 12, it must be DD/MM/YYYY
    let mm: string;
    let dd: string;
    if (p1 > 12 && p2 <= 12) {
      dd = String(p1).padStart(2, "0");
      mm = String(p2).padStart(2, "0");
    } else {
      mm = String(p1).padStart(2, "0");
      dd = String(p2).padStart(2, "0");
    }
    const result = `${slashMatch[3]}-${mm}-${dd}`;
    return { expenseDate: result, source: `Detected date from receipt: ${result}`, raw: slashMatch[0] };
  }

  if (fallbackDate) {
    const clean = fallbackDate.slice(0, 10);
    return { expenseDate: clean, source: `Inferred from email received date: ${clean}` };
  }

  return { expenseDate: undefined, source: "Date not detected" };
}

export function extractReceiptAmountAndCurrency(text: string): {
  amount?: number;
  currency?: string;
  amountSource: string;
  currencySource: string;
  amountRaw?: string;
  currencyRaw?: string;
} {
  let currency: string | undefined;
  let currencySource = "Currency not detected";
  let currencyRaw: string | undefined;

  // Currency detection
  if (/\b(?:PHP|Php|PhP)\b|₱/i.test(text)) {
    currency = "PHP";
    currencySource = "Detected PHP currency from receipt";
    currencyRaw = "PHP";
  } else if (/\bUSD\b|\$(?!\s*PHP)/i.test(text)) {
    currency = "USD";
    currencySource = "Detected USD currency from receipt";
    currencyRaw = "USD";
  } else if (/\bEUR\b|€/i.test(text)) {
    currency = "EUR";
    currencySource = "Detected EUR currency from receipt";
    currencyRaw = "EUR";
  } else if (/\bSGD\b|S\$/i.test(text)) {
    currency = "SGD";
    currencySource = "Detected SGD currency from receipt";
    currencyRaw = "SGD";
  } else if (/\bJPY\b|¥/i.test(text)) {
    currency = "JPY";
    currencySource = "Detected JPY currency from receipt";
    currencyRaw = "JPY";
  } else if (/\bGBP\b|£/i.test(text)) {
    currency = "GBP";
    currencySource = "Detected GBP currency from receipt";
    currencyRaw = "GBP";
  } else if (/\bCAD\b|C\$/i.test(text)) {
    currency = "CAD";
    currencySource = "Detected CAD currency from receipt";
    currencyRaw = "CAD";
  } else if (/\bAUD\b|A\$/i.test(text)) {
    currency = "AUD";
    currencySource = "Detected AUD currency from receipt";
    currencyRaw = "AUD";
  }

  // Amount detection with prioritized patterns
  const patterns: Array<{ regex: RegExp; label: string }> = [
    {
      regex: /(?:total\s+amount|grand\s+total|total\s+paid|amount\s+paid|total\s+due|net\s+amount|amount\s+tendered|total)\s*[:=]?\s*(?:PHP|₱|USD|\$|EUR|€|SGD|JPY|¥|GBP|£)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?|[0-9]+(?:\.[0-9]{2}))/i,
      label: "total amount header",
    },
    {
      regex: /(?:PHP|₱|USD|\$|EUR|€|SGD|JPY|¥|GBP|£)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/i,
      label: "currency prefix",
    },
    {
      regex: /(?:paid|charge|amount)\s*[:=]?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})|[0-9]+(?:\.[0-9]{2}))/i,
      label: "paid/amount line",
    },
  ];

  let amount: number | undefined;
  let amountSource = "Amount not detected";
  let amountRaw: string | undefined;

  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match && match[1]) {
      const raw = match[1].replaceAll(",", "");
      const val = parseFloat(raw);
      if (Number.isFinite(val) && val > 0) {
        amount = val;
        amountRaw = match[1];
        amountSource = `Detected from receipt ${p.label}: ${val.toFixed(2)}`;
        break;
      }
    }
  }

  return {
    amount,
    currency,
    amountSource,
    currencySource,
    amountRaw,
    currencyRaw,
  };
}

export function extractReceiptCategory(
  text: string,
  profileCategory?: string
): { category: string; source: string; isProfileSuggested: boolean } {
  if (profileCategory && EXPENSE_CATEGORIES.includes(profileCategory)) {
    return {
      category: profileCategory,
      source: `Suggested by saved sender profile: ${profileCategory}`,
      isProfileSuggested: true,
    };
  }

  const lower = text.toLowerCase();
  if (/\b(fuel|gasoline|diesel|petrol|shell|petron|caltex|seaoil|phoenix|unioil|gas station|cleanfuel|fueling|unleaded|premium)\b/i.test(lower)) {
    return { category: "Fuel", source: "Categorized as Fuel from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(grab|uber|taxi|fare|transport|toll|easytrip|autosweep|flight|cebu pacific|airasia|ticket|parking|angkas|joyride|transportation|train|bus)\b/i.test(lower)) {
    return { category: "Transportation", source: "Categorized as Transportation from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(jollibee|mcdonalds|mcdonald'?s|starbucks|restaurant|food|lunch|dinner|breakfast|cafe|catering|meals|dining|snack|chowking|kfc|mang inasal)\b/i.test(lower)) {
    return { category: "Meals", source: "Categorized as Meals from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(cement|sand|gravel|lumber|steel|rebar|pipes|hardware|wilcon|ace hardware|citi hardware|handyman|true value|paint|plywood|materials|aggregates|nails|fixtures)\b/i.test(lower)) {
    return { category: "Materials", source: "Categorized as Materials from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(generator|backhoe|crane|rental|equipment rental|heavy equipment|forklift|scaffolding rental|boom truck)\b/i.test(lower)) {
    return { category: "Equipment Rental", source: "Categorized as Equipment Rental from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(tools|machinery|equipment|power tools|drill|saw|welding machine)\b/i.test(lower)) {
    return { category: "Equipment", source: "Categorized as Equipment from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(meralco|electricity|electric|water|maynilad|manila water|utility|power|electric bill)\b/i.test(lower)) {
    return { category: "Utilities", source: "Categorized as Utilities from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(pldt|globe|smart|dito|converge|telecom|internet|mobile|broadband|communication|load|data promo|sim)\b/i.test(lower)) {
    return { category: "Communication", source: "Categorized as Communication from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(office supplies|site supplies|stationery|paper|ink|printing|supplies|cartridge|pen|folders)\b/i.test(lower)) {
    return { category: "Office / Site Supplies", source: "Categorized as Office / Site Supplies from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(bir|lgu|permit|barangay clearance|mayor's permit|licenses|notary permit|zoning)\b/i.test(lower)) {
    return { category: "Permits", source: "Categorized as Permits from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(legal|notary|professional fee|consulting|audit|architectural|engineering fee|surveyor)\b/i.test(lower)) {
    return { category: "Professional Fees", source: "Categorized as Professional Fees from receipt keywords", isProfileSuggested: false };
  }
  if (/\b(subcontractor|sub-con|installation service|labor contract|subcon|specialist contractor)\b/i.test(lower)) {
    return { category: "Subcontractor", source: "Categorized as Subcontractor from receipt keywords", isProfileSuggested: false };
  }

  return { category: "Miscellaneous", source: "Default fallback category: Miscellaneous", isProfileSuggested: false };
}

export function extractReceiptPaymentMethod(text: string): { paymentMethod?: string; source: string } {
  if (/\bgcash\b/i.test(text)) return { paymentMethod: "GCash", source: "Detected payment method: GCash" };
  if (/\b(?:maya|paymaya)\b/i.test(text)) return { paymentMethod: "Maya", source: "Detected payment method: Maya" };
  if (/\bcredit\s*card\b|\bmastercard\b|\bvisa\b|\bamex\b/i.test(text)) return { paymentMethod: "Credit Card", source: "Detected payment method: Credit Card" };
  if (/\bdebit\s*card\b/i.test(text)) return { paymentMethod: "Debit Card", source: "Detected payment method: Debit Card" };
  if (/\bcash\b/i.test(text)) return { paymentMethod: "Cash", source: "Detected payment method: Cash" };
  if (/\bbank\s*transfer\b|\binstapay\b|\bpesonet\b/i.test(text)) return { paymentMethod: "Bank Transfer", source: "Detected payment method: Bank Transfer" };
  if (/\b(?:cheque|check)\b/i.test(text)) return { paymentMethod: "Check", source: "Detected payment method: Check" };
  return { paymentMethod: undefined, source: "Payment method not detected" };
}

export function extractReceiptReferenceNumber(text: string): { referenceNumber?: string; source: string; raw?: string } {
  const patterns = [
    /\b(?:official\s*receipt|OR)\s*(?:#|no|number)?\s*[:#=]\s*([A-Za-z0-9-]+)\b/i,
    /\b(?:official\s*receipt|OR)\s*#\s*([A-Za-z0-9-]+)\b/i,
    /\breceipt\s*(?:#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\bref(?:erence)?\s*(?:#|no|number)?\s*[:#=]\s*([A-Za-z0-9-]+)\b/i,
    /\bref(?:erence)?\s*#\s*([A-Za-z0-9-]+)\b/i,
    /\btrans(?:action)?\s*(?:id|#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\border\s*(?:id|#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\bbooking\s*(?:id|#|no|number)\s*[:#=]?\s*([A-Za-z0-9-]+)\b/i,
    /\b(?:OR|Ref|Txn|Receipt|GRB)-[0-9A-Za-z-]+\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match ? (match[1] || match[0]) : undefined;
    if (candidate && candidate.length >= 3 && !candidate.includes("@")) {
      const clean = candidate.trim();
      return { referenceNumber: clean, source: `Detected reference/receipt number: ${clean}`, raw: match ? match[0] : clean };
    }
  }

  return { referenceNumber: undefined, source: "Reference number not detected" };
}

export function extractPhilippineTaxEvidence(text: string): { taxId?: string; address?: string; isVatRegistered?: boolean } {
  const tinMatch = text.match(/\b(?:TIN|VAT\s*REG\s*TIN|Tax\s*ID)\s*[:#=]?\s*([0-9]{3}[-\s]?[0-9]{3}[-\s]?[0-9]{3}(?:[-\s]?[0-9]{3,5})?)\b/i);
  let taxId: string | undefined;
  if (tinMatch && tinMatch[1]) {
    const rawDigits = tinMatch[1].replace(/\D/g, "");
    if (rawDigits.length >= 12) {
      taxId = `${rawDigits.slice(0, 3)}-${rawDigits.slice(3, 6)}-${rawDigits.slice(6, 9)}-${rawDigits.slice(9, 12)}`;
    } else if (rawDigits.length >= 9) {
      taxId = `${rawDigits.slice(0, 3)}-${rawDigits.slice(3, 6)}-${rawDigits.slice(6, 9)}`;
    }
  }

  const addrMatch = text.match(/(?:Address|Location|Add|Registered\s*Address)\s*[:=-]\s*([A-Za-z0-9\s,.-]{10,120})(?:\n|TIN|Tel|Phone|Date|$)/i);
  const address = addrMatch && addrMatch[1] ? addrMatch[1].trim() : undefined;

  const isVatRegistered = /\b(?:VAT\s*REG|VAT\s*REGISTERED|VAT-REG)\b/i.test(text);

  return { taxId, address, isVatRegistered };
}

export function evaluateReceiptExtractionQuality(
  fields: {
    expenseDate?: string;
    amount?: number;
    currency?: string;
    payee?: string;
    description?: string;
    referenceNumber?: string;
  },
  isMachineReadable = true
): ReceiptExtractionQuality {
  const missingCriticalFields: string[] = [];
  const warnings: string[] = [];
  let score = 100;

  if (!isMachineReadable) {
    score -= 30;
    warnings.push("Receipt text is scanned or not clearly machine-readable; manual verification strongly advised.");
  }

  if (!fields.expenseDate) {
    missingCriticalFields.push("expenseDate");
    score -= 25;
  }
  if (fields.amount === undefined || fields.amount === null || isNaN(fields.amount) || fields.amount <= 0) {
    missingCriticalFields.push("amount");
    score -= 35;
  }
  if (!fields.currency) {
    missingCriticalFields.push("currency");
    score -= 20;
  }
  if (!fields.payee || fields.payee.trim() === "") {
    missingCriticalFields.push("payee");
    score -= 20;
  }
  if (!fields.referenceNumber) {
    warnings.push("No official receipt (OR#) or transaction reference number detected.");
    score -= 10;
  }

  const finalScore = Math.max(0, Math.min(100, score));

  const reasons: string[] = [];
  if (fields.expenseDate) reasons.push("Date detected");
  if (typeof fields.amount === "number" && fields.amount > 0) reasons.push("Amount detected");
  if (fields.currency) reasons.push(`Currency: ${fields.currency}`);
  if (fields.payee) reasons.push(`Merchant: ${fields.payee}`);
  if (fields.referenceNumber) reasons.push(`Ref/OR#: ${fields.referenceNumber}`);

  let status: ReceiptExtractionQuality["status"] = "GOOD";
  if (finalScore < 50 || missingCriticalFields.length >= 2 || !isMachineReadable && missingCriticalFields.length >= 1) {
    status = "FAILED";
  } else if (finalScore < 80 || missingCriticalFields.length >= 1) {
    status = "NEEDS_REVIEW";
  }

  return {
    status,
    score: finalScore,
    missingCriticalFields,
    warnings,
    reasons,
  };
}

/**
 * Runs full deterministic receipt extraction on the given text and context.
 */
export function extractDeterministicReceiptFields(
  text: string,
  context?: {
    sender?: string;
    subject?: string;
    receivedAt?: string;
    fileName?: string;
    profile?: EmailIntakeProfile;
    isMachineReadable?: boolean;
  }
): DeterministicReceiptExtractionResult {
  const fullText = [
    context?.subject || "",
    context?.sender || "",
    context?.fileName || "",
    text,
  ].filter(Boolean).join("\n");

  const isMachineReadable = context?.isMachineReadable ?? (text.trim().length >= 15);

  const payeeResult = cleanMerchantPayeeName(fullText, context?.sender || "");
  const dateResult = extractReceiptDate(fullText, context?.receivedAt);
  const amountCurrencyResult = extractReceiptAmountAndCurrency(fullText);
  const categoryResult = extractReceiptCategory(fullText, context?.profile?.defaultExpenseCategory);
  const paymentMethodResult = extractReceiptPaymentMethod(fullText);
  const refResult = extractReceiptReferenceNumber(fullText);
  const taxEvidence = extractPhilippineTaxEvidence(fullText);

  const projectCodeMatch = fullText.match(/\b(PRJ-[A-Za-z0-9-]+)\b/i);
  const projectHint = projectCodeMatch ? projectCodeMatch[1] : undefined;

  const payee = payeeResult.payee;
  const expenseDate = dateResult.expenseDate;
  const amount = amountCurrencyResult.amount;
  const currency = amountCurrencyResult.currency;
  const category = categoryResult.category;
  const paymentMethod = paymentMethodResult.paymentMethod;
  const referenceNumber = refResult.referenceNumber;

  const subjectClean = (context?.subject || "").trim();
  const description =
    subjectClean || (payee ? `${category} expense - ${payee}` : `${category} expense`);

  const quality = evaluateReceiptExtractionQuality(
    {
      expenseDate,
      amount,
      currency,
      payee,
      description,
      referenceNumber,
    },
    isMachineReadable
  );

  const fieldProvenance: ExpenseFieldProvenanceMap = {
    expenseDate: {
      state: expenseDate ? (dateResult.raw ? "DETECTED" : "SUGGESTED") : "NOT_DETECTED",
      source: dateResult.source,
      rawExtractedValue: dateResult.raw,
    },
    amount: {
      state: typeof amount === "number" && amount > 0 ? "DETECTED" : "NOT_DETECTED",
      source: amountCurrencyResult.amountSource,
      rawExtractedValue: amountCurrencyResult.amountRaw,
    },
    currency: {
      state: currency ? "DETECTED" : "NOT_DETECTED",
      source: amountCurrencyResult.currencySource,
      rawExtractedValue: amountCurrencyResult.currencyRaw,
    },
    payee: {
      state: payee ? "DETECTED" : "NOT_DETECTED",
      source: payeeResult.source,
      rawExtractedValue: payee,
    },
    category: {
      state: categoryResult.isProfileSuggested || category === "Miscellaneous" ? "SUGGESTED" : "DETECTED",
      source: categoryResult.source,
      rawExtractedValue: category,
    },
    description: {
      state: "SUGGESTED",
      source: "Generated from subject and merchant",
      rawExtractedValue: description,
    },
    paymentMethod: {
      state: paymentMethod ? "DETECTED" : "NOT_DETECTED",
      source: paymentMethodResult.source,
      rawExtractedValue: paymentMethod,
    },
    referenceNumber: {
      state: referenceNumber ? "DETECTED" : "NOT_DETECTED",
      source: refResult.source,
      rawExtractedValue: refResult.raw,
    },
    projectId: {
      state: projectHint ? "HINT" : "NOT_DETECTED",
      source: projectHint
        ? `Found project hint "${projectHint}" (not automatically assigned)`
        : "No project code hint found",
      rawExtractedValue: projectHint,
    },
  };

  const notes = `Staged from Email Intake: ${context?.subject || "Receipt"}${
    context?.sender ? ` from ${context.sender}` : ""
  }`;

  return {
    expenseDate,
    category,
    description,
    payee,
    amount,
    currency,
    paymentMethod,
    referenceNumber,
    projectId: projectHint,
    notes,
    isMachineReadable,
    rawText: text,
    quality,
    fieldProvenance,
    merchantIdentityEvidence: {
      rawName: payee,
      taxId: taxEvidence.taxId,
      address: taxEvidence.address,
      email: context?.sender,
    },
  };
}
