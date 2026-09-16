export function isSupportedBankStatementAttachment(attachment: { filename?: string; mimeType?: string }): boolean {
  const filename = String(attachment.filename || "").toLowerCase();
  const mimeType = String(attachment.mimeType || "").toLowerCase();
  return /\.(csv|xlsx|xls|xlsm|pdf)$/i.test(filename)
    || mimeType === "application/pdf"
    || mimeType === "text/csv"
    || mimeType === "application/vnd.ms-excel"
    || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    || mimeType === "application/vnd.ms-excel.sheet.macroenabled.12";
}
