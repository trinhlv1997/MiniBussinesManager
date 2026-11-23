import { addDays, vnDayStartUtc } from "../src/shared/format";
import { toSearchText } from "../src/shared/text";

type Value = string | number | null;

const literal = (value: Value) =>
  value === null ? "NULL" : typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;

const insert = (table: string, columns: string[], rows: Value[][]) =>
  `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n${rows
    .map((row) => `  (${row.map(literal).join(", ")})`)
    .join(",\n")};`;

const EMPLOYEES = [
  ["Nguyễn Văn An", "0903123401", "Giám đốc", "2019-03-01", "active", "12 Lý Thường Kiệt, Hoàn Kiếm, Hà Nội"],
  ["Trần Thị Bích", "0912234502", "Kế toán trưởng", "2020-06-15", "active", "45 Nguyễn Trãi, Thanh Xuân, Hà Nội"],
  ["Lê Hoàng Long", "0987345603", "Trưởng phòng kinh doanh", "2020-09-01", "active", "78 Cầu Giấy, Cầu Giấy, Hà Nội"],
  ["Phạm Thu Hà", "0934456704", "Kinh doanh dự án", "2021-02-22", "active", "23 Trần Duy Hưng, Cầu Giấy, Hà Nội"],
  ["Hoàng Minh Đức", "0978567805", "Thủ kho", "2021-07-05", "active", "156 Giải Phóng, Hai Bà Trưng, Hà Nội"],
  ["Vũ Thị Mai", "0945678906", "Kinh doanh đại lý", "2022-04-11", "active", "9 Kim Mã, Ba Đình, Hà Nội"],
  ["Đặng Quốc Huy", "0966789007", "Nhân viên giao hàng", "2022-11-01", "on_leave", "31 Minh Khai, Hai Bà Trưng, Hà Nội"],
  ["Bùi Ngọc Lan", "0328890108", "Chăm sóc khách hàng", "2023-05-16", "active", "64 Láng Hạ, Đống Đa, Hà Nội"],
  ["Đỗ Thanh Tùng", "0359901209", "Kỹ sư điện", "2023-10-02", "resigned", "17 Tây Sơn, Đống Đa, Hà Nội"],
  ["Ngô Phương Linh", "0862012310", "Kỹ thuật viên bảo hành", "2024-08-19", "active", "102 Hoàng Quốc Việt, Bắc Từ Liêm, Hà Nội"],
] as const;

const CUSTOMERS = [
  ["Công ty Cổ phần Cơ điện Hoàng Gia", "business", "Nguyễn Thị Hằng", "02438251234", "Hà Nội", "0101234561"],
  ["Công ty Cổ phần Xây lắp điện Đại Việt", "business", "Trần Văn Khánh", "02437561122", "Hà Nội", "0102345672"],
  ["Trần Minh Quân", "individual", null, "0901556677", "TP. Hồ Chí Minh", null],
  ["Đại lý Điện máy Tri Thức", "business", "Lê Thị Nga", "02363821456", "Đà Nẵng", "0401345673"],
  ["Lê Thị Hồng", "individual", null, "0913778899", "Hải Phòng", null],
  ["Công ty TNHH Nhà thông minh Minh Long", "business", "Phạm Đức Thắng", "02253746521", "Hải Phòng", "0201456784"],
  ["Siêu thị Điện máy Phú Thịnh", "business", "Võ Thị Thanh", "02743856214", "Bình Dương", "3701567895"],
  ["Phạm Quang Vinh", "individual", null, "0986112233", "Nghệ An", null],
  ["Công ty TNHH Kỹ thuật Điện Sao Mai", "business", "Hồ Văn Tâm", "02838112299", "TP. Hồ Chí Minh", "0312678906"],
  ["Nguyễn Thị Thảo", "individual", null, "0935445566", "Huế", null],
  ["Trường Tiểu học Ánh Dương", "business", "Đinh Thị Yến", "02433551188", "Hà Nội", "0103789017"],
  ["Hoàng Văn Nam", "individual", null, "0977889900", "Thanh Hóa", null],
  ["Công ty Cổ phần Tự động hóa Tân Tiến", "business", "Mai Xuân Trường", "02513822667", "Đồng Nai", "3600890128"],
  ["Vũ Thị Hương", "individual", null, "0348223344", "Nam Định", null],
  ["Khách sạn Biển Xanh", "business", "Tạ Quang Hải", "02583527788", "Khánh Hòa", "4200901239"],
  ["Đỗ Mạnh Cường", "individual", null, "0868667788", "Bắc Ninh", null],
  ["Công ty TNHH Điện máy Thành Công", "business", "Lý Thị Hoa", "02923811245", "Cần Thơ", "1800123450"],
  ["Bùi Thị Dung", "individual", null, "0396554433", "Thái Bình", null],
  ["Cửa hàng Điện nước Bà Tám", "individual", "Nguyễn Thị Tám", "0922334455", "Vũng Tàu", null],
  ["Công ty TNHH Giải pháp Mạng Việt", "business", "Cao Minh Tuấn", "02437831166", "Hà Nội", "0104234561"],
] as const;

