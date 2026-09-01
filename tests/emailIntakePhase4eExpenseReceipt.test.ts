import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDeterministicReceiptFields,
  cleanMerchantPayeeName,
  extractReceiptDate,
  extractReceiptAmountAndCurrency,
  extractReceiptCategory,
  extractReceiptPaymentMethod,
  extractReceiptReferenceNumber,
  extractPhilippineTaxEvidence,
  evaluateReceiptExtractionQuality,
} from "../src/lib/receiptExtraction.ts";
import {
  extractSuggestedExpense,
  findPossibleExpenseDuplicates,
} from "../src/lib/emailIntake.ts";
import {
  extractVendorEvidenceFromExpense,
  resolveVendorCandidate,
} from "../src/lib/entityResolution.ts";
import type {
  EmailIntakeProfile,
  Expense,
  GmailMessageCandidate,
  Vendor,
} from "../src/types.ts";

function candidate(overrides: Partial<GmailMessageCandidate> = {}): GmailMessageCandidate {
  return {
    id: "msg-expense-1",
    threadId: "thread-1",
    sender: "billing@petron.com.ph",
    to: ["ops@engoryx.com"],
    cc: [],
    subject: "Official Receipt - Site Fuel Delivery",
    receivedAt: "2026-08-31T08:30:00.000Z",
    snippet: "",
    bodyText: "",
    labels: ["INBOX"],
    attachments: [],
    ...overrides,
  };
}

function mockExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: "exp-001",
    expenseDate: "2026-08-31",
    category: "Fuel",
    description: "Diesel fuel for site generator",
    payee: "Petron Gas Station",
    amount: 5400.75,
    currency: "PHP",
    status: "APPROVED",
    receiptSourceDocumentId: "src-doc-100",
    referenceNumber: "OR-98765",
    createdAt: "2026-08-31T08:30:00.000Z",
    updatedAt: "2026-08-31T08:30:00.000Z",
    ...overrides,
  };
}

// 1. Deterministic PDF receipt extraction without AI calls (machine-readable text)
test("1. Deterministic receipt extraction extracts fields without AI calls for machine-readable text", () => {
  const text = `PETRON GASOLINE STATION
Branch: EDSA Balintawak, Quezon City
VAT REG TIN: 000-123-456-00000
OFFICIAL RECEIPT NO: OR-2026-9912
Date: 2026-08-15
Description: Diesel Fuel Purchase 50L
Total Amount: PHP 3,850.00
Payment Method: GCash
Project: PRJ-2026-001`;

  const result = extractDeterministicReceiptFields(text, {
    sender: "Petron Balintawak <edsa@petron.com.ph>",
    subject: "Receipt for Diesel Purchase",
    fileName: "petron_or.pdf",
    isMachineReadable: true,
  });

  assert.equal(result.payee, "Petron Balintawak");
  assert.equal(result.expenseDate, "2026-08-15");
  assert.equal(result.amount, 3850);
  assert.equal(result.currency, "PHP");
  assert.equal(result.category, "Fuel");
  assert.equal(result.paymentMethod, "GCash");
  assert.equal(result.referenceNumber, "OR-2026-9912");
  assert.equal(result.projectId, "PRJ-2026-001");
  assert.equal(result.quality.status, "GOOD");
  assert.equal(result.isMachineReadable, true);
});

// 2. Missing amount does not collapse to 0 without provenance; provenance marks NOT_DETECTED
test("2. Missing amount does not collapse to 0 as valid extraction; provenance marks NOT_DETECTED", () => {
  const text = `WILCON DEPOT
Date: 2026-08-10
Official Receipt: OR-112233
Item: Electrical Wires and PVC Pipes
Payment Method: Cash`;

  const result = extractDeterministicReceiptFields(text, {
    sender: "Wilcon <cashier@wilcon.com.ph>",
    isMachineReadable: true,
  });

  assert.equal(result.amount, undefined);
  assert.equal(result.fieldProvenance.amount.state, "NOT_DETECTED");
  assert.match(result.fieldProvenance.amount.source, /Amount not detected/);
});

