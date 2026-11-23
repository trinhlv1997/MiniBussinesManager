# Mini Business Manager

Phần mềm quản lý nội bộ cho công ty nhỏ khoảng 10 nhân viên, chạy trên Cloudflare Workers và D1. Giao diện hoàn toàn bằng tiếng Việt, chỉ có một tài khoản quản trị.

Các module: Tổng quan, Nhân viên, Khách hàng, Sản phẩm, Quản lý kho, Báo cáo, Cài đặt.

## Chạy trên máy

Cần Node.js 22 trở lên.

```bash
npm install
npm run setup   # tạo .dev.vars, chạy migration, tạo tài khoản và dữ liệu demo
npm run dev
```

Tài khoản demo chỉ dành cho phát triển: `admin` / `admin`. Lệnh tạo tài khoản production từ chối mật khẩu này và yêu cầu mật khẩu từ 12 ký tự.

Dữ liệu demo mô phỏng một công ty thiết bị điện và điện tử, gồm 1 công ty, 10 nhân viên, 20 khách hàng, 5 danh mục, 30 sản phẩm và 20 phiếu kho. Tên thương hiệu và giá chỉ là dữ liệu mẫu. Chạy lại `npm run db:seed:local` là an toàn: dữ liệu đã có được giữ nguyên.

## Lệnh thường dùng

| Lệnh | Tác dụng |
| --- | --- |
| `npm run dev` | Chạy frontend và Worker cùng lúc |
| `npm run check` | TypeScript, lint, test và production build |
| `npm test` | Unit test và integration test trên runtime Workers |
| `npm run preview` | Build rồi chạy bản production tại http://localhost:8787 |
| `npm run db:generate` | Sinh migration sau khi sửa `src/db/schema.ts` |
| `npm run db:migrate:local` | Áp dụng migration vào database cục bộ |
| `npm run db:seed:local` | Tạo tài khoản demo và dữ liệu demo nếu database còn trống |
| `npm run db:reset:local` | **Xóa database cục bộ** rồi tạo lại từ đầu |

## Cấu trúc

```text
src/client   Giao diện React: pages, features, components, hooks, lib
src/worker   API Hono: routes, services, middleware, lib
src/db       Schema Drizzle và kết nối D1
src/shared   Kiểu dữ liệu, nhãn tiếng Việt, định dạng và validation dùng chung
migrations   Migration SQL, gồm các trigger bảo vệ tồn kho
scripts      Thiết lập cục bộ, dữ liệu demo, tài khoản quản trị, phục hồi
tests        Test chạy trên runtime Workers
```

**Lưu ý khi sinh migration:** nếu thay đổi schema cần thêm ràng buộc `CHECK` vào bảng đã có (ví dụ `customers`, `employees`), `drizzle-kit generate` sẽ sinh migration dựng lại bảng bằng `DROP TABLE`. Trên D1, `PRAGMA foreign_keys=OFF` không có tác dụng, nên việc này có thể xoá dây chuyền dữ liệu ở bảng con (như `customer_notes`). Hãy đọc kỹ file SQL vừa sinh và thay bằng `ALTER TABLE ... ADD COLUMN` kèm `CHECK` ở mức cột, như `migrations/0007_customer_tier_employee_salary.sql`.

## API

Mọi phản hồi có dạng `{ "success": true, "data": ... }` hoặc `{ "success": false, "error": { "code", "message", "fields" } }`. Danh sách nhận `page`, `pageSize`, `search`, `sort`, `dir` và trả về `items`, `pagination`.

| Nhóm | Đường dẫn |
| --- | --- |
| Xác thực | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Nhân viên | `/api/employees`, `/api/employees/:id`, `/api/employees/export` |
| Khách hàng | `/api/customers`, `/api/customers/:id`, `/api/customers/:id/notes`, `/api/customers/export` |
| Sản phẩm | `/api/products`, `/api/products/:id`, `/api/products/export`, `/api/product-categories` |
| Kho | `/api/inventory/balances`, `/api/inventory/transactions`, `POST /api/inventory/import`, `/export`, `/adjust` |
| Xử lý phiếu | `POST /api/inventory/transactions/:id/confirm`, `/cancel`, `/reverse` |
| Tổng quan | `/api/dashboard/summary`, `/api/dashboard/charts` |
| Báo cáo | `/api/reports/employees`, `/customers`, `/products`, `/inventory`, thêm `/export` để tải file Excel (.xlsx) |
| Cài đặt | `GET` và `PUT /api/settings` |

## Triển khai lên Cloudflare