/** Lương cơ bản/tháng (VND), cùng thứ tự với EMPLOYEES. */
const BASE_SALARIES = [35_000_000, 22_000_000, 20_000_000, 12_000_000, 10_000_000, 11_000_000, 7_500_000, 8_500_000, 14_000_000, 9_000_000];

/** Mã khách hàng hạng VIP (khách doanh nghiệp mua nhiều trong dữ liệu mẫu). */
const VIP_CUSTOMERS = new Set(["KH0001", "KH0004", "KH0007", "KH0013"]);

const CATEGORIES = [
  ["Thiết bị đóng cắt", "Aptomat, cầu dao, contactor và tủ điện"],
  ["Dây và cáp điện", "Dây điện, cáp mạng và phụ kiện đi dây"],
  ["Đèn LED", "Bóng đèn, đèn âm trần, đèn pha và đèn panel"],
  ["Điện gia dụng", "Quạt, nồi cơm, ấm đun và thiết bị gia đình"],
  ["Thiết bị điện tử", "Thiết bị mạng, camera, bộ lưu điện và phụ kiện"],
] as const;

type DemoProduct = {
  sku: string;
  name: string;
  brand: string;
  specifications: string;
  unit: string;
  cost: number;
  sale: number;
  warranty: number;
};

const item = (
  sku: string,
  name: string,
  brand: string,
  specifications: string,
  unit: string,
  cost: number,
  sale: number,
  warranty: number,
): DemoProduct => ({ sku, name, brand, specifications, unit, cost, sale, warranty });