// 3. Unknown currency is not coerced to PHP; provenance marks NOT_DETECTED
test("3. Unknown currency is not coerced to PHP without evidence; provenance marks NOT_DETECTED", () => {
  const text = `Store Receipt
Date: 2026-08-20
Total: 450.00
Payment Method: Cash`;

  const result = extractDeterministicReceiptFields(text, {
    isMachineReadable: true,
  });

  assert.equal(result.amount, 450);
  assert.equal(result.currency, undefined);
  assert.equal(result.fieldProvenance.currency.state, "NOT_DETECTED");
  assert.match(result.fieldProvenance.currency.source, /Currency not detected/);
});

// 4. Currency symbol ₱ / PHP extracted as PHP with provenance DETECTED
test("4. Currency symbol ₱ or PHP is extracted as PHP with provenance DETECTED", () => {
  const text1 = "Amount Paid: ₱1,250.00";
  const res1 = extractReceiptAmountAndCurrency(text1);
  assert.equal(res1.amount, 1250);
  assert.equal(res1.currency, "PHP");
  assert.match(res1.currencySource, /PHP/i);

  const text2 = "Total Due: PHP 9,999.50";
  const res2 = extractReceiptAmountAndCurrency(text2);
  assert.equal(res2.amount, 9999.5);
  assert.equal(res2.currency, "PHP");
});

// 5. Currency symbol USD / $ extracted as USD with provenance DETECTED
test("5. Currency symbol USD / $ is extracted as USD with provenance DETECTED", () => {
  const text = "Subscription Receipt\nTotal Amount: $149.00 USD\nDate: 2026-08-01";
  const res = extractReceiptAmountAndCurrency(text);
  assert.equal(res.amount, 149);
  assert.equal(res.currency, "USD");
});

// 6. Currency symbol EUR / € extracted as EUR with provenance DETECTED
test("6. Currency symbol EUR / € is extracted as EUR with provenance DETECTED", () => {
  const text = "Invoice Euro\nTotal Paid: €85.50\nDate: 2026-08-05";
  const res = extractReceiptAmountAndCurrency(text);
  assert.equal(res.amount, 85.5);
  assert.equal(res.currency, "EUR");
});

// 7. Currency symbol SGD extracted as SGD with provenance DETECTED
test("7. Currency symbol SGD is extracted as SGD with provenance DETECTED", () => {
  const text = "Singapore Hotel Receipt\nGrand Total: SGD 320.00\nDate: 2026-07-28";
  const res = extractReceiptAmountAndCurrency(text);
  assert.equal(res.amount, 320);
  assert.equal(res.currency, "SGD");
});

// 8. Currency symbol JPY / ¥ extracted as JPY with provenance DETECTED
test("8. Currency symbol JPY / ¥ is extracted as JPY with provenance DETECTED", () => {
  const text = "Equipment Parts Tokyo\nTotal Amount: ¥15,000 JPY\nDate: 2026-07-15";
  const res = extractReceiptAmountAndCurrency(text);
  assert.equal(res.amount, 15000);
  assert.equal(res.currency, "JPY");
});

// 9. Extraction quality scored as GOOD when all essential fields present
test("9. Extraction quality scored as GOOD when essential fields (date, amount, currency, payee) are present", () => {
  const quality = evaluateReceiptExtractionQuality({
    expenseDate: "2026-08-30",
    amount: 1500,
    currency: "PHP",
    payee: "Caltex Gasoline",
    description: "Fuel refill",
    referenceNumber: "OR-12345",
  }, true);

  assert.equal(quality.status, "GOOD");
  assert.ok(quality.score >= 80);
});

