import type { Content, TableCell, TDocumentDefinitions, TVirtualFileSystem } from "pdfmake/interfaces";
import { formatNumber } from "@shared/format";
import { vndInWords } from "@shared/number-words";
import type { CompanySettings, CustomerDetail, InventoryTransactionDetail } from "@shared/types";
import { apiRequest } from "@/lib/api";

/**
 * Phiếu xuất kho bán hàng chỉ dành cho phiếu xuất đã xác nhận, giao cho khách hàng và chưa bị đảo ngược —
 * đúng những phiếu được tính là doanh thu. Xuất cho nhân viên là cấp phát nội bộ, không phải bán hàng.
 */
export function canExportInvoice(document: InventoryTransactionDetail): boolean {
  return (
    document.type === "export" &&
    document.status === "confirmed" &&
    document.customerId !== null &&
    document.reversedBy === null
  );
}

export const invoiceFileName = (document: Pick<InventoryTransactionDetail, "code">) =>
  `phieu-xuat-kho-${document.code}.pdf`;

/** Bút toán bán hàng theo Thông tư 200: Nợ 131 (phải thu khách hàng) / Có 5111 (doanh thu bán hàng hoá). */
const DEBIT_ACCOUNT = "131";
const CREDIT_ACCOUNT = "5111";
/** Số dòng tối thiểu của bảng hàng, các dòng thừa để trống như mẫu phiếu in sẵn. */
const MIN_ROWS = 15;

const INK = "#111111";
const BLUE = "#1d3fbf";
const ORANGE = "#e8590c";

type InvoiceInput = {
  document: InventoryTransactionDetail;
  company: CompanySettings;
  /** null khi khách hàng đã bị xoá: dùng mã/tên lưu trên phiếu. */
  customer: CustomerDetail | null;
  /** Logo dạng data URL PNG/JPEG (pdfmake không đọc được WebP). */
  logo: string | null;
};

const money = (value: number | null) => (value === null ? "" : formatNumber(value));

/** "2026-11-20" → "Ngày 20 tháng 11 năm 2026" */
function longDate(day: string): string {
  const [year, month, date] = day.split("-");
  return `Ngày ${date} tháng ${month} năm ${year}`;
}

/** Bảng 2 cột nhãn / giá trị, không viền, dùng cho khối thông tin người mua và tài khoản. */
function labelTable(rows: [string, string | null | undefined, string?][], labelWidth: number): Content {
  return {
    table: {
      widths: [labelWidth, "*"],
      body: rows.map(([label, value, color]) => [
        { text: `${label}:` },
        { text: value ?? "", color: color ?? INK },
      ]),
    },
    layout: { ...noBorders, paddingTop: () => 1.5, paddingBottom: () => 1.5, paddingLeft: () => 0 },
  };
}

const noBorders = {
  hLineWidth: () => 0,
  vLineWidth: () => 0,
};