```bash
npx wrangler login
npx wrangler d1 create mini-business-manager
```

1. Chép `database_id` vừa nhận vào `wrangler.jsonc`.
2. Tạo khóa bí mật và lưu lại ở nơi an toàn. Mất khóa này thì mọi mật khẩu đã lưu không còn dùng được.

   ```bash
   openssl rand -base64 32
   npx wrangler secret put PASSWORD_PEPPER
   ```

3. Chạy migration:

   ```bash
   npm run db:migrate:remote
   ```

4. Sao chép `.env.example` thành `.env`, điền `ADMIN_USERNAME`, `ADMIN_PASSWORD` và `PASSWORD_PEPPER` (cùng giá trị ở bước 2), rồi tạo tài khoản:

   ```bash
   npm run admin:create:remote
   ```

5. Triển khai:

   ```bash
   npm run deploy
   ```

6. Chỉ khi dựng bản trình diễn cho khách hàng, thêm dữ liệu demo vào database còn trống. Lệnh này không tạo tài khoản:

   ```bash
   npm run db:seed:demo:remote
   ```

Chạy lại `admin:create:remote` sẽ đặt lại mật khẩu quản trị và đăng xuất mọi thiết bị, nên đây cũng là cách khôi phục khi quên mật khẩu.

Sau lần deploy đầu, hãy thử đăng nhập, đổi mật khẩu và xuất một file Excel lớn để xác nhận các thao tác này nằm trong giới hạn CPU của gói Free.

## Xuất Excel

Mọi nút **Xuất Excel** (danh sách nhân viên, khách hàng, sản phẩm, phiếu kho và các báo cáo) tải về file `.xlsx` theo bộ lọc đang chọn, tối đa 2.000 dòng:

- Tiền và số lượng là số thật (định dạng `1.250.000`), cộng trừ được ngay; ngày là ngày thật nên sắp xếp, lọc theo ngày được.
- Mã, số điện thoại, mã số thuế giữ nguyên số 0 ở đầu.
- Dòng tiêu đề in đậm, cố định khi cuộn và có sẵn nút lọc; độ rộng cột tự vừa nội dung.

File được tạo trong Worker bằng bộ ghi tự viết (`src/worker/lib/xlsx.ts`, không nén, không thư viện ngoài) để giữ CPU thấp: khoảng 1 ms cho 200 dòng và khoảng 9 ms cho 2.000 dòng × 14 cột (đo trên máy phát triển).

## Phiếu xuất kho bán hàng (PDF)

Mở một phiếu xuất kho đã xác nhận, giao cho khách hàng và chưa bị đảo ngược, rồi bấm **In phiếu xuất kho (PDF)**. File `phieu-xuat-kho-<mã phiếu>.pdf` (một trang A4, theo mẫu chứng từ kế toán) gồm:

- Tên, địa chỉ, điện thoại, MST công ty (lấy từ Cài đặt, kể cả logo); tiêu đề, ngày, số phiếu.
- Người mua, tên khách hàng, địa chỉ, điện thoại, MST, diễn giải, nhân viên bán hàng (để trống, ghi tay); Nợ 131 / Có 5111 / Loại tiền VND.
- Bảng hàng hoá (tối thiểu 15 dòng, dòng thừa để trống), dòng Cộng, Cộng tiền hàng, số tiền viết bằng chữ (dạng "... ngàn đồng chẵn").
- Số chứng từ gốc kèm theo (lấy từ ô Tham chiếu của phiếu) và chỗ ký của Người mua hàng, Kế toán trưởng, Giám đốc.

PDF được tạo ngay trên trình duyệt bằng `pdfmake` (font Roboto có đủ tiếng Việt), nên không tốn CPU của Worker; thư viện chỉ được tải khi bấm nút. Phiếu xuất cho nhân viên và phiếu đã đảo ngược không in được vì không phải doanh thu. Đây là chứng từ nội bộ, không thay thế hoá đơn điện tử (GTGT) theo quy định.

## Sao lưu và phục hồi

```bash
# Xuất toàn bộ database ra file
npx wrangler d1 export mini-business-manager --remote --output=backup.sql

# Sắp xếp lại file sao lưu (file xuất trực tiếp không nạp lại được)
npm run db:prepare-restore -- backup.sql restore.sql

# Khôi phục vào một database MỚI, rồi kiểm tra trước khi chuyển sang dùng
npx wrangler d1 create mini-business-manager-restore
npx wrangler d1 execute mini-business-manager-restore --remote --file=restore.sql

# Quay lại một thời điểm trong 7 ngày gần nhất (gói Free)
npx wrangler d1 time-travel info mini-business-manager
npx wrangler d1 time-travel restore mini-business-manager --timestamp=<UNIX_TIMESTAMP>
```

