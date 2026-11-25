# Mini Business Manager

Phần mềm quản lý nội bộ cho công ty nhỏ khoảng 10 nhân viên, chạy trên Cloudflare Workers và D1. Giao diện hoàn toàn bằng tiếng Việt, nhiều tài khoản đăng nhập với phân quyền theo vai trò (Admin / Nhân viên).

Các module: Tổng quan, Nhân viên, Khách hàng, Sản phẩm, Quản lý kho, Báo cáo, Người dùng, Nhật ký hoạt động, Cài đặt và trang Hướng dẫn sử dụng (`src/client/pages/guide-page.tsx`, mỗi vai trò chỉ thấy mục của chức năng mình được dùng; khi đổi nghiệp vụ nhớ cập nhật trang này).

## Chạy trên máy

Cần Node.js 22 trở lên.

```bash
npm install
npm run setup   # tạo .dev.vars, chạy migration, tạo tài khoản và dữ liệu demo
npm run dev
```

Mở http://localhost:5173/management/ (mở gốc `/` sẽ tự chuyển vào đó).

Tài khoản demo chỉ dành cho phát triển: `admin` / `admin` (Admin) và `nhanvien` / `nhanvien` (Nhân viên, gắn với NV0006). Lệnh tạo tài khoản production từ chối mật khẩu demo và yêu cầu mật khẩu từ 12 ký tự.

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

### Tên miền và tiền tố `/management`

Bản production chạy tại **https://led-leman.com/management**, dùng chung tên miền với website bán hàng LeMan (một Worker khác). `routes` trong `wrangler.jsonc` chỉ đưa `led-leman.com/management*` về Worker này, phần còn lại của tên miền vẫn là website bán hàng.

- Tiền tố khai báo một chỗ trong `src/shared/base-path.ts` (`BASE_PATH`). React Router dùng nó làm `basename`, và client gọi API qua `/management/api/*`.
- `src/worker/index.ts` bỏ tiền tố trước khi chuyển cho Hono, nên trong code và test API vẫn là `/api/*`.
- File tĩnh nằm dưới `/management/` (`build.assetsDir` trong `vite.config.ts`, thư mục `public/management/`). Khi thêm ảnh hay file vào `public`, hãy đặt vào `public/management/` và tham chiếu bằng `` `${BASE_PATH}/...` ``.
- Đổi tiền tố thì sửa `BASE_PATH`, `assetsDir`, thư mục `public/management`, `index.html`, `public/_headers` và `routes` / `run_worker_first` trong `wrangler.jsonc`.

Chạy lại `admin:create:remote` sẽ đặt lại mật khẩu của tài khoản số 1, đưa nó về Admin đang hoạt động và đăng xuất mọi thiết bị, nên đây cũng là cách khôi phục khi quên mật khẩu hoặc lỡ khoá hết tài khoản Admin. Các tài khoản khác do Admin tạo trong màn hình **Người dùng**.

Sau lần deploy đầu, hãy thử đăng nhập, đổi mật khẩu và xuất một file Excel lớn để xác nhận các thao tác này nằm trong giới hạn CPU của gói Free.

## Phân quyền và nhật ký hoạt động

Quyền được định nghĩa ở một chỗ duy nhất, `src/shared/permissions.ts`, dùng cho cả server (chặn API) và giao diện (ẩn menu, chuyển trang).

| Vai trò | Được dùng |
| --- | --- |
| **Admin** | Toàn bộ hệ thống, gồm Người dùng, Nhật ký hoạt động, Cài đặt |
| **Nhân viên** | Khách hàng, Sản phẩm, Quản lý kho. Chỉ thấy khách hàng được phân công cho hồ sơ nhân viên của mình (ô Nhân viên chăm sóc) hoặc do chính mình tạo; khách ngoài phạm vi trả về "không tìm thấy". Khách mới tự giao cho chính mình; chỉ Admin phân công lại. Không được thêm khách VIP (Nhà phân phối), nâng khách lên VIP hay đổi hạng của khách VIP. Phiếu xuất chỉ cho khách trong phạm vi, không xuất cho nhân viên khác. |