/** Tạo nội dung PDF (hàm thuần, không tải thư viện) để dễ kiểm thử và xem trước. */
export function buildInvoiceDefinition({ document, company, customer, logo }: InvoiceInput): TDocumentDefinitions {
  const lines = document.lines.map((line, index) => ({
    index: index + 1,
    sku: line.sku,
    name: line.productName,
    unit: line.unit,
    quantity: Math.abs(line.quantityDelta),
    unitPrice: line.unitPrice,
    amount: line.amount,
  }));
  const total = document.totalAmount;
  const missingPrice = lines.some((line) => line.unitPrice === null);
  const customerName = customer?.name ?? document.recipientName ?? "";
  // Khách doanh nghiệp: "Người mua" là người liên hệ; khách cá nhân thì để trống như mẫu.
  const buyer = customer?.type === "business" ? customer.contactName : null;

  const head = (text: string): TableCell => ({ text, bold: true, alignment: "center" });
  const blank = (): TableCell[] => Array.from({ length: 7 }, () => ({ text: " " }));

  const itemRows: TableCell[][] = lines.map((line) => [
    { text: String(line.index), alignment: "center" },
    { text: line.sku },
    { text: line.name },
    { text: line.unit, alignment: "center" },
    { text: formatNumber(line.quantity), alignment: "right" },
    { text: money(line.unitPrice), alignment: "right" },
    { text: money(line.amount), alignment: "right" },
  ]);
  const padding = Array.from({ length: Math.max(0, MIN_ROWS - itemRows.length) }, blank);

  const span6 = (cell: TableCell): TableCell[] => [{ ...(cell as object), colSpan: 6 } as TableCell, {}, {}, {}, {}, {}];

  const itemTable: Content = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: [26, 60, "*", 44, 46, 60, 74],
      body: [
        [head("STT"), head("Mã hàng"), head("Tên hàng"), head("Đơn vị\ntính"), head("Số lượng"), head("Đơn giá"), head("Thành tiền")],
        ...itemRows,
        ...padding,
        [...span6({ text: "Cộng", bold: true }), { text: formatNumber(total), bold: true, alignment: "right" }],
        [
          ...span6({ text: "Cộng tiền hàng:", alignment: "right", color: ORANGE }),
          { text: formatNumber(total), bold: true, alignment: "right", color: ORANGE },
        ],
        [
          {
            text: `Số tiền viết bằng chữ: ${vndInWords(total, { thousand: "ngàn", even: true })}.`,
            bold: true,
            italics: true,
            colSpan: 7,
          },
          {}, {}, {}, {}, {}, {},
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.8,
      vLineWidth: () => 0.8,
      hLineColor: () => INK,
      vLineColor: () => INK,
      paddingTop: () => 3.5,
      paddingBottom: () => 3.5,
    },
  };

  const signature = (role: string, hint: string): Content => ({
    alignment: "center",
    stack: [
      { text: role, bold: true },
      { text: hint, italics: true },
    ],
  });

  return {
    pageSize: "A4",
    pageMargins: [36, 32, 36, 40],
    info: {
      title: `Phiếu xuất kho bán hàng ${document.code}`,
      author: company.companyName,
      subject: `Phiếu xuất kho bán hàng cho ${customerName}`,
    },
    defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.1 },
    footer: (currentPage, pageCount) =>
      pageCount > 1 ? { text: `Trang ${currentPage}/${pageCount}`, alignment: "right", fontSize: 8, margin: [36, 12, 36, 0] } : null,
    content: [
      {
        columns: [
          ...(logo ? [{ image: logo, fit: [46, 46] as [number, number], width: 54 }] : []),
          {
            width: "*",
            stack: [
              { text: company.companyName, bold: true, fontSize: 10.5 },
              ...(company.address ? [{ text: company.address, color: BLUE, fontSize: 8.5 }] : []),
              ...(company.phone || company.taxCode
                ? [{
                    text: [company.phone ? `Điện thoại: ${company.phone}` : "", company.phone && company.taxCode ? "   ·   " : "", company.taxCode ? `MST: ${company.taxCode}` : ""].join(""),
                    fontSize: 8.5,
                  }]
                : []),
            ],
          },
        ],
        columnGap: 8,
      },
      { text: "PHIẾU XUẤT KHO BÁN HÀNG", bold: true, fontSize: 16, alignment: "center", margin: [0, 10, 0, 3] },
      { text: longDate(document.transactionDate), italics: true, alignment: "center" },
      { text: `Số: ${document.code}`, bold: true, alignment: "center", margin: [0, 2, 0, 10] },
      {
        columns: [
          {
            width: "*",
            stack: [labelTable(
              [
                ["Người mua", buyer],
                ["Tên khách hàng", customerName],
                ["Địa chỉ", customer?.address],
                ["Điện thoại", customer?.phone],
                ["Mã số thuế", customer?.taxCode],
                ["Diễn giải", document.note ?? `Bán hàng ${customerName}`],
                ["Nhân viên bán hàng", null],
              ],
              108,
            )],
          },
          {
            width: 150,
            stack: [labelTable(
              [
                ["Nợ", DEBIT_ACCOUNT, BLUE],
                ["Có", CREDIT_ACCOUNT, BLUE],
                ["Loại tiền", "VND", BLUE],
              ],
              60,
            )],
          },
        ],
        columnGap: 16,
        margin: [0, 0, 0, 12],
      },
      itemTable,
      ...(missingPrice
        ? [{ text: "Một số dòng chưa có đơn giá nên không được tính vào tổng tiền.", fontSize: 8, color: ORANGE, margin: [0, 4, 0, 0] } as Content]
        : []),
      { text: `Số chứng từ gốc kèm theo: ${document.reference ?? ""}`, margin: [0, 6, 0, 0] },
      {
        // unbreakable: khối chữ ký (kèm khoảng trống để ký) không bị cắt sang trang sau.
        unbreakable: true,
        margin: [0, 14, 0, 0],
        stack: [
          {
            columns: [{ text: "" }, { text: "" }, { text: "Ngày ..... tháng ..... năm ........", italics: true, alignment: "center" }],
            margin: [0, 0, 0, 4],
          },
          {
            columns: [
              signature("Người mua hàng", "(Ký, họ tên)"),
              signature("Kế toán trưởng", "(Ký, họ tên)"),
              signature("Giám đốc", "(Ký, họ tên, đóng dấu)"),
            ],
          },
          // Chừa chỗ ký tên, đóng dấu.
          { text: " ", margin: [0, 44, 0, 0] },
        ],
      },
    ],
  };
}


/** pdfmake chỉ đọc PNG/JPEG: logo WebP (hoặc khác) được vẽ lại thành PNG. */
async function logoForPdf(logo: string | null): Promise<string | null> {
  if (!logo) return null;
  if (/^data:image\/(png|jpe?g);base64,/.test(logo)) return logo;
  try {
    const image = new Image();
    image.src = logo;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null; // logo hỏng thì bỏ qua, phiếu vẫn xuất được
  }
}

async function loadPdfMake() {
  // Tải động: ~1,7 MB thư viện + font chỉ được tải khi người dùng bấm in phiếu.
  const [pdfMakeModule, vfsModule] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const pdfMake = (pdfMakeModule as unknown as { default?: typeof pdfMakeModule }).default ?? pdfMakeModule;
  // vfs_fonts là module CommonJS (`module.exports = vfs`); tuỳ bundler nó nằm ở `.default` hoặc chính module.
  const vfs = ((vfsModule as { default?: TVirtualFileSystem }).default ?? vfsModule) as TVirtualFileSystem;
  pdfMake.addVirtualFileSystem(vfs);
  return pdfMake;
}

export async function downloadInvoicePdf(document: InventoryTransactionDetail, company: CompanySettings): Promise<void> {
  if (!canExportInvoice(document)) throw new Error("Chỉ in phiếu cho phiếu xuất đã xác nhận giao cho khách hàng.");
  const [customer, logo, pdfMake] = await Promise.all([
    apiRequest<CustomerDetail>(`/customers/${document.customerId}`).catch(() => null),
    logoForPdf(company.logo),
    loadPdfMake(),
  ]);
  await pdfMake.createPdf(buildInvoiceDefinition({ document, company, customer, logo })).download(invoiceFileName(document));
}