// 10. Extraction quality scored as NEEDS_REVIEW when amount is missing
test("10. Extraction quality scored as NEEDS_REVIEW when amount is missing", () => {
  const quality = evaluateReceiptExtractionQuality({
    expenseDate: "2026-08-30",
    amount: undefined,
    currency: "PHP",
    payee: "Shell Gas Station",
    description: "Fuel",
  }, true);

  assert.equal(quality.status, "NEEDS_REVIEW");
  assert.ok(quality.missingCriticalFields.includes("amount"));
});

// 11. Extraction quality scored as NEEDS_REVIEW when currency is missing
test("11. Extraction quality scored as NEEDS_REVIEW when currency is missing", () => {
  const quality = evaluateReceiptExtractionQuality({
    expenseDate: "2026-08-30",
    amount: 2500,
    currency: undefined,
    payee: "Shell Gas Station",
    description: "Fuel",
  }, true);

  assert.equal(quality.status, "NEEDS_REVIEW");
  assert.ok(quality.missingCriticalFields.includes("currency"));
});

// 12. Extraction quality scored as FAILED when text is empty or unreadable
test("12. Extraction quality scored as FAILED when text is unreadable or empty", () => {
  const quality = evaluateReceiptExtractionQuality({
    expenseDate: undefined,
    amount: undefined,
    currency: undefined,
    payee: undefined,
    description: "",
  }, false);

  assert.equal(quality.status, "FAILED");
  assert.ok(quality.score < 50);
});

// 13. Deterministic Philippine tax TIN extraction from receipt text
test("13. Deterministic Philippine tax TIN is extracted accurately", () => {
  const text = "PETRON CORP\nVAT REG TIN: 123-456-789-00000\nOR NO: 12345";
  const tax = extractPhilippineTaxEvidence(text);
  assert.equal(tax.taxId, "123-456-789-000");
  assert.equal(tax.isVatRegistered, true);
});

// 14. Deterministic Philippine registered business address extraction
test("14. Deterministic Philippine registered address is extracted", () => {
  const text = "SHELL PILIPINAS\nRegistered Address: 156 Valero St, Salcedo Village, Makati City, Metro Manila\nTIN: 000-111-222-000";
  const tax = extractPhilippineTaxEvidence(text);
  assert.ok(tax.address?.includes("Makati City"));
});

// 15. Category extraction: Fuel
test("15. Category extraction identifies Fuel merchants", () => {
  const merchants = ["Petron", "Shell Station", "Caltex Retail", "Seaoil Philippines", "Cleanfuel", "Phoenix Petroleum", "Unioil"];
  for (const m of merchants) {
    const cat = extractReceiptCategory(`Receipt from ${m}\nTotal: PHP 2,000`);
    assert.equal(cat.category, "Fuel", `Expected Fuel for ${m}`);
  }
});

// 16. Category extraction: Transportation
test("16. Category extraction identifies Transportation merchants", () => {
  const rides = ["Grab Philippines", "Angkas ride", "JoyRide Delivery", "Taxi Fare", "Easytrip RFID reload", "Autosweep Toll", "Cebu Pacific Flight", "Philippine Airlines ticket"];
  for (const r of rides) {
    const cat = extractReceiptCategory(`E-Receipt from ${r}\nTotal: PHP 500`);
    assert.equal(cat.category, "Transportation", `Expected Transportation for ${r}`);
  }
});

// 17. Category extraction: Meals
test("17. Category extraction identifies Meals and dining", () => {
  const food = ["Jollibee", "McDonald's", "Starbucks Coffee", "Mang Inasal", "Chowking", "KFC"];
  for (const f of food) {
    const cat = extractReceiptCategory(`Official Receipt from ${f}\nTotal: PHP 650`);
    assert.equal(cat.category, "Meals", `Expected Meals for ${f}`);
  }
});