/** Six products in each category, in category order. Prices are sample figures. */
const PRODUCTS: DemoProduct[] = [
  item("MCB-1P16", "Aptomat MCB 1P 16A", "Schneider Electric", "230V · 6kA · Đường cong C", "Cái", 78000, 105000, 24),
  item("MCB-2P32", "Aptomat MCB 2P 32A", "Schneider Electric", "400V · 6kA · Đường cong C", "Cái", 185000, 245000, 24),
  item("RCBO-2P25", "Cầu dao chống giật RCBO 2P 25A", "Panasonic", "230V · Dòng rò 30mA", "Cái", 420000, 560000, 12),
  item("CTT-3P25", "Contactor 3P 25A", "LS Electric", "Cuộn hút 220V · AC-3", "Cái", 310000, 415000, 12),
  item("MCCB-3P100", "Aptomat khối MCCB 3P 100A", "LS Electric", "415V · 25kA", "Cái", 1150000, 1480000, 12),
  item("TD-12M", "Tủ điện âm tường 12 module", "Panasonic", "IP40 · Vỏ nhựa chống cháy", "Cái", 265000, 360000, 12),

  item("CV-1.5", "Dây điện đơn CV 1,5mm²", "Cadivi", "450/750V · Lõi đồng · 100 mét", "Cuộn", 540000, 640000, 0),
  item("CV-2.5", "Dây điện đơn CV 2,5mm²", "Cadivi", "450/750V · Lõi đồng · 100 mét", "Cuộn", 880000, 1030000, 0),
  item("CVV-2X2.5", "Cáp điện CVV 2x2,5mm²", "Trần Phú", "300/500V · Lõi đồng", "Mét", 28000, 36000, 0),
  item("CAT6-305", "Cáp mạng Cat6 UTP", "CommScope", "23AWG · 305 mét", "Thùng", 1750000, 2150000, 12),
  item("PVC-D20", "Ống luồn dây PVC D20", "Sino", "Dài 2,9 mét · Chống cháy", "Cây", 19000, 27000, 0),
  item("BKD-18", "Băng keo điện 18mm", "3M", "Dài 20 mét · Chịu nhiệt 80°C", "Cuộn", 14000, 22000, 0),

  item("LED-B9", "Bóng LED Bulb 9W", "Rạng Đông", "220V · 6500K · E27", "Cái", 32000, 49000, 24),
  item("LED-AT9", "Đèn LED âm trần 9W", "Rạng Đông", "220V · 4000K · Lỗ khoét 110mm", "Chiếc", 69000, 105000, 24),
  item("LED-T8-18", "Đèn tuýp LED T8 18W", "Điện Quang", "220V · 6500K · Dài 1,2 mét", "Cái", 45000, 72000, 24),
  item("LED-FL50", "Đèn pha LED 50W", "Philips", "220V · 6500K · IP65", "Chiếc", 390000, 540000, 24),
  item("LED-PN40", "Đèn LED panel 600x600 40W", "Philips", "220V · 4000K", "Chiếc", 520000, 720000, 24),
  item("LED-SL100", "Đèn năng lượng mặt trời 100W", "Điện Quang", "Pin LiFePO4 · IP65", "Chiếc", 640000, 890000, 12),

  item("GD-QD55", "Quạt đứng 5 cánh", "Panasonic", "220V · 55W · 3 tốc độ", "Chiếc", 1450000, 1890000, 12),
  item("GD-NC18", "Nồi cơm điện 1,8 lít", "Sunhouse", "220V · 700W", "Chiếc", 620000, 850000, 12),
  item("GD-AST17", "Ấm siêu tốc 1,7 lít", "Philips", "220V · 2200W", "Chiếc", 540000, 720000, 24),
  item("GD-LKK48", "Máy lọc không khí", "Xiaomi", "38W · Phòng đến 48m²", "Chiếc", 2650000, 3390000, 12),
  item("GD-BT20", "Bếp từ đơn", "Sunhouse", "220V · 2000W", "Chiếc", 780000, 1050000, 12),
  item("GD-MS18", "Máy sấy tóc 1800W", "Panasonic", "220V · 3 mức nhiệt", "Chiếc", 390000, 540000, 12),

  item("NET-AX3000", "Bộ phát Wi-Fi 6 AX3000", "TP-Link", "2 băng tần · 4 ăng-ten", "Chiếc", 1150000, 1490000, 36),
  item("CAM-2MP", "Camera IP Wi-Fi 2MP", "Hikvision", "1080p · Hồng ngoại 30 mét", "Chiếc", 520000, 720000, 24),
  item("UPS-1000", "Bộ lưu điện UPS 1000VA", "Santak", "600W · 220V", "Bộ", 1950000, 2450000, 24),
  item("NET-SW8", "Switch mạng 8 cổng Gigabit", "TP-Link", "10/100/1000 Mbps", "Chiếc", 340000, 450000, 24),
  item("IOT-PLUG16", "Ổ cắm thông minh Wi-Fi 16A", "TP-Link", "220V · 3680W · Đo điện năng", "Cái", 190000, 290000, 12),
  item("SAC-65W", "Sạc nhanh USB-C 65W", "Baseus", "GaN · 2 cổng USB-C", "Cái", 420000, 620000, 18),
];