- **Người dùng** (Admin): tạo tài khoản, chọn vai trò, gắn với hồ sơ nhân viên (mỗi nhân viên tối đa một tài khoản), khoá / mở khoá, đặt lại mật khẩu. Tài khoản không bị xoá để nhật ký giữ tên người làm. Hệ thống luôn giữ ít nhất một Admin đang hoạt động; không ai tự khoá hay tự hạ quyền mình.
- **Ai làm, lúc nào:** nhân viên, khách hàng, sản phẩm, danh mục lưu `created_by` / `updated_by`; phiếu kho thêm `confirmed_by`. Cửa sổ chi tiết hiện "Tạo bởi … · thời gian" và "Sửa lần cuối …"; danh sách phiếu kho có cột Người lập. Dữ liệu cũ được điền lại từ nhật ký khi chạy migration 0010.
- **Nhật ký hoạt động** (Admin): mọi thao tác thêm / sửa / xoá, lập / xác nhận / huỷ / đảo ngược phiếu, đăng nhập, đổi mật khẩu, quản lý tài khoản; lọc theo người, đối tượng, khoảng ngày; xuất Excel. Admin còn thấy "Lịch sử thay đổi" trong cửa sổ chi tiết từng bản ghi.
- **Nhật ký chỉ giữ 30 ngày gần nhất** (`AUDIT_RETENTION_DAYS` trong `src/shared/audit.ts`). Cron Trigger trong `wrangler.jsonc` chạy lúc 02:00 giờ Việt Nam mỗi ngày (`scheduled` trong `src/worker/index.ts`), xoá nhật ký cũ hơn 30 ngày cùng phiên đăng nhập hết hạn. Người tạo / sửa cuối trên bản ghi và lần đăng nhập cuối của tài khoản lưu riêng nên không mất. Cần giữ lâu hơn thì xuất Excel nhật ký trước khi hết hạn. Cron chỉ chạy trên bản đã deploy; khi phát triển, test `tests/maintenance.test.ts` gọi trực tiếp tác vụ này.
- Mọi tài khoản tự đổi mật khẩu ở **Tài khoản của tôi** (menu ở góc phải).

Thêm vai trò mới: khai báo trong `ROLES`, `ROLE_LABELS`, `ROLE_MODULES` của `src/shared/permissions.ts` và cập nhật CHECK `admin_users_role_check` bằng một migration.

## Khách hàng: hạng và nhân viên chăm sóc

- **Hạng khách hàng** theo kênh bán: **VIP (Nhà phân phối)**, **Bình thường (Đại lý)**, **Cơ bản (Khách lẻ)**. Khách mới mặc định là Bình thường. Sắp xếp cột Hạng giảm dần để đưa nhà phân phối lên đầu.
- **Nhân viên chăm sóc** (không bắt buộc): chọn trong form khách hàng, lọc danh sách theo nhân viên, xem ở cột "NV chăm sóc", trong file Excel, và mục "Khách hàng phụ trách" ở chi tiết nhân viên. Xoá một nhân viên thì các khách họ phụ trách trở về "Chưa phân công".

## Giá bán theo hạng khách hàng

Mỗi sản phẩm có **Giá phân phối**, **Giá đại lý** và **Giá khách lẻ**. Để trống giá phân phối / đại lý nghĩa là bằng giá lẻ (lưu NULL, tính lúc dùng, nên đổi giá lẻ thì hai giá này đổi theo).

Khi lập phiếu xuất, đơn giá tự điền theo hạng của khách nhận hàng: VIP → giá phân phối, Bình thường → giá đại lý, Cơ bản → giá lẻ; xuất cho nhân viên dùng giá lẻ. Đổi khách thì các dòng tự cập nhật, trừ dòng đã gõ giá tay (xoá trống ô giá để quay về giá theo hạng). Server áp dụng cùng quy tắc (`src/shared/pricing.ts`) khi một dòng không có đơn giá.

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
- Mọi API đều yêu cầu đăng nhập, trừ `/api/health` và `/api/auth/login`, và được chặn theo vai trò ở server (`requireModule`), không chỉ ẩn trên giao diện. Request thay đổi dữ liệu phải có `Origin` đúng tên miền.
- Tài khoản bị khoá không đăng nhập được và mất phiên ngay lập tức; đặt lại mật khẩu đăng xuất người đó khỏi mọi thiết bị.
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