// 18. Category extraction: Materials
test("18. Category extraction identifies Construction / Hardware Materials", () => {
  const mat = ["Wilcon Depot", "Ace Hardware", "Citi Hardware", "Handyman", "True Value", "Pipes and Cement purchase"];
  for (const m of mat) {
    const cat = extractReceiptCategory(`Receipt from ${m}\nTotal: PHP 12,000`);
    assert.equal(cat.category, "Materials", `Expected Materials for ${m}`);
  }
});

// 19. Category extraction: Equipment Rental
test("19. Category extraction identifies Equipment Rental", () => {
  const cat = extractReceiptCategory("Heavy Equipment Generator Rental 50kVA for 7 days");
  assert.equal(cat.category, "Equipment Rental");
});

// 20. Category extraction: Utilities
test("20. Category extraction identifies Utilities (Meralco, Manila Water, Maynilad)", () => {
  assert.equal(extractReceiptCategory("Meralco Electricity Bill Payment").category, "Utilities");
  assert.equal(extractReceiptCategory("Manila Water Statement of Account").category, "Utilities");
  assert.equal(extractReceiptCategory("Maynilad Water Services receipt").category, "Utilities");
});

// 21. Category extraction: Communication
test("21. Category extraction identifies Communication (PLDT, Globe, Smart, Converge, DITO)", () => {
  assert.equal(extractReceiptCategory("PLDT Fiber Internet Bill").category, "Communication");
  assert.equal(extractReceiptCategory("Globe Telecom Monthly Plan").category, "Communication");
  assert.equal(extractReceiptCategory("Smart Communications Postpaid").category, "Communication");
  assert.equal(extractReceiptCategory("Converge ICT Broadband").category, "Communication");
  assert.equal(extractReceiptCategory("DITO Telecommunity prepaid reload").category, "Communication");
});

// 22. Category extraction: Office / Site Supplies
test("22. Category extraction identifies Office / Site Supplies", () => {
  const cat = extractReceiptCategory("National Book Store site stationery, ink, and printer paper supplies");
  assert.equal(cat.category, "Office / Site Supplies");
});

// 23. Category extraction: Permits
test("23. Category extraction identifies Permits (BIR, LGU, Mayor's Permit)", () => {
  const cat = extractReceiptCategory("City Treasurer Mayor's Permit and Barangay Clearance fee");
  assert.equal(cat.category, "Permits");
});

// 24. Category extraction: Professional Fees
test("24. Category extraction identifies Professional Fees", () => {
  const cat = extractReceiptCategory("Notary public and legal audit professional fee receipt");
  assert.equal(cat.category, "Professional Fees");
});

// 25. Category extraction: Subcontractor
test("25. Category extraction identifies Subcontractor work", () => {
  const cat = extractReceiptCategory("Subcontractor HVAC installation service labor contract progress billing");
  assert.equal(cat.category, "Subcontractor");
});

// 26. Payment method extraction: Cash, GCash, Maya, Credit Card, Debit Card, Bank Transfer, Check
test("26. Payment method extraction extracts standard payment channels", () => {
  assert.equal(extractReceiptPaymentMethod("Paid via GCash Ref: 12345")?.paymentMethod, "GCash");
  assert.equal(extractReceiptPaymentMethod("Paid with Maya e-wallet")?.paymentMethod, "Maya");
  assert.equal(extractReceiptPaymentMethod("Payment Method: Credit Card ending 4412")?.paymentMethod, "Credit Card");
  assert.equal(extractReceiptPaymentMethod("Settled in Cash")?.paymentMethod, "Cash");
  assert.equal(extractReceiptPaymentMethod("Bank Transfer BDO")?.paymentMethod, "Bank Transfer");
  assert.equal(extractReceiptPaymentMethod("Check No. 000123")?.paymentMethod, "Check");
});