const NEVER_STOCKED = new Set([5, 17]);
const SOLD_OUT = new Set([11, 23]);
const RUNNING_LOW = new Set([3, 9, 15, 21, 27]);

/** Expensive equipment is stocked in smaller quantities than cheap accessories. */
function importedQuantity(index: number) {
  const base = 40 + ((index * 7) % 60);
  const cost = PRODUCTS[index]!.cost;
  if (cost >= 1_000_000) return Math.floor(base / 4);
  return cost >= 300_000 ? Math.floor(base / 2) : base;
}

const exportedQuantity = (index: number) =>
  SOLD_OUT.has(index) ? importedQuantity(index) : Math.floor(importedQuantity(index) / 4);

function minStockOf(index: number) {
  if (NEVER_STOCKED.has(index)) return 10;
  const imported = importedQuantity(index);
  return RUNNING_LOW.has(index) ? Math.ceil(imported * 0.8) : Math.floor(imported * 0.15);
}

type Line = [productIndex: number, delta: number, price: number | null];
type Document = {
  type: "import" | "export" | "adjust" | "reversal";
  daysAgo: number;
  reference?: string;
  customerId?: number;
  employeeId?: number;
  reason?: string;
  reversalOf?: number;
  draft?: boolean;
  lines: Line[];
};

const cost = (index: number) => PRODUCTS[index]!.cost;
const sale = (index: number) => PRODUCTS[index]!.sale;
const productIndexes = PRODUCTS.map((_, index) => index);

function buildDocuments(): Document[] {
  const imports: Document[] = CATEGORIES.map((category, categoryIndex) => ({
    type: "import",
    daysAgo: 85 - categoryIndex * 5,
    reference: `Nhập đầu kỳ: ${category[0]}`,
    lines: productIndexes
      .filter((index) => Math.floor(index / 6) === categoryIndex && !NEVER_STOCKED.has(index))
      .map((index): Line => [index, importedQuantity(index), cost(index)]),
  }));

  const stocked = productIndexes.filter((index) => !NEVER_STOCKED.has(index));
  const exports: Document[] = Array.from({ length: 8 }, (_, group) => ({
    type: "export",
    daysAgo: 58 - group * 5,
    customerId: group * 2 + 1,
    reference: `DH-${String(group + 1).padStart(4, "0")}`,
    lines: stocked
      .filter((index) => index % 8 === group)
      .map((index): Line => [index, -exportedQuantity(index), sale(index)]),
  }));

  // Exports come after the five imports, so the first of the next group is document 14.
  const later: Document[] = [
    { type: "import", daysAgo: 20, reference: "Bổ sung aptomat cho công trình", lines: [[0, 20, cost(0)], [1, 15, cost(1)]] },
    { type: "export", daysAgo: 15, customerId: 2, reference: "DH-0009", lines: [[0, -5, sale(0)], [1, -4, sale(1)]] },
    { type: "adjust", daysAgo: 10, reason: "Kiểm kê định kỳ", lines: [[6, -2, null], [7, 3, null]] },
    { type: "export", daysAgo: 7, employeeId: 10, reference: "Xuất dùng cho bảo hành", lines: [[12, -3, sale(12)]] },
    { type: "reversal", daysAgo: 6, reason: "Xuất nhầm mã đèn", reversalOf: 17, lines: [[12, 3, sale(12)]] },
    { type: "export", daysAgo: 3, customerId: 9, reference: "DH-0010", lines: [[13, -4, sale(13)]] },
    { type: "import", daysAgo: 0, reference: "Đơn đặt hàng đang về", draft: true, lines: [[5, 30, cost(5)], [17, 12, cost(17)]] },
  ];
  return [...imports, ...exports, ...later];
}

const PREFIX = { import: "PN", export: "PX", adjust: "DC", reversal: "DN" };