File sao lưu chứa dữ liệu cá nhân và mã băm mật khẩu, cần được bảo quản như dữ liệu mật.

## Giới hạn Cloudflare Free

Theo tài liệu Cloudflare, kiểm tra ngày 18/11/2026. Hãy xem lại trước khi cam kết với khách hàng.

| Hạng mục | Giới hạn |
| --- | --- |
| Request Worker | 100.000 mỗi ngày |
| CPU | 10 ms mỗi request |
| Truy vấn D1 | 50 mỗi lần gọi Worker |
| Tham số mỗi câu lệnh D1 | 100 |
| D1 đọc / ghi | 5 triệu / 100.000 dòng mỗi ngày |
| Dung lượng một database | 500 MB |
| File tĩnh | Không giới hạn request, không gọi Worker |

Để nằm trong các giới hạn này: mỗi phiếu kho có tối đa 50 dòng, mỗi file Excel tối đa 2.000 dòng, khoảng ngày thống kê tối đa 366 ngày, ảnh được thu nhỏ trong trình duyệt và biểu đồ chỉ tải khi cần.

## Bảo mật

- Mật khẩu băm bằng PBKDF2-SHA256 với salt riêng và khóa bí mật `PASSWORD_PEPPER` nằm ngoài database.
- Số vòng lặp là 25.000 để nằm trong giới hạn CPU của gói Free. Mức này thấp hơn khuyến nghị cho PBKDF2 dùng đơn lẻ, nên khóa bí mật là bắt buộc. Có thể tăng `PBKDF2_ITERATIONS` khi dùng gói trả phí; mật khẩu cũ vẫn đăng nhập được.
- Phiên đăng nhập dùng cookie `HttpOnly`, `SameSite=Strict`, thêm `Secure` và tiền tố `__Host-` trên production. Database chỉ lưu mã băm của token.
- Mọi API đều yêu cầu đăng nhập, trừ `/api/health` và `/api/auth/login`. Request thay đổi dữ liệu phải có `Origin` đúng tên miền.
- Đăng nhập giới hạn 5 lần mỗi 15 phút theo IP và 20 lần theo tài khoản.
- Toàn bộ dữ liệu vào được kiểm tra ở backend, truy vấn dùng tham số ràng buộc, và file Excel ghi mọi ô chữ dưới dạng văn bản nên không chạy được công thức chèn vào.

## Quy tắc tồn kho

Các quy tắc nằm trong trigger của `migrations/0001_inventory_rules.sql` và `migrations/0002_inventory_hardening.sql`, nên có hiệu lực với mọi đoạn code:

- Tồn kho chỉ thay đổi khi phiếu chuyển từ nháp sang xác nhận.
- Tồn kho không thể âm; phiếu vi phạm bị hủy toàn bộ, kể cả khi hai lệnh xuất đến cùng lúc.
- Phiếu xuất phải có một người nhận là khách hàng hoặc nhân viên trước khi xác nhận; phiếu nháp có thể bổ sung sau.
- Phiếu đã xác nhận không sửa hoặc xóa được, muốn sửa sai phải tạo phiếu đảo ngược hoặc điều chỉnh.
- Phiếu đảo ngược phải triệt tiêu đúng từng dòng của một phiếu đã xác nhận. Loại phiếu không đổi được sau khi tạo.
- Số tồn luôn phải bằng tổng các dòng đã xác nhận trong lịch sử, và dòng tồn kho không xóa được khi sản phẩm còn tồn tại.
- Số lượng và tiền phải là số nguyên.
- Sản phẩm đã có giao dịch kho không xóa được, kể cả xóa mềm; hãy chuyển sang trạng thái ngừng kinh doanh.

Doanh thu là thành tiền của các phiếu xuất đã xác nhận, không tính phiếu đã đảo ngược và phiếu xuất cho nhân viên. Lợi nhuận gộp là doanh thu trừ giá vốn, với giá vốn là giá nhập của sản phẩm tại lúc xác nhận phiếu. Số này chưa trừ lương, mặt bằng và các chi phí khác.

Giá trị tồn kho được tính bằng số lượng tồn nhân với giá nhập hiện tại của sản phẩm. Vì vậy, khi đổi giá nhập, giá trị tồn và đường giá trị trong quá khứ trên biểu đồ đều tính theo giá mới. Phiếu đã đảo ngược không tính vào tổng nhập, tổng xuất.