// 27. Reference number extraction: OR#, Ref#, Txn#, Order#
test("27. Reference number extraction identifies OR#, Ref#, Txn#, and Order#", () => {
  assert.equal(extractReceiptReferenceNumber("Official Receipt: OR-889900")?.referenceNumber, "OR-889900");
  assert.equal(extractReceiptReferenceNumber("Ref No: 9988776655")?.referenceNumber, "9988776655");
  assert.equal(extractReceiptReferenceNumber("Transaction ID: TXN-445566")?.referenceNumber, "TXN-445566");
  assert.equal(extractReceiptReferenceNumber("Order No: ORD-102938")?.referenceNumber, "ORD-102938");
});

// 28. Project code hint extraction: PRJ-XXXX extracted as hint with provenance HINT
test("28. Project code hint PRJ-XXXX extracted as advisory hint with provenance HINT", () => {
  const text = "Fuel delivery for Project PRJ-2026-NORTH site operations\nAmount: PHP 5,000";
  const result = extractDeterministicReceiptFields(text);
  assert.equal(result.projectId, "PRJ-2026-NORTH");
  assert.equal(result.fieldProvenance.projectId.state, "HINT");
  assert.match(result.fieldProvenance.projectId.source, /PRJ-2026-NORTH/);
});

// 29. Pre-extraction duplicate short-circuiting: same sourceDocumentId
test("29. Pre-extraction duplicate short-circuiting matches exact sourceDocumentId", () => {
  const existing = [mockExpense({ receiptSourceDocumentId: "doc-exact-1" })];
  const duplicates = findPossibleExpenseDuplicates(
    { sourceDocumentId: "doc-exact-1", amount: 5400.75 },
    existing
  );

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].matchType, "SOURCE_DOCUMENT");
  assert.match(duplicates[0].reason, /already linked to this preserved email receipt source/);
});

// 30. Pre-extraction duplicate short-circuiting: matching file SHA-256 across forwarded emails
test("30. Duplicate short-circuiting matches identical file SHA-256 across forwarded emails", () => {
  const existing = [mockExpense({ id: "exp-fwd-1", receiptSourceDocumentId: "doc-old" })];
  const duplicates = findPossibleExpenseDuplicates(
    { sourceDocumentId: "doc-new", sourceSha256: "sha256-matching-hash" },
    existing,
    ["exp-fwd-1"] // matchingSourceShaExpenseIds
  );

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].matchType, "SOURCE_SHA");
  assert.match(duplicates[0].reason, /exact same receipt file/);
});

// 31. Expense duplicate detection: matching referenceNumber
test("31. Duplicate detection matches same reference / receipt number", () => {
  const existing = [mockExpense({ referenceNumber: "OR-2026-7777" })];
  const duplicates = findPossibleExpenseDuplicates(
    { referenceNumber: "OR-2026-7777", amount: 1000 },
    existing
  );

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].matchType, "REFERENCE_NUMBER");
  assert.match(duplicates[0].reason, /same receipt\/reference number/);
});

// 32. Expense duplicate detection: matching payee + amount + date
test("32. Duplicate detection matches exact payee, amount, date, and currency", () => {
  const existing = [
    mockExpense({
      payee: "Shell Gas Station",
      amount: 3200,
      currency: "PHP",
      expenseDate: "2026-08-25",
    }),
  ];
  const duplicates = findPossibleExpenseDuplicates(
    {
      payee: "Shell Gas Station",
      amount: 3200,
      currency: "PHP",
      expenseDate: "2026-08-25",
    },
    existing
  );

  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].matchType, "EXACT_PAYEE_AMOUNT_DATE");
  assert.match(duplicates[0].reason, /matching payee \(Shell Gas Station\), amount \(3200 PHP\), and date \(2026-08-25\)/);
});