/** Every row uses a fixed id. The caller only runs this on an empty database. */
export function buildDemoSql(today: string): string {
  const pad = (value: number, size = 4) => String(value).padStart(size, "0");
  const statements = [
    insert(
      "employees",
      ["id", "code", "full_name", "phone", "email", "position", "hire_date", "status", "address", "base_salary", "search_text"],
      EMPLOYEES.map(([name, phone, position, hireDate, status, address], index) => {
        const code = `NV${pad(index + 1)}`;
        const email = `nv${pad(index + 1)}@anphat.example`;
        return [index + 1, code, name, phone, email, position, hireDate, status, address, BASE_SALARIES[index] ?? null, toSearchText(code, name, phone, email, position, address)];
      }),
    ),
    insert(
      "customers",
      ["id", "code", "name", "type", "tier", "contact_name", "phone", "email", "address", "tax_code", "search_text", "created_at", "updated_at"],
      CUSTOMERS.map(([name, type, contact, phone, address, taxCode], index) => {
        const code = `KH${pad(index + 1)}`;
        const email = `kh${pad(index + 1)}@khachhang.example`;
        const createdAt = vnDayStartUtc(addDays(today, -(80 - index * 4)));
        const tier = VIP_CUSTOMERS.has(code) ? "vip" : "normal";
        return [index + 1, code, name, type, tier, contact, phone, email, address, taxCode, toSearchText(code, name, contact, phone, email, taxCode, address), createdAt, createdAt];
      }),
    ),
    insert(
      "customer_notes",
      ["customer_id", "content"],
      [
        [1, "Yêu cầu chứng từ CO, CQ khi giao thiết bị đóng cắt cho công trình."],
        [1, "Thanh toán chuyển khoản trong vòng 15 ngày."],
        [4, "Đại lý cấp 2, xuất hóa đơn theo từng đợt giao hàng."],
      ],
    ),
    insert(
      "product_categories",
      ["id", "code", "name", "description"],
      CATEGORIES.map(([name, description], index) => [index + 1, `DM${pad(index + 1, 2)}`, name, description]),
    ),
    insert(
      "products",
      ["id", "sku", "name", "category_id", "brand", "specifications", "warranty_months", "unit", "cost_price", "sale_price", "min_stock", "search_text"],
      PRODUCTS.map((product, index) => [
        index + 1,
        product.sku,
        product.name,
        Math.floor(index / 6) + 1,
        product.brand,
        product.specifications,
        product.warranty,
        product.unit,
        product.cost,
        product.sale,
        minStockOf(index),
        toSearchText(product.sku, product.name, product.brand, product.specifications),
      ]),
    ),
  ];

  buildDocuments().forEach((document, index) => {
    const id = index + 1;
    const date = addDays(today, -document.daysAgo);
    statements.push(
      insert(
        "inventory_transactions",
        ["id", "code", "type", "transaction_date", "reference", "customer_id", "employee_id", "reason", "reversal_of_id"],
        [[id, `${PREFIX[document.type]}-${pad(id, 6)}`, document.type, date, document.reference ?? null, document.customerId ?? null, document.employeeId ?? null, document.reason ?? null, document.reversalOf ?? null]],
      ),
      insert(
        "inventory_transaction_items",
        ["transaction_id", "product_id", "quantity_delta", "unit_price", "unit_cost"],
        document.lines.map(([productIndex, delta, price]) => [
          id,
          productIndex + 1,
          delta,
          price,
          document.type === "export" ? cost(productIndex) : null,
        ]),
      ),
    );
    if (!document.draft) {
      const confirmedAt = `${vnDayStartUtc(date).slice(0, 11)}03:00:00.000Z`;
      statements.push(
        `UPDATE inventory_transactions SET status = 'confirmed', confirmed_at = ${literal(confirmedAt)} WHERE id = ${id};`,
      );
    }
  });
  return statements.join("\n");
}