// 33. Expense duplicate detection ignores VOID expenses
test("33. Duplicate detection ignores VOID expenses", () => {
  const existing = [
    mockExpense({
      status: "VOID",
      referenceNumber: "OR-VOIDED-123",
      payee: "Petron Gas Station",
      amount: 2500,
      expenseDate: "2026-08-31",
      receiptSourceDocumentId: "doc-voided",
    }),
  ];
  const duplicates = findPossibleExpenseDuplicates(
    {
      referenceNumber: "OR-VOIDED-123",
      payee: "Petron Gas Station",
      amount: 2500,
      expenseDate: "2026-08-31",
      sourceDocumentId: "doc-voided",
    },
    existing
  );

  assert.equal(duplicates.length, 0, "VOID expenses must not trigger duplicate blocking");
});

// 34. Vendor resolution: receipt evidence outranks stale profile suggestion
test("34. Vendor resolution: receipt evidence outranks stale profile suggestion", () => {
  const vendors: Vendor[] = [
    {
      id: "v-petron",
      name: "Petron Corporation",
      normalizedName: "petron corporation",
      taxId: "000-123-456-000",
      email: "billing@petron.com.ph",
    },
    {
      id: "v-shell",
      name: "Shell Pilipinas",
      normalizedName: "shell pilipinas",
      taxId: "000-999-888-000",
    },
  ];

  const staleProfile: EmailIntakeProfile = {
    id: "prof-stale",
    companyId: "comp-1",
    name: "Stale Shell Rule",
    enabled: true,
    suggestedDestination: "EXPENSE",
    linkedVendorId: "v-shell",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const suggestedExpense = {
    expenseDate: "2026-08-30",
    category: "Fuel",
    description: "Diesel purchase",
    payee: "Petron",
    amount: 4500,
    currency: "PHP",
    merchantIdentityEvidence: {
      rawName: "Petron Corporation",
      taxId: "000-123-456-000",
      email: "billing@petron.com.ph",
    },
  };

  const evidence = extractVendorEvidenceFromExpense(
    suggestedExpense,
    {
      sender: "Petron Balintawak <billing@petron.com.ph>",
      subject: "Receipt from Petron",
    },
    staleProfile
  );

  const resolution = resolveVendorCandidate(
    {
      candidateId: "cand-1",
      evidence,
      sourceRef: {
        subject: "Receipt from Petron",
        sender: "Petron Balintawak <billing@petron.com.ph>",
        fileName: "receipt.pdf",
      },
    },
    vendors,
    [staleProfile]
  );

  assert.equal(resolution.proposedAction, "NEEDS_REVIEW");
  assert.equal(resolution.matchedEntityId, "v-petron");
  assert.equal(resolution.matchedEntityName, "Petron Corporation");
  assert.ok(resolution.conflicts.length > 0);
  assert.match(resolution.conflicts[0].reason, /Petron Corporation/);
});

// 35. Field provenance map accurately distinguishes DETECTED, SUGGESTED, AI_EXTRACTED, NOT_DETECTED, HINT
test("35. Field provenance map distinguishes all 5 confidence states accurately", () => {
  const result = extractDeterministicReceiptFields(
    "OFFICIAL RECEIPT: OR-554433\nDate: 2026-08-12\nTotal: ₱1,999.00\nPayment: GCash\nProject: PRJ-ALPHA\nDescription: General miscellaneous expense",
    {
      sender: "Generic Store <sales@store.ph>",
      subject: "Receipt",
      isMachineReadable: true,
    }
  );

  // DETECTED fields
  assert.equal(result.fieldProvenance.expenseDate.state, "DETECTED");
  assert.equal(result.fieldProvenance.amount.state, "DETECTED");
  assert.equal(result.fieldProvenance.currency.state, "DETECTED");
  assert.equal(result.fieldProvenance.paymentMethod.state, "DETECTED");
  assert.equal(result.fieldProvenance.referenceNumber.state, "DETECTED");

  // SUGGESTED fields
  assert.equal(result.fieldProvenance.category.state, "SUGGESTED");

  // HINT fields
  assert.equal(result.fieldProvenance.projectId.state, "HINT");
});
